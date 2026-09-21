BANDWIDTH FIX

The live-sync fallback was downloading the full project state every 2.5 seconds in each visible app. It now checks only updated_at first and downloads the full state only when that timestamp is newer. Existing realtime updates, local-save guards and merge logic remain in place.

This reduces unchanged-poll traffic. It does NOT reset consumed quota or lift the current Supabase service restriction. Production usage breakdown was not available, so the exact share of traffic caused by polling has not been measured.

The project owner must restore service through Supabase billing (upgrade or applicable spend-cap change, with associated charges), or wait for its quota reset. No billing changes were made by this update.

Upload all extracted files/folders to the existing GitHub repository and reopen the app after deployment. No SQL update needed. Previous payout-edit fixes, employee auto-balancing and approval colors are included. Do not delete browser storage while service is restricted; it may contain locally saved work.
