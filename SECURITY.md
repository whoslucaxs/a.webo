# Security

## Reporting a vulnerability

Please use [GitHub private vulnerability reporting](https://github.com/whoslucaxs/a.webo/security/advisories/new). Do not post exploits, invitation secrets, or private room links in public Issues.

## Encryption and metadata

a.webo uses WebRTC for transport and MLS-managed application keys for end-to-end encryption. SFrame protects media frames. A WebRTC DTLS connection by itself does not establish application end-to-end encryption. This implementation has not had a formal security audit.

The signaling server and TURN provider can observe connection metadata and traffic volume. TURN relays encrypted media when a direct connection fails. Room invitations contain a secret in the URL fragment; anyone with the full link can enter until access is changed or the room expires. Keep invitation links private.

See [README.md](README.md) and the technical documents in `web/src/docs-data/` for the current architecture.
