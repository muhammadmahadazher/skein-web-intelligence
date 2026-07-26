from __future__ import annotations

import ipaddress
import random
import unittest
from datetime import UTC, datetime, timedelta

from skein.domain import (
    CrawlPolicy,
    Lease,
    LeaseRejected,
    ResolutionRejected,
    RetryClass,
    UrlRejected,
    assert_content_length,
    canonicalize_url,
    full_jitter_delay,
    is_public_ip,
    retry_class,
    validate_resolution,
)


class CanonicalUrlTests(unittest.TestCase):
    def test_normalizes_case_ports_paths_query_and_fragment(self) -> None:
        result = canonicalize_url(" HTTPS://ExAmPlE.com:443/a/../b/?z=2&utm_source=x&a=1#fragment ")
        self.assertEqual(result.value, "https://example.com/b/?a=1&z=2")
        self.assertEqual(result.host, "example.com")
        self.assertEqual(len(result.fingerprint), 32)

    def test_idn_is_ascii_and_stable(self) -> None:
        result = canonicalize_url("https://bücher.example/catalog")
        self.assertEqual(result.value, "https://xn--bcher-kva.example/catalog")

    def test_credentials_and_unsafe_schemes_are_rejected(self) -> None:
        for raw in ("file:///etc/passwd", "https://user:secret@example.com/", "javascript:x"):
            with self.subTest(raw=raw), self.assertRaises(UrlRejected):
                canonicalize_url(raw)

    def test_private_literal_and_local_names_are_rejected(self) -> None:
        for raw in (
            "http://127.0.0.1/",
            "http://[::1]/",
            "http://169.254.169.254/latest/meta-data/",
            "http://service.local/",
        ):
            with self.subTest(raw=raw), self.assertRaises(UrlRejected):
                canonicalize_url(raw)


class NetworkSafetyTests(unittest.TestCase):
    def test_public_ip_classifier_fails_closed(self) -> None:
        self.assertTrue(is_public_ip(ipaddress.ip_address("1.1.1.1")))
        for raw in ("0.0.0.0", "10.0.0.1", "127.0.0.1", "169.254.1.1", "::1", "fc00::1"):
            with self.subTest(raw=raw):
                self.assertFalse(is_public_ip(ipaddress.ip_address(raw)))

    def test_all_dns_answers_must_be_public(self) -> None:
        self.assertEqual(validate_resolution(["1.1.1.1", "8.8.8.8"]), ("1.1.1.1", "8.8.8.8"))
        with self.assertRaises(ResolutionRejected):
            validate_resolution(["1.1.1.1", "10.0.0.8"])
        with self.assertRaises(ResolutionRejected):
            validate_resolution([])


class RetryAndLeaseTests(unittest.TestCase):
    def test_retry_classification(self) -> None:
        self.assertEqual(retry_class(200), RetryClass.COMPLETE)
        self.assertEqual(retry_class(304), RetryClass.COMPLETE)
        self.assertEqual(retry_class(429), RetryClass.RETRY)
        self.assertEqual(retry_class(503), RetryClass.RETRY)
        self.assertEqual(retry_class(404), RetryClass.PERMANENT_FAILURE)
        self.assertEqual(retry_class(None, network_error=True), RetryClass.RETRY)

    def test_full_jitter_stays_inside_exponential_cap(self) -> None:
        value = full_jitter_delay(3, rng=random.Random(7))
        self.assertGreaterEqual(value, timedelta())
        self.assertLessEqual(value, timedelta(seconds=8))
        capped = full_jitter_delay(30, rng=random.Random(7))
        self.assertLessEqual(capped, timedelta(minutes=15))

    def test_lease_requires_owner_and_unexpired_deadline(self) -> None:
        now = datetime.now(UTC)
        lease = Lease("worker-07", now + timedelta(seconds=20))
        lease.assert_owned("worker-07", now=now)
        with self.assertRaises(LeaseRejected):
            lease.assert_owned("worker-08", now=now)
        with self.assertRaises(LeaseRejected):
            lease.assert_owned("worker-07", now=now + timedelta(seconds=21))

    def test_policy_and_content_length_are_bounded(self) -> None:
        policy = CrawlPolicy(max_body_bytes=1024)
        assert_content_length(1024, policy)
        with self.assertRaises(ValueError):
            assert_content_length(1025, policy)


if __name__ == "__main__":
    unittest.main()
