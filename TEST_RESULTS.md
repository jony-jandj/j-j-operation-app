# Validation

Local tests used isolated copies of saved records and synthetic payment transactions; no production records were modified.

Passed database and browser regressions covering saved split records, approval/undo, employee/sub changes, two-client save conflicts, interrupted-save retry, exact-cent payouts, synthetic partial payments, and existing record preservation.

Direct editing checks: no Edit buttons, hover outline, every draft field opens directly, and Sub checkbox switches directly.

New input checks: wheel events are blocked on focused number fields, keyboard up/down still works, percentage display has two decimals, and a one-cent payout survives save/reopen.

Full-app checks: 1440px desktop, 768px tablet and 390px phone, stacked full-width cards on all screen sizes, gray unboxed payout hint, no card horizontal overflow, scrolling descriptions, and print output. These are browser viewport checks, not physical iPad/iPhone tests.

Print pagination: all 27 sample line descriptions stay together with safe page margins in both print formats.

App-cache checks: old cache removed, current Work & Pay cached exactly, offline shell available.

Hosted production writes and physical-device testing were not performed for this display/input update.
