"""Observable local crawler used by the Skein control plane.

The production data plane remains the Rust worker fleet.  This adapter makes the
local product genuinely useful: it crawls bounded public HTTP(S) sites, emits
progress and ETA data, and returns compact evidence records without requiring
external infrastructure.
"""

from __future__ import annotations

import asyncio
import json
import math
import socket
import time
from collections import deque
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urljoin, urlsplit
from urllib.robotparser import RobotFileParser
from uuid import UUID

import httpx

from skein.domain import (
    CanonicalUrl,
    CrawlPolicy,
    ResolutionRejected,
    UrlRejected,
    canonicalize_url,
    validate_resolution,
)

USER_AGENT = "SkeinBot/0.2 (+https://localhost; respectful local research crawler)"
HTML_TYPES = ("text/html", "application/xhtml+xml")
TERMINAL_STATES = frozenset({"complete", "failed", "cancelled"})

Resolver = Callable[[str, int], Awaitable[tuple[str, ...]]]


class BodyTooLarge(ValueError):
    """A response exceeded the configured streaming body limit."""


@dataclass(frozen=True, slots=True)
class PageEvidence:
    url: str
    status_code: int
    title: str
    description: str
    content_type: str
    word_count: int
    headings: tuple[str, ...]
    links_found: int
    structured_data_items: int
    elapsed_ms: int

    def as_dict(self) -> dict[str, Any]:
        return {
            "url": self.url,
            "status_code": self.status_code,
            "title": self.title,
            "description": self.description,
            "content_type": self.content_type,
            "word_count": self.word_count,
            "headings": list(self.headings),
            "links_found": self.links_found,
            "structured_data_items": self.structured_data_items,
            "elapsed_ms": self.elapsed_ms,
        }


@dataclass(slots=True)
class _Run:
    id: UUID
    seed_url: str
    state: str = "queued"
    phase: str = "queued"
    progress: float = 0.0
    eta_seconds: int | None = None
    discovered: int = 1
    processed: int = 0
    succeeded: int = 0
    failed: int = 0
    records: int = 0
    current_url: str | None = None
    message: str = "Waiting for a crawler slot."
    started_at: datetime | None = None
    finished_at: datetime | None = None
    results: list[PageEvidence] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    pause_gate: asyncio.Event = field(default_factory=asyncio.Event)
    cancelled: bool = False

    def __post_init__(self) -> None:
        self.pause_gate.set()

    def snapshot(self, *, include_results: bool = True) -> dict[str, Any]:
        now = self.finished_at or datetime.now(UTC)
        elapsed = max(0.0, (now - self.started_at).total_seconds()) if self.started_at else 0.0
        throughput = self.processed / elapsed if elapsed > 0 else 0.0
        return {
            "id": str(self.id),
            "seed_url": self.seed_url,
            "state": self.state,
            "phase": self.phase,
            "progress": round(self.progress, 1),
            "eta_seconds": self.eta_seconds,
            "discovered": self.discovered,
            "processed": self.processed,
            "succeeded": self.succeeded,
            "failed": self.failed,
            "records": self.records,
            "current_url": self.current_url,
            "message": self.message,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "elapsed_seconds": round(elapsed, 1),
            "throughput_pages_per_second": round(throughput, 2),
            "results": [item.as_dict() for item in self.results] if include_results else [],
            "errors": self.errors[-20:],
        }


