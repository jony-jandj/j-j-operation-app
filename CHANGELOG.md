# Undo Approval and summaries

- Active Work & Pay rows require a currently approved P.O.
- Subs Summary and both print formats include only approved P.O.s.
- In-house totals and employee prints use the same approval-filtered rows.
- Undo updates the current P.O. after asynchronous saves, preserving payment-history handling.
- Draft P.O.s remain in Purchase Orders for editing and reapproval.

Replace work-pay.js and service-worker.js; no new SQL.
