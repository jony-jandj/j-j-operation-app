IN-HOUSE FASTER OPENING — November 15, 2026

Small follow-up to the combined reliability release already published at
commit e6b2f7086025b11435a4a8bfbc59e9a6ee87d4d2. No database update required.

What changes:
- In-house/Bills/Closeout opens its title and loading state immediately.
- If payment records are already in memory, show that preview immediately
  while checking current cloud balances. No new persistent financial cache.
- Clearly label previously loaded figures. Disable payment/printing/filter
  controls until fresh records arrive; keep Back available.
- On a failed read, retain the preview with an inline Retry loading button.
- Rapid view changes reuse the pending cloud read and keep the newest view.

The cloud request itself still takes the connection's normal response time.
This removes the blank/stale-screen wait, not the underlying network delay.

Local checks passed: slow first open, immediate cached preview, disabled
payment actions, failed-read/retry, rapid navigation, no payment writes,
partial Closeout/Bills reconciliation, rapid crew input, approval ordering,
retry retention and existing release-feature checks.

Install: upload CONTENTS of web-files/ to the existing GitHub app root,
replacing only work-pay.js and service-worker.js. Retain all other files.
Wait for publishing, finish any open edits and confirm they saved before
refreshing. Verify on actual phone/iPad after installation.

Status: prepared and tested locally; not uploaded or live.