class _DocumentParser(HTMLParser):
    def __init__(self, base_url: str) -> None:
        super().__init__(convert_charrefs=True)
        self.base_url = base_url
        self.title_parts: list[str] = []
        self.description = ""
        self.headings: list[str] = []
        self.links: list[str] = []
        self.text_parts: list[str] = []
        self.structured_data_items = 0
        self._ignored_depth = 0
        self._in_title = False
        self._in_heading = False
        self._heading_parts: list[str] = []
        self._in_json_ld = False
        self._json_ld_parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key.lower(): value or "" for key, value in attrs}
        lowered = tag.lower()
        if lowered in {"script", "style", "noscript", "svg", "template"}:
            self._ignored_depth += 1
            if lowered == "script" and values.get("type", "").lower() == "application/ld+json":
                self._in_json_ld = True
                self._json_ld_parts = []
            return
        if lowered == "title":
            self._in_title = True
        if lowered in {"h1", "h2"}:
            self._in_heading = True
            self._heading_parts = []
        if lowered == "meta":
            key = (values.get("name") or values.get("property") or "").lower()
            if key in {"description", "og:description", "twitter:description"}:
                self.description = self.description or values.get("content", "").strip()
        if lowered == "base" and values.get("href"):
            self.base_url = urljoin(self.base_url, values["href"])
        if lowered == "a" and values.get("href"):
            self.links.append(urljoin(self.base_url, values["href"]))

    def handle_endtag(self, tag: str) -> None:
        lowered = tag.lower()
        if lowered in {"script", "style", "noscript", "svg", "template"}:
            if self._in_json_ld and lowered == "script":
                try:
                    parsed = json.loads("".join(self._json_ld_parts))
                    self.structured_data_items += len(parsed) if isinstance(parsed, list) else 1
                except (json.JSONDecodeError, TypeError):
                    pass
                self._in_json_ld = False
            self._ignored_depth = max(0, self._ignored_depth - 1)
            return
        if lowered == "title":
            self._in_title = False
        if lowered in {"h1", "h2"} and self._in_heading:
            heading = " ".join(" ".join(self._heading_parts).split())
            if heading and heading not in self.headings:
                self.headings.append(heading[:240])
            self._in_heading = False

    def handle_data(self, data: str) -> None:
        if self._in_json_ld:
            self._json_ld_parts.append(data)
            return
        if self._ignored_depth:
            return
        value = " ".join(data.split())
        if not value:
            return
        if self._in_title:
            self.title_parts.append(value)
        if self._in_heading:
            self._heading_parts.append(value)
        self.text_parts.append(value)


def extract_page(
    url: str, html: str, *, status_code: int, elapsed_ms: int
) -> tuple[PageEvidence, tuple[str, ...]]:
    parser = _DocumentParser(url)
    parser.feed(html)
    parser.close()
    title = " ".join(parser.title_parts).strip()
    if not title and parser.headings:
        title = parser.headings[0]
    title = title[:300] or urlsplit(url).hostname or "Untitled page"
    text = " ".join(parser.text_parts)
    evidence = PageEvidence(
        url=url,
        status_code=status_code,
        title=title,
        description=parser.description[:500],
        content_type="text/html",
        word_count=len(text.split()),
        headings=tuple(parser.headings[:12]),
        links_found=len(parser.links),
        structured_data_items=parser.structured_data_items,
        elapsed_ms=elapsed_ms,
    )
    return evidence, tuple(parser.links)


async def system_resolver(host: str, port: int) -> tuple[str, ...]:
    loop = asyncio.get_running_loop()
    answers = await loop.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    return tuple(sorted({str(answer[4][0]) for answer in answers}))


