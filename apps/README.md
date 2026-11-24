# Applications

## Overview

This directory contains the shopper, evaluation dashboard and recovery worker.

## Subdirectories & Boundaries

- [Shopper web app](./web/README.md) serves chat, history and the streaming conversation API.
- [Evaluation management app](./management/README.md) serves the loopback evaluation report and its case evidence.
- [Bun recovery worker](./worker/README.md) requeues expired shopper turns and executes bounded retries.
- [Shared application security](../packages/libraries/shared/README.md) sets browser response headers, applies a fresh script nonce to each rendered page and checks loopback Host headers for both apps.
