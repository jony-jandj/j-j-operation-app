J&J Operations — Create / Reset Password

Adds Create / Reset Password to the J&J sign-in screen.

Flow:
1. Enter J&J email.
2. Tap Create / Reset Password.
3. Supabase emails the user a secure recovery link.
4. Link returns to the J&J app.
5. User creates and confirms a new password.
6. User is signed into the live J&J app.

REQUIRED ONCE IN SUPABASE:
Authentication -> URL Configuration
Site URL: https://jony-jandj.github.io/j-j-operation-app/
Add the same URL under Redirect URLs.

All previous automatic-cloud and app features remain included.
