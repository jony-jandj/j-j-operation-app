# Split release validation — September 21, 2026

79 named checks passed, plus the legacy undo/payment regression suite.

- Copied-record and split database/browser tests: 49.
- Full application, phone/tablet/desktop layout and individual-sub print: 9.
- Hosted two-session sign-in, split editing/switching, homeowner photos and sync: 12.
- Cache replacement and offline shell: 3.
- PDF margins and pagination: 2; all 27 descriptions remain on one page in both formats.
- Upgrade tests: 4, including the exact production function fingerprint, unchanged data/permissions, repeatability, and rejection of an unexpected version.

The local tests use copies of both September 21 backups. All original 133 P.O.s and 9 completed-work records remain unchanged. The exported ledger contains zero payment records, so partial payments, mixed payments, voids and immutable history were tested with synthetic records. Hosted tests use only J&J Operations TEST and synthetic data. No production records or production database definitions were changed.

## Completed changes

- Edit each draft split directly inside its P.O., including title, description, percentage and dollars.
- Switch each split independently between employees and a sub. Add a new sub from the same editor.
- Switching preserves the line budget, sibling split and saved employee assignments.
- Save or cancel before approval. Approved/completed records remain locked; use Undo Approval first.
- Existing Work & Pay, summaries and print flows recognize the same split records.
- New cache version refreshes the updated application files.

## Production comparison

Read-only catalog queries compared production mrkvspqwqsmlnhrfllpx with test ghxtdozicougmeoajbvp. Compared 17 production and 19 test metadata entries across profiles, app_state and jj_work_pay: column names/types/defaults, RLS flags, policies, function source fingerprints, grants and triggers.

Table structures match; RLS is enabled on all three. Approval transition, staff access, Work & Pay access/read function bodies and the approval trigger match. The app_state policy difference is auth.uid() versus (SELECT auth.uid()), equivalent for these checks. Existing service-role/table ACL differences were recorded, not overwritten.

Production jj_work_pay_save fingerprint: 02e1931d7566597b1ead635533bb7937.
Test/candidate fingerprint: 15d7c128254f62dad0cdce78a8dc523d.

The production save function predates exact completed-work archives and lifecycle protection. The reviewed upgrade adds those protections and allows voided payment allocations to resolve through archived work. It preserves immutable original payment records and rejects payments above outstanding balances. Production also lacks the stage validation function and trigger.

JJ_SPLIT_RELEASE_UPGRADE.sql contains only the reviewed save-function replacement and stage guard. It preserves existing tables, records, policies, function grants and ownership. It runs in a transaction and refuses an unrecognized save-function version. This migration has been tested locally but has NOT been applied to production.

## Deployment status and limits

The package is prepared; it is not deployed. Production Supabase visibly reports exceeded usage limits and an expired grace period. Resolve/check that account condition before release to avoid service interruptions. No subscription or billing changes were made.

Mobile/tablet testing uses browser viewports, not physical-device testing. Printing was verified as PDF output, not a physical printer. No destructive tests or real payment writes were run against production.
