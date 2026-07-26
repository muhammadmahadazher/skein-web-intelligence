# Security policy

Skein is designed for hostile-network conditions, but responsible disclosure
still matters.

## Supported versions

Security fixes are made on the latest `main` branch. Until stable releases are
tagged, no older snapshot is guaranteed to receive fixes.

## Report a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's
**Security → Report a vulnerability** private reporting flow:

<https://github.com/muhammadmahadazher/skein-web-intelligence/security/advisories/new>

Include the affected version or commit, impact, reproduction steps, and a
minimal proof of concept. Please avoid accessing data that is not yours,
disrupting services, or publishing the issue before a fix is available.

## Security boundaries

Skein rejects non-HTTP(S) schemes, userinfo, localhost, private/link-local/
loopback destinations, unsafe redirects, and DNS resolutions that cross policy
boundaries. It also enforces robots policy, request timeouts, response-body
limits, and bounded crawl scope.

Device-local accounts are a convenience boundary for local use, not a
multi-tenant server identity system. Password proofs are salted and derived in
the browser; no password is transmitted to the crawler API.

See the full [threat model](docs/threat-model.md).
