"""Pure crawler-domain rules.

This module intentionally has no framework or database dependency. Every network
boundary calls these functions, and their unit/property tests run in milliseconds.
"""

from __future__ import annotations

import hashlib
import ipaddress
import posixpath
import random
import re
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from urllib.parse import parse_qsl, quote, urlencode, urlsplit, urlunsplit

MAX_URL_BYTES = 8_192
TRACKING_KEYS = frozenset(
    {
        "fbclid",
        "gclid",
        "mc_cid",
        "mc_eid",
        "ref_src",
        "utm_campaign",
        "utm_content",
        "utm_medium",
        "utm_source",
        "utm_term",
    }
)
HOST_LABEL = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")


class UrlRejected(ValueError):
    """The seed cannot safely enter the crawl frontier."""


class ResolutionRejected(ValueError):
    """DNS resolved to an address that fetchers must never contact."""


class LeaseRejected(ValueError):
    """A worker attempted to mutate a lease it does not own."""


class RetryClass(StrEnum):
    RETRY = "retry"
    COMPLETE = "complete"
    PERMANENT_FAILURE = "permanent_failure"


@dataclass(frozen=True, slots=True)
class CanonicalUrl:
    value: str
    host: str
    fingerprint: bytes


@dataclass(frozen=True, slots=True)
class CrawlPolicy:
    max_depth: int = 4
    max_pages: int = 50_000
    max_body_bytes: int = 16 * 1024 * 1024
    max_redirects: int = 5
    request_timeout_seconds: float = 20.0
    host_requests_per_second: float = 2.0
    obey_robots: bool = True

    def __post_init__(self) -> None:
        if not 0 <= self.max_depth <= 32:
            raise ValueError("max_depth must be between 0 and 32")
        if not 1 <= self.max_pages <= 10_000_000:
            raise ValueError("max_pages must be between 1 and 10,000,000")
        if not 1_024 <= self.max_body_bytes <= 128 * 1024 * 1024:
            raise ValueError("max_body_bytes must be between 1 KiB and 128 MiB")
        if not 0 <= self.max_redirects <= 20:
            raise ValueError("max_redirects must be between 0 and 20")
        if not 0.1 <= self.host_requests_per_second <= 100:
            raise ValueError("host_requests_per_second must be between 0.1 and 100")


@dataclass(frozen=True, slots=True)
class Lease:
    owner: str
    leased_until: datetime

    def assert_owned(self, worker_id: str, *, now: datetime | None = None) -> None:
        instant = now or datetime.now(UTC)
        if worker_id != self.owner:
            raise LeaseRejected("worker is not the lease owner")
        if instant >= self.leased_until:
            raise LeaseRejected("lease has expired")


def canonicalize_url(raw: str, *, strip_tracking: bool = True) -> CanonicalUrl:
    """Return a stable, fragment-free HTTP(S) URL and its SHA-256 fingerprint."""

    value = raw.strip()
    if not value or len(value.encode("utf-8")) > MAX_URL_BYTES:
        raise UrlRejected("URL is empty or exceeds 8 KiB")
    try:
        parts = urlsplit(value)
    except ValueError as exc:
        raise UrlRejected("URL could not be parsed") from exc
    scheme = parts.scheme.lower()
    if scheme not in {"http", "https"}:
        raise UrlRejected("only HTTP and HTTPS are allowed")
    if parts.username is not None or parts.password is not None:
        raise UrlRejected("embedded credentials are not allowed")
    if not parts.hostname:
        raise UrlRejected("hostname is required")
    try:
        host = parts.hostname.encode("idna").decode("ascii").lower().rstrip(".")
    except UnicodeError as exc:
        raise UrlRejected("hostname is not valid IDNA") from exc
    labels = host.split(".")
    if len(host) > 253 or any(not HOST_LABEL.fullmatch(label) for label in labels):
        raise UrlRejected("hostname has an invalid label")
    if host == "localhost" or host.endswith(".localhost") or host.endswith(".local"):
        raise UrlRejected("local hostnames are not allowed")
    try:
        literal = ipaddress.ip_address(host.strip("[]"))
    except ValueError:
        literal = None
    if literal is not None and not is_public_ip(literal):
        raise UrlRejected("non-public literal IP is not allowed")
    try:
        port = parts.port
    except ValueError as exc:
        raise UrlRejected("port is invalid") from exc
    if port is not None and not 1 <= port <= 65_535:
        raise UrlRejected("port is out of range")
    default_port = (scheme == "http" and port == 80) or (scheme == "https" and port == 443)
    display_host = f"[{host}]" if ":" in host else host
    netloc = display_host if port is None or default_port else f"{display_host}:{port}"
    decoded_path = parts.path or "/"
    normalized_path = posixpath.normpath(decoded_path)
    if decoded_path.endswith("/") and not normalized_path.endswith("/"):
        normalized_path += "/"
    if not normalized_path.startswith("/"):
        normalized_path = f"/{normalized_path}"
    path = quote(normalized_path, safe="/:@!$&'()*+,;=-._~%")
    query_pairs = parse_qsl(parts.query, keep_blank_values=True, max_num_fields=2_000)
    if strip_tracking:
        query_pairs = [(key, val) for key, val in query_pairs if key.lower() not in TRACKING_KEYS]
    query = urlencode(sorted(query_pairs), doseq=True)
    canonical = urlunsplit((scheme, netloc, path, query, ""))
    return CanonicalUrl(
        value=canonical,
        host=host,
        fingerprint=hashlib.sha256(canonical.encode("utf-8")).digest(),
    )


def is_public_ip(value: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """Fail closed for private, loopback, link-local, reserved, and unspecified IPs."""

    return bool(value.is_global and not value.is_multicast)


def validate_resolution(addresses: Iterable[str]) -> tuple[str, ...]:
    """Validate *all* DNS answers. Re-run this immediately before every connect."""

    parsed: list[str] = []
    for raw in addresses:
        try:
            address = ipaddress.ip_address(raw)
        except ValueError as exc:
            raise ResolutionRejected(f"resolver returned invalid address: {raw}") from exc
        if not is_public_ip(address):
            raise ResolutionRejected(f"resolver returned non-public address: {address}")
        parsed.append(address.compressed)
    if not parsed:
        raise ResolutionRejected("hostname resolved to no addresses")
    return tuple(sorted(set(parsed)))


def retry_class(status_code: int | None, *, network_error: bool = False) -> RetryClass:
    if (
        network_error
        or status_code in {408, 425, 429}
        or (status_code is not None and 500 <= status_code <= 599)
    ):
        return RetryClass.RETRY
    if status_code is not None and 200 <= status_code <= 399:
        return RetryClass.COMPLETE
    return RetryClass.PERMANENT_FAILURE


def full_jitter_delay(
    attempt: int,
    *,
    base: timedelta = timedelta(seconds=1),
    cap: timedelta = timedelta(minutes=15),
    rng: random.Random | None = None,
) -> timedelta:
    if attempt < 0:
        raise ValueError("attempt cannot be negative")
    ceiling = min(cap.total_seconds(), base.total_seconds() * (2**attempt))
    return timedelta(seconds=(rng or random.SystemRandom()).uniform(0, ceiling))


def assert_content_length(length: int | None, policy: CrawlPolicy) -> None:
    if length is not None and (length < 0 or length > policy.max_body_bytes):
        raise ValueError("response body exceeds configured limit")
