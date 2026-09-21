PAYOUT EDIT FIX — September 21

Fixed employee amount limits retaining the old payout after Share of payout or Line payout budget changes. The limit and employee amounts now follow the current budget. The split card amount also updates immediately. Percentages calculated from dollar entries no longer trigger a decimal-step validation error.

Employee auto-balancing, blue/yellow approval colors, the visible Split line button, and existing payment protections are included.

No SQL update needed. Extract this ZIP and upload all files and folders into your existing GitHub app repository, replacing matching files. Reopen the app after deployment. Only work-pay.js and service-worker.js changed from the previous combined release; the full app is included.

Already-approved split budgets remain locked until the relevant approvals are undone. This fix corrects stale draft-input limits; it does not alter saved approvals or payment history automatically.