class CrawlService:
    """Run bounded crawls and expose monotonic lifecycle snapshots."""

    def __init__(
        self,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        resolver: Resolver = system_resolver,
    ) -> None:
        self._transport = transport
        self._resolver = resolver
        self._runs: dict[UUID, _Run] = {}
        self._tasks: dict[UUID, asyncio.Task[None]] = {}

    async def close(self) -> None:
        for task in self._tasks.values():
            if not task.done():
                task.cancel()
        if self._tasks:
            await asyncio.gather(*self._tasks.values(), return_exceptions=True)

    def start(self, run_id: UUID, seed_url: str, policy: CrawlPolicy) -> None:
        run = _Run(run_id, seed_url)
        self._runs[run_id] = run
        self._tasks[run_id] = asyncio.create_task(
            self._crawl(run, policy), name=f"skein-crawl-{run_id}"
        )

    def list(self) -> list[dict[str, Any]]:
        return [
            run.snapshot(include_results=False)
            for run in sorted(
                self._runs.values(),
                key=lambda item: item.started_at or datetime.min.replace(tzinfo=UTC),
                reverse=True,
            )
        ]

    def get(self, run_id: UUID, *, include_results: bool = True) -> dict[str, Any] | None:
        run = self._runs.get(run_id)
        return run.snapshot(include_results=include_results) if run else None

    def pause(self, run_id: UUID) -> dict[str, Any] | None:
        run = self._runs.get(run_id)
        if run is None:
            return None
        if run.state == "running":
            run.state = "paused"
            run.phase = "paused"
            run.message = "Paused safely. In-flight responses were allowed to finish."
            run.eta_seconds = None
            run.pause_gate.clear()
        return run.snapshot()

    def resume(self, run_id: UUID) -> dict[str, Any] | None:
        run = self._runs.get(run_id)
        if run is None:
            return None
        if run.state == "paused":
            run.state = "running"
            run.phase = "crawling"
            run.message = "Resumed from the saved frontier."
            run.pause_gate.set()
        return run.snapshot()

    def cancel(self, run_id: UUID) -> dict[str, Any] | None:
        run = self._runs.get(run_id)
        if run is None:
            return None
        if run.state not in TERMINAL_STATES:
            run.cancelled = True
            run.pause_gate.set()
            run.state = "cancelled"
            run.phase = "cancelled"
            run.message = "Crawl cancelled. Results collected so far remain available."
            run.finished_at = datetime.now(UTC)
            run.eta_seconds = None
        return run.snapshot()

    async def _crawl(self, run: _Run, policy: CrawlPolicy) -> None:
        run.state = "running"
        run.phase = "validating"
        run.progress = 2
        run.started_at = datetime.now(UTC)
        run.message = "Validating the public network boundary."
        try:
            seed = canonicalize_url(run.seed_url)
            port = urlsplit(seed.value).port or (443 if seed.value.startswith("https:") else 80)
            validate_resolution(await self._resolver(seed.host, port))
            if run.cancelled:
                return
            run.progress = 7
            run.phase = "robots"
            run.message = "Loading robots.txt and establishing the host budget."
            timeout = httpx.Timeout(policy.request_timeout_seconds)
            limits = httpx.Limits(max_connections=8, max_keepalive_connections=4)
            async with httpx.AsyncClient(
                timeout=timeout,
                limits=limits,
                follow_redirects=False,
                headers={
                    "User-Agent": USER_AGENT,
                    "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.2",
                    "Accept-Encoding": "gzip, deflate, br",
                },
                transport=self._transport,
            ) as client:
                robots = await self._robots_policy(client, seed.value, policy)
                await self._crawl_frontier(client, run, policy, robots)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # the public web fails in more ways than a closed fixture
            run.state = "failed"
            run.phase = "failed"
            run.progress = max(run.progress, 100)
            run.eta_seconds = None
            run.message = self._public_error(exc)
            run.errors.append(run.message)
            run.finished_at = datetime.now(UTC)

    async def _robots_policy(
        self, client: httpx.AsyncClient, seed_url: str, policy: CrawlPolicy
    ) -> RobotFileParser | None:
        if not policy.obey_robots:
            return None
        parts = urlsplit(seed_url)
        robots_url = f"{parts.scheme}://{parts.netloc}/robots.txt"
        parser = RobotFileParser(robots_url)
        try:
            response = await client.get(robots_url)
            if response.status_code < 400:
                parser.parse(response.text.splitlines())
                return parser
            if response.status_code in {401, 403}:
                parser.parse(["User-agent: *", "Disallow: /"])
                return parser
            if response.status_code == 404:
                parser.parse(["User-agent: *", "Allow: /"])
                return parser
        except httpx.HTTPError:
            parser.parse(["User-agent: *", "Disallow: /"])
            return parser
        parser.parse(["User-agent: *", "Disallow: /"])
        return parser

    async def _crawl_frontier(
        self,
        client: httpx.AsyncClient,
        run: _Run,
        policy: CrawlPolicy,
        robots: RobotFileParser | None,
    ) -> None:
        seed = canonicalize_url(run.seed_url)
        frontier: deque[tuple[str, int]] = deque([(seed.value, 0)])
        seen = {seed.fingerprint}
        run.phase = "discovering"
        run.progress = 10
        run.message = "Discovering pages and estimating the remaining work."
        concurrency = max(1, min(6, math.ceil(policy.host_requests_per_second)))
        while frontier and run.processed < policy.max_pages:
            await run.pause_gate.wait()
            if run.cancelled:
                return
            batch: list[tuple[str, int]] = []
            while (
                frontier
                and len(batch) < concurrency
                and run.processed + len(batch) < policy.max_pages
            ):
                batch.append(frontier.popleft())
            batch_started = time.perf_counter()
            run.state = "running"
            run.phase = "crawling"
            fetched = await asyncio.gather(
                *[
                    self._fetch_page(client, url, policy=policy, robots=robots)
                    for url, _depth in batch
                ],
                return_exceptions=True,
            )
            for (url, depth), outcome in zip(batch, fetched, strict=True):
                if run.cancelled:
                    return
                run.current_url = url
                run.processed += 1
                if isinstance(outcome, BaseException):
                    if isinstance(outcome, asyncio.CancelledError):
                        raise outcome
                    run.failed += 1
                    run.errors.append(f"{url}: {self._public_error(outcome)}")
                elif outcome is not None:
                    evidence, links = outcome
                    run.succeeded += 1
                    run.records += 1
                    if len(run.results) < 500:
                        run.results.append(evidence)
                    if depth < policy.max_depth:
                        for raw_link in links:
                            candidate = self._in_scope(raw_link, seed.host)
                            if candidate is None or candidate.fingerprint in seen:
                                continue
                            if len(seen) >= policy.max_pages:
                                break
                            seen.add(candidate.fingerprint)
                            frontier.append((candidate.value, depth + 1))
                    run.discovered = len(seen)
                self._update_progress(run, len(frontier))
            interval = len(batch) / policy.host_requests_per_second
            remaining_delay = interval - (time.perf_counter() - batch_started)
            if remaining_delay > 0 and frontier:
                await asyncio.sleep(remaining_delay)
        if run.cancelled:
            return
        run.phase = "finalizing"
        run.progress = 96
        run.eta_seconds = 0
        run.current_url = None
        run.message = "Deduplicating evidence and sealing the result set."
        await asyncio.sleep(0)
        run.state = "complete"
        run.phase = "complete"
        run.progress = 100
        run.eta_seconds = 0
        run.finished_at = datetime.now(UTC)
        if run.succeeded:
            run.message = (
                f"Scan complete. {run.succeeded} pages produced {run.records} evidence records."
            )
        else:
            run.message = "Scan completed, but no crawlable HTML pages were returned."

    async def _fetch_page(
        self,
        client: httpx.AsyncClient,
        url: str,
        *,
        policy: CrawlPolicy,
        robots: RobotFileParser | None,
    ) -> tuple[PageEvidence, tuple[str, ...]] | None:
        if robots is not None and not robots.can_fetch(USER_AGENT, url):
            raise PermissionError("robots.txt disallows this URL")
        current = canonicalize_url(url)
        started = time.perf_counter()
        for _hop in range(policy.max_redirects + 1):
            parts = urlsplit(current.value)
            port = parts.port or (443 if parts.scheme == "https" else 80)
            validate_resolution(await self._resolver(current.host, port))
            async with client.stream("GET", current.value) as response:
                if response.is_redirect:
                    location = response.headers.get("location")
                    if not location:
                        raise httpx.HTTPStatusError(
                            "redirect omitted Location",
                            request=response.request,
                            response=response,
                        )
                    current = canonicalize_url(urljoin(current.value, location))
                    continue
                response.raise_for_status()
                content_type = response.headers.get("content-type", "").lower()
                content_length = response.headers.get("content-length")
                if content_length and int(content_length) > policy.max_body_bytes:
                    raise BodyTooLarge("response body exceeds the configured limit")
                body = bytearray()
                async for chunk in response.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > policy.max_body_bytes:
                        raise BodyTooLarge("response body exceeded the streaming limit")
                if content_type and not content_type.startswith(HTML_TYPES):
                    return None
                encoding = response.encoding or "utf-8"
                html = bytes(body).decode(encoding, errors="replace")
                if not content_type and "<html" not in html[:1000].lower():
                    return None
                elapsed_ms = round((time.perf_counter() - started) * 1000)
                return extract_page(
                    current.value,
                    html,
                    status_code=response.status_code,
                    elapsed_ms=elapsed_ms,
                )
        raise httpx.TooManyRedirects("redirect limit exceeded")

    @staticmethod
    def _in_scope(raw_url: str, seed_host: str) -> CanonicalUrl | None:
        try:
            candidate = canonicalize_url(raw_url)
        except UrlRejected:
            return None
        if candidate.host != seed_host:
            return None
        return candidate

    @staticmethod
    def _public_error(exc: BaseException) -> str:
        if isinstance(exc, ResolutionRejected):
            return "The hostname resolved outside the public internet and was blocked."
        if isinstance(exc, PermissionError):
            return str(exc)
        if isinstance(exc, BodyTooLarge):
            return str(exc)
        if isinstance(exc, httpx.TimeoutException):
            return "The website did not respond before the safety timeout."
        if isinstance(exc, httpx.HTTPStatusError):
            return f"The website returned HTTP {exc.response.status_code}."
        if isinstance(exc, httpx.RequestError):
            return "The website could not be reached from this machine."
        return str(exc) or exc.__class__.__name__

    @staticmethod
    def _update_progress(run: _Run, queued: int) -> None:
        elapsed = max(
            0.001,
            (datetime.now(UTC) - (run.started_at or datetime.now(UTC))).total_seconds(),
        )
        rate = run.processed / elapsed
        target = max(run.discovered, run.processed + queued, 1)
        raw_progress = 10 + 84 * (run.processed / target)
        run.progress = min(94, max(run.progress, raw_progress))
        run.eta_seconds = math.ceil(queued / rate) if rate > 0 and queued else 0
        if queued:
            run.message = f"Scanning {queued} discovered pages at {rate:.1f} pages per second."
        else:
            run.message = "The known frontier is drained; checking for final discoveries."
