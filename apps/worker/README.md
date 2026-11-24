# Shopper recovery worker

Run `pnpm db:up` to apply the migration, then run `pnpm worker` from the workspace root in a separate terminal. The worker uses Bun 1.4.4 and the shopper’s PostgreSQL database and provider configuration. For a fixture shopper, use `SHOPPER_BUILD_PROFILE=fixture pnpm worker`. Use the same profile for processes sharing a shopper database.

The worker scans on startup and every minute while running. It checks up to 32 expired running attempts per sweep, rechecks the 90-second lease under the thread lock, and atomically marks abandoned attempts interrupted and eligible for recovery. A browser history read that observes expiry sets the same durable flag. A restart between queueing and execution leaves the work available.

Each sweep takes up to eight queued turns in idle shopper threads and executes them sequentially. A manual retry or another worker can win the claim. The existing retry transaction checks the expected attempt number, clears the queue flag, and opens a new lease. A crashed worker’s lease expires in turn. After the third total attempt, another expiry requires manual Retry. Explicit cancellations, ordinary provider failures and evaluation threads receive no automatic retry.

Recovery reruns the original message on its original turn ID. It can repeat provider reads and charges. The active attempt alone can commit the answer. Refreshing the conversation loads the saved result. SIGTERM or SIGINT stops scheduling and lets the current sweep finish.

Run `pnpm test:integration` to exercise startup recovery, a real scheduled tick, competing claims, expiry limits and replay in a disposable PostgreSQL database.
