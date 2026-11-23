# Applications

## Overview

This directory contains the Next.js application workspaces.

## Subdirectories & Boundaries

- [Shopper web app](./web/README.md) serves chat, history and the streaming conversation API.
- [Evaluation management app](./management/README.md) serves the loopback evaluation report and its case evidence.
- [Shared entry-point policy](./shared/browser-security.ts) sets browser response headers and applies a fresh script nonce to each rendered page. The two apps use the same [loopback Host check](./shared/loopback-origin.ts).
