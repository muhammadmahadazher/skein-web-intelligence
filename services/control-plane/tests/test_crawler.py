from __future__ import annotations

import asyncio
from uuid import uuid4

import httpx

from skein.crawler import CrawlService, extract_page
from skein.domain import CrawlPolicy


async def public_resolver(_host: str, _port: int) -> tuple[str, ...]:
    return ("93.184.216.34",)


async def wait_for_terminal(service: CrawlService, run_id, *, deadline_seconds: float = 2.0):
    deadline = asyncio.get_running_loop().time() + deadline_seconds
    while asyncio.get_running_loop().time() < deadline:
        snapshot = service.get(run_id)
        assert snapshot is not None
        if snapshot["state"] in {"complete", "failed", "cancelled"}:
            return snapshot
        await asyncio.sleep(0.01)
    raise AssertionError("crawl did not reach a terminal state")


def test_extract_page_returns_evidence_and_normalized_links() -> None:
    evidence, links = extract_page(
        "https://example.com/products/",
        """
        <html><head>
          <title>  Example catalogue </title>
          <meta charset="utf-8">
          <meta name="description" content="A dependable catalogue.">
          <script type="application/ld+json">{"@type":"Product"}</script>
        </head><body>
          <h1>Products</h1><h2>Featured</h2>
          <p>One two three four.</p>
          <a href="../about">About</a><a href="/pricing">Pricing</a>
        </body></html>
        """,
        status_code=200,
        elapsed_ms=18,
    )

    assert evidence.title == "Example catalogue"
    assert evidence.description == "A dependable catalogue."
    assert evidence.headings == ("Products", "Featured")
    assert evidence.structured_data_items == 1
    assert evidence.links_found == 2
    assert links == ("https://example.com/about", "https://example.com/pricing")


async def test_crawl_reports_progress_eta_and_results() -> None:
    pages = {
        "/": """
            <html><head><title>Home</title></head><body>
            <h1>Home</h1><a href="/about">About</a><a href="/pricing">Pricing</a>
            </body></html>
        """,
        "/about": "<html><head><title>About</title></head><body>Our story</body></html>",
        "/pricing": "<html><head><title>Pricing</title></head><body>Plans</body></html>",
    }

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nAllow: /")
        body = pages.get(request.url.path)
        if body is None:
            return httpx.Response(404)
        return httpx.Response(200, text=body, headers={"content-type": "text/html"})

    service = CrawlService(
        transport=httpx.MockTransport(handler),
        resolver=public_resolver,
    )
    run_id = uuid4()
    service.start(
        run_id,
        "https://example.com/",
        CrawlPolicy(max_depth=2, max_pages=10, host_requests_per_second=100),
    )
    snapshot = await wait_for_terminal(service, run_id)
    await service.close()

    assert snapshot["state"] == "complete"
    assert snapshot["progress"] == 100
    assert snapshot["eta_seconds"] == 0
    assert snapshot["discovered"] == 3
    assert snapshot["processed"] == 3
    assert snapshot["succeeded"] == 3
    assert [result["title"] for result in snapshot["results"]] == ["Home", "About", "Pricing"]
    assert "Scan complete" in snapshot["message"]


async def test_crawl_respects_robots_and_preserves_partial_results() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nDisallow: /private")
        if request.url.path == "/":
            return httpx.Response(
                200,
                text='<html><title>Home</title><a href="/private">Private</a></html>',
                headers={"content-type": "text/html"},
            )
        return httpx.Response(200, text="<html><title>Secret</title></html>")

    service = CrawlService(
        transport=httpx.MockTransport(handler),
        resolver=public_resolver,
    )
    run_id = uuid4()
    service.start(
        run_id,
        "https://example.com/",
        CrawlPolicy(max_depth=2, max_pages=10, host_requests_per_second=100),
    )
    snapshot = await wait_for_terminal(service, run_id)
    await service.close()

    assert snapshot["state"] == "complete"
    assert snapshot["succeeded"] == 1
    assert snapshot["failed"] == 1
    assert any("robots.txt disallows" in error for error in snapshot["errors"])


async def test_redirects_are_revalidated_and_cross_host_links_stay_out_of_scope() -> None:
    requested: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requested.append(str(request.url))
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        if request.url.path == "/":
            return httpx.Response(302, headers={"location": "/landing"})
        return httpx.Response(
            200,
            text=(
                '<html><title>Landing</title><a href="https://outside.example/page">'
                "Outside</a></html>"
            ),
            headers={"content-type": "text/html"},
        )

    service = CrawlService(
        transport=httpx.MockTransport(handler),
        resolver=public_resolver,
    )
    run_id = uuid4()
    service.start(
        run_id,
        "https://example.com/",
        CrawlPolicy(max_pages=5, host_requests_per_second=100),
    )
    snapshot = await wait_for_terminal(service, run_id)
    await service.close()

    assert snapshot["succeeded"] == 1
    assert snapshot["discovered"] == 1
    assert any(url.endswith("/landing") for url in requested)
    assert not any("outside.example" in url for url in requested)


async def test_streaming_body_limit_contains_oversized_pages() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        return httpx.Response(
            200,
            content=b"<html>" + (b"x" * 4096) + b"</html>",
            headers={"content-type": "text/html"},
        )

    service = CrawlService(
        transport=httpx.MockTransport(handler),
        resolver=public_resolver,
    )
    run_id = uuid4()
    service.start(
        run_id,
        "https://example.com/",
        CrawlPolicy(max_pages=1, max_body_bytes=1024, host_requests_per_second=100),
    )
    snapshot = await wait_for_terminal(service, run_id)
    await service.close()

    assert snapshot["state"] == "complete"
    assert snapshot["failed"] == 1
    assert any("limit" in error for error in snapshot["errors"])


async def test_pause_resume_cancel_state_machine_is_idempotent() -> None:
    gate = asyncio.Event()

    async def slow_handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        await gate.wait()
        return httpx.Response(200, text="<html><title>Done</title></html>")

    service = CrawlService(
        transport=httpx.MockTransport(slow_handler),
        resolver=public_resolver,
    )
    run_id = uuid4()
    service.start(run_id, "https://example.com/", CrawlPolicy(max_pages=1))
    await asyncio.sleep(0)

    paused = service.pause(run_id)
    assert paused is not None
    assert paused["state"] == "paused"
    resumed = service.resume(run_id)
    assert resumed is not None
    assert resumed["state"] == "running"
    cancelled = service.cancel(run_id)
    assert cancelled is not None
    assert cancelled["state"] == "cancelled"
    assert service.cancel(run_id) == cancelled
    gate.set()
    await service.close()
