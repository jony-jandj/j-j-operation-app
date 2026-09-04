J&J Operations — Combined Update + Undo Approval

Includes the prior combined update:
- New Project creation
- Preconstruction / P.O. printing
- Buildertrend-style Estimate without Markup

New P.O. approval behavior:
- Jony or Adair: Draft -> Pre-Approved
- Jony or Adair: Undo Pre-Approval -> Draft
- Gio: Pre-Approved -> Approved
- Gio: Undo Approval -> Pre-Approved
- An Approved P.O. cannot jump directly back to Draft

GitHub:
Upload index.html and service-worker.js and commit directly to main.

Supabase:
If the shared cloud database is already set up, also run
JJ_Supabase_Unapprove_Update.sql in the Supabase SQL Editor.
