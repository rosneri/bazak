# Shared application security

`@bazak/shared` provides the HTTP security helpers used by the shopper and management apps.

- `@bazak/shared/browser-security` defines the common response headers and applies a per-document content security policy with a fresh nonce.
- `@bazak/shared/loopback-origin` validates the request Host header against the app's configured loopback port.
