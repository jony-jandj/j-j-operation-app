# Bandwidth fix tests

Passed four focused polling checks: unchanged polls fetch timestamps only; changed timestamps fetch/apply full state; pending saves/hidden windows skip polling; provider errors release the lock without changing records.

Passed ten full-app isolated-database checks including mobile/tablet layout and print output, plus three cache replacement/offline-shell checks. Hosted production sign-in could not be verified during the provider restriction. No production data or billing settings were changed.
