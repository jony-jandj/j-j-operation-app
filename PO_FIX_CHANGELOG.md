# P.O. approval fix — 2026-09-20

- An earlier pending save no longer acknowledges an approval made afterward.
- Cloud refreshes wait while local saves are pending.
- Overlapping updated clients use conditional saves and retry conflicts.
- Cloud failures show Not synced instead of falsely claiming Saved.
- Database update supports Approve and Undo Approval for existing authorized accounts and distinguishes identical P.O. IDs in different projects.


Validation: automated isolated checks passed for approval during an in-flight save, follow-up persistence, delayed poll, realtime during save, conflict retry, undo, rejected saves, and JavaScript parsing. SQL migration requires live installation and verification.
