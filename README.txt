J&J Operations — Duplicate Estimate P.O. Fix

Problem fixed:
The app previously decided a P.O. already existed by comparing only the
estimate Title. That caused matching labor titles from two bathrooms to be
treated as duplicates, so some selected estimate lines never got a P.O.

New behavior:
- Parent Group is part of the P.O. source identity.
- Primary Bathroom / Demo and First Floor Bathroom / Demo are separate P.O.s.
- Matching titles can create multiple P.O.s when they come from different
  Parent Groups.
- New P.O.s store an exact sourceEstimateKey plus Parent Group.
- Existing P.O.s remain compatible.
- After installing this update, select the estimate lines that are still
  missing P.O.s and run Create Selected P.O.s again. Existing correct P.O.s
  will not be duplicated.

Preserves:
- Parent Group display on all platforms
- partial split approvals
- iPad Jobs fix
- Single Split
- expanded project colors
- menu cleanup
- cloud/password recovery

Upload/replace:
1. index.html
2. service-worker.js
