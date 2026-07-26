# Threat model

The fetcher operates on attacker-controlled input and is treated as an untrusted-network boundary.

## Protected assets

- Cloud credentials, instance metadata, service tokens, and internal network topology.
- Customer crawl definitions and collected datasets.
- Worker availability, egress budget, and database integrity.
- Provenance and audit records used to explain how a record was produced.
- Device-local account proofs and active browser sessions.

## Primary threats and controls

| Threat | Control |
| --- | --- |
| SSRF to loopback, RFC1918, link-local, metadata, or internal DNS | Only HTTP/S; reject credentials and local names; resolve first; reject the request if any A/AAAA answer is non-public; revalidate every redirect; production adapter pins the validated address |
| DNS rebinding | Resolve and validate at connection time, pin the selected address, retain original Host/SNI, and never reuse validation across TTL boundaries |
| Redirect escape | Disable automatic redirects; cap hops; canonicalize and re-run policy, DNS, robots, and budget checks for every location |
| Decompression bomb or endless body | Cap advertised and streamed bytes; cap decoded bytes and expansion ratio; enforce idle and wall-clock deadlines |
| Slowloris or socket exhaustion | Connection, header, body-idle, and total deadlines; bounded connection pools; per-host concurrency |
| Parser exploit | Content-type allowlist; subprocess isolation; no script execution; memory/CPU/wall limits; patched parsers |
| Queue poisoning | Typed state transitions, attempt ceilings, terminal outcome codes, and a quarantine/dead-letter path |
| Lease theft/stale completion | Finish writes compare owner and deadline; expired workers cannot overwrite newer results |
| SQL injection | Bound parameters only; no user expression becomes SQL; least-privilege roles |
| Cross-tenant access | Workspace identity on every resource, authorization at the service boundary, row-level security in multi-tenant production |
| Formula injection in exports | Prefix spreadsheet control characters and offer JSON/Parquet as canonical exports |
| Sensitive data retention | Field-level classification, retention policies, deletion workflows, and redacted logs |
| Plaintext local passwords | Never persist passwords; store a unique 128-bit salt and PBKDF2-SHA-256 proof with 600,000 iterations in IndexedDB |
| Weak local passwords | Require 12+ characters, mixed case, a number, a symbol, non-personal content, and rejection of common/repeated patterns |
| Credential exfiltration | Authentication is entirely client-side; no password or proof is sent to the crawler API, telemetry, logs, or third parties |
| Session persistence on shared devices | Keep authenticated and Guest identity in `sessionStorage`; explicit sign-out clears it and closing the tab ends the session |
| Local account enumeration | Sign-in returns the same error for an unknown email and an incorrect password |
| Browser data loss | Clearly identify accounts as device-local; clearing the browser profile removes them, with no cloud recovery claim |

## Security invariants

- A fetch never begins until URL syntax, resolution, run budget, host policy, and lease ownership pass.
- A single unsafe DNS answer fails the entire resolution set.
- Bytes are counted before they are appended to memory or written to disk.
- Logs contain stable identifiers and outcome codes, never response bodies or secrets.
- Every externally visible record has immutable source and extractor lineage.
- Local account records contain only identity metadata, salt, derived proof,
  iteration count, and timestamps; never a plaintext or reversible password.

## Abuse and governance

Runs require a named owner and declared purpose. Policy presets default to robots compliance and conservative per-host rates. Large exports, policy overrides, and deletion actions are audited. A global kill switch and per-workspace egress ceiling limit blast radius.
