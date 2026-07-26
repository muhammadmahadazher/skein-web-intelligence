//! Safety-critical, pure fetcher primitives.
//!
//! Network I/O is deliberately kept outside these rules so fuzz/property tests
//! can exercise URL, IP, body, and retry invariants without a runtime.

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use url::Url;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SafetyError {
    Scheme,
    Credentials,
    MissingHost,
    LocalHostname,
    NonPublicIp(IpAddr),
    RedirectLimit,
    BodyTooLarge { limit: usize, observed: usize },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Disposition {
    Complete,
    Retry,
    PermanentFailure,
}

pub fn validate_url(raw: &str) -> Result<Url, SafetyError> {
    let mut url = Url::parse(raw.trim()).map_err(|_| SafetyError::MissingHost)?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(SafetyError::Scheme);
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err(SafetyError::Credentials);
    }
    let host = url
        .host_str()
        .ok_or(SafetyError::MissingHost)?
        .to_ascii_lowercase();
    if host == "localhost" || host.ends_with(".localhost") || host.ends_with(".local") {
        return Err(SafetyError::LocalHostname);
    }
    if let Ok(ip) = host.trim_matches(['[', ']']).parse::<IpAddr>()
        && !is_public_ip(ip)
    {
        return Err(SafetyError::NonPublicIp(ip));
    }
    url.set_fragment(None);
    if (url.scheme() == "https" && url.port() == Some(443))
        || (url.scheme() == "http" && url.port() == Some(80))
    {
        let _ = url.set_port(None);
    }
    Ok(url)
}

pub fn validate_resolution(addresses: &[IpAddr]) -> Result<(), SafetyError> {
    if addresses.is_empty() {
        return Err(SafetyError::MissingHost);
    }
    for &address in addresses {
        if !is_public_ip(address) {
            return Err(SafetyError::NonPublicIp(address));
        }
    }
    Ok(())
}

pub fn is_public_ip(value: IpAddr) -> bool {
    match value {
        IpAddr::V4(ip) => is_public_v4(ip),
        IpAddr::V6(ip) => is_public_v6(ip),
    }
}

fn is_public_v4(ip: Ipv4Addr) -> bool {
    let [a, b, c, _d] = ip.octets();
    if ip.is_private()
        || ip.is_loopback()
        || ip.is_link_local()
        || ip.is_broadcast()
        || ip.is_documentation()
        || ip.is_unspecified()
        || ip.is_multicast()
    {
        return false;
    }
    !matches!(
        (a, b, c),
        (0, _, _)
            | (100, 64..=127, _)
            | (192, 0, 0)
            | (192, 0, 2)
            | (192, 88, 99)
            | (198, 18..=19, _)
            | (198, 51, 100)
            | (203, 0, 113)
            | (240..=255, _, _)
    )
}

fn is_public_v6(ip: Ipv6Addr) -> bool {
    if ip.is_loopback() || ip.is_unspecified() || ip.is_multicast() {
        return false;
    }
    let segments = ip.segments();
    let unique_local = segments[0] & 0xfe00 == 0xfc00;
    let link_local = segments[0] & 0xffc0 == 0xfe80;
    let documentation = segments[0] == 0x2001 && segments[1] == 0x0db8;
    !(unique_local || link_local || documentation)
}

pub fn disposition(status: Option<u16>, network_error: bool) -> Disposition {
    match (status, network_error) {
        (_, true) | (Some(408 | 425 | 429 | 500..=599), false) => Disposition::Retry,
        (Some(200..=399), false) => Disposition::Complete,
        _ => Disposition::PermanentFailure,
    }
}

#[derive(Debug, Clone)]
pub struct BodyAccumulator {
    limit: usize,
    bytes: Vec<u8>,
    hasher: blake3::Hasher,
}

impl BodyAccumulator {
    pub fn new(limit: usize) -> Self {
        Self {
            limit,
            bytes: Vec::with_capacity(limit.min(64 * 1024)),
            hasher: blake3::Hasher::new(),
        }
    }

    pub fn push(&mut self, chunk: &[u8]) -> Result<(), SafetyError> {
        let observed = self.bytes.len().saturating_add(chunk.len());
        if observed > self.limit {
            return Err(SafetyError::BodyTooLarge {
                limit: self.limit,
                observed,
            });
        }
        self.hasher.update(chunk);
        self.bytes.extend_from_slice(chunk);
        Ok(())
    }

    pub fn finish(self) -> (Vec<u8>, blake3::Hash) {
        (self.bytes, self.hasher.finalize())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    #[test]
    fn strips_fragment_and_default_port() {
        let url = validate_url(" HTTPS://Example.COM:443/a#fragment ").unwrap();
        assert_eq!(url.as_str(), "https://example.com/a");
    }

    #[test]
    fn blocks_metadata_and_loopback() {
        for value in [
            "http://127.0.0.1/",
            "http://169.254.169.254/latest/meta-data/",
            "http://[::1]/",
            "http://service.local/",
        ] {
            assert!(validate_url(value).is_err(), "{value}");
        }
    }

    #[test]
    fn rejects_mixed_public_private_dns_answers() {
        let answers = ["1.1.1.1".parse().unwrap(), "10.0.0.7".parse().unwrap()];
        assert!(validate_resolution(&answers).is_err());
    }

    #[test]
    fn body_limit_is_enforced_before_append() {
        let mut body = BodyAccumulator::new(5);
        body.push(b"abc").unwrap();
        assert!(matches!(
            body.push(b"def"),
            Err(SafetyError::BodyTooLarge {
                limit: 5,
                observed: 6
            })
        ));
    }

    #[test]
    fn body_hash_is_streaming_and_stable() {
        let mut body = BodyAccumulator::new(100);
        body.push(b"ske").unwrap();
        body.push(b"in").unwrap();
        let (bytes, hash) = body.finish();
        assert_eq!(bytes, b"skein");
        assert_eq!(hash, blake3::hash(b"skein"));
    }

    proptest! {
        #[test]
        fn accumulator_never_exceeds_limit(limit in 1usize..4096, chunks in proptest::collection::vec(proptest::collection::vec(any::<u8>(), 0..1024), 0..20)) {
            let mut body = BodyAccumulator::new(limit);
            for chunk in chunks {
                let result = body.push(&chunk);
                if result.is_err() {
                    break;
                }
            }
            prop_assert!(body.bytes.len() <= limit);
        }
    }
}
