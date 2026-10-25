# Single-session sign-in

All accounts except the protected Super Admin role (`role-main-manager`) may use one active login at a time across browsers and native apps. Multiple tabs sharing the same browser cookie share one session.

After verifying the password, another sign-in receives `409 SESSION_ALREADY_ACTIVE`. It does not revoke the existing session. The user can sign out on the original device, or choose **Close previous session and sign in** on the new sign-in screen. That action verifies the password again and atomically revokes previous cookies and bearer tokens before creating the new session. Explicit closure is audited.

Expired sessions do not block sign-in. A valid current-session reauthentication renews its token. Existing legacy duplicate sessions retain only the newest active session for ordinary users; the user's current role is checked on each authenticated request. Super Admins retain concurrent web and native access.

Protected requests reject a revoked session immediately. An open screen also checks on focus and every 30 seconds while visible, returning to sign-in when replaced. Closing a browser tab or locking the workspace is not sign-out; use Sign out or the explicit close-previous-session action.

This controls account sessions, not geographic IP locations or company assignments. It does not alter existing company/location permissions.
