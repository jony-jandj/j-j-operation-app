# Validation

Passed finish filter checks: tile/faucets selected; labor, backerboard, rough plumbing and plywood excluded; explicit all-material fallback; checkbox appearance and uncheck clearing.

Passed estimate bulk-card checks: existing-card protection, room matching, Pending status, independent P.O. data, internal-note exclusion, repeated creation, renamed/reloaded row duplicate protection, individual selection and Clear. Full-app controls also exercised.

Passed focused lifecycle checks for both in-house and subcontractor bills: returning incomplete work, correct job/team, rejection when paid, failed-save handling, original snapshot preservation, and duplicate-action handling.

Passed full-app browser checks using isolated local data: restored Job Closeout view, sub completion into bills, Mark Incomplete return to Closeout, completion again, bill print formats, individual-company printing, Back to P.O. Splits, View all employee grouping/printing, and phone/tablet/desktop layouts (320, 390, 768 and 1440 pixels).

Passed service-worker cache replacement and offline shell checks. Feature guard checks ensure the combined release contains Closeout/Bills plus phone/View all and dollar-editing features.

No production records were modified. These are browser viewport tests, not physical-device tests. This package has not been deployed by the assistant.
