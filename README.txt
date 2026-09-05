J&J Operations — Auto User by Supabase Login

Fix:
The signed-in Supabase account is now always the app identity.

Examples:
- Adair account -> app opens as Adair
- Jony account -> app opens as Jony
- Jovani/Gio account -> app opens as Gio

This is applied AFTER shared cloud data loads, so an iPad can no longer
inherit whichever user was last saved by another device.

Also:
- currentUser is no longer treated as shared cloud data.
- Realtime updates preserve the current device's signed-in identity.
- Tablet account button updates to the signed-in person automatically.

All existing iPad polish, password reset, cloud sync, Preconstruction,
Estimate, P.O., printing, and approval features remain included.
