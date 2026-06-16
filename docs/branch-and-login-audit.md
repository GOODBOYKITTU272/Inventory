# Branch & Login Audit — June 2026

This document records (1) the state of the repository's branches, (2) what was
merged, and (3) the passwordless email-link login change made on
`claude/confident-cannon-izbpl2`. It exists so the decisions below are
reviewable and reversible.

---

## 1. Branch / merge status

| Branch | Relation to current `main` | Status / action |
|---|---|---|
| `feat/cafeteria-sandwich-spread-flow` (PR #3) | normal descendant | ✅ **Merged** into `main` (merge commit `8ba303e`). Brought in the sandwich-spread flow **and** the tone-aware notifications for all order statuses. |
| `codex/cafeteria-stock-updates` | 0 ahead / behind `main` | Nothing to merge — already contained in `main`. |
| `claude/objective-ritchie-078546` | **unrelated history** (different root commit) | ⚠️ Cannot be merged normally. See §2. |
| `codex/email-otp-login` (PR #1) | **unrelated history** (different root commit) | ⚠️ PR #1 is marked "merged", but into an *orphaned* `main`, not the current one. See §2. |

## 2. The orphaned-history problem

The repository contains **two unrelated git histories**:

- Current `main` root commit: `89895d1`
- `codex/email-otp-login` / `claude/objective-ritchie-078546` root commit: `4db7bc5`

Because they share **no common ancestor**, GitHub refuses to open a normal PR
between them ("No commits between main and …"), and any merge would require
`--allow-unrelated-histories` with large conflicts.

`codex/email-otp-login` (PR #1) was merged on the *old* line (base `8a49229`),
which is **not** an ancestor of the current `main`. That old line stops at
migration `0009`; the current `main` is far ahead (migrations through `0023`,
plus the meal-box, purchases, forecasts, stock-takes and sandwich features).

**Conclusion:** the orphaned branches are an obsolete snapshot of the project.
Their code should not be merged into the current `main`. Their only lasting
value is the **product direction**: "login should be a single company-email
magic link, no passwords / no OTP input." That direction is implemented fresh
on top of the current `main` in §3 rather than by merging dead history.

## 3. Passwordless email-link login (this change)

### Before (current `main`)
- `Login.jsx` signed in with a **hardcoded shared password baked into the client
  bundle** (`'Applywizz@2026'`), then forced **Microsoft Authenticator TOTP MFA**
  (enroll + verify).
- `App.jsx` required **AAL2** on every protected route.
- The backend already had `/api/auth/start-email-login` (Supabase
  `signInWithOtp` magic link) and `/api/auth/verify-email` (Microsoft Graph
  directory gate) — but the frontend used neither for sign-in.

### After
- `frontend/src/pages/Login.jsx` — single step: enter `@applywizz.ai` email →
  the app calls `verifyEmail` (directory gate) then `startEmailLogin` (sends the
  magic link) → "check your email" screen. Returning via the link establishes a
  Supabase session that `useAuth` picks up and routes into the app.
- `frontend/src/App.jsx` — removed the `aal !== 'aal2'` route gate (a magic-link
  session is AAL1). Without this the user would have been bounced back to
  `/login` in a loop.
- `frontend/src/hooks/useAuth.js` — push auto-subscription now fires for any
  signed-in session (previously gated on AAL2, which can no longer occur).

### What this removes / keeps
- ✅ **Removes** the hardcoded shared client password (a real security smell —
  it shipped in the JS bundle).
- ✅ **Keeps** the Microsoft Graph directory gate, so only real, enabled
  `@applywizz.ai` directory members can receive a sign-in link.
- ⚠️ **Drops** the TOTP **MFA** second factor. The sign-in factor becomes
  "possession of the company mailbox" (magic link) + directory membership.
  This is a deliberate security-posture tradeoff and needs owner sign-off
  before merging to `main`.
- `InactivityLock` re-locks via TOTP; magic-link users have no TOTP factor, so
  its existing "no verified TOTP factor → fallback unlock" path makes the
  inactivity re-auth a graceful no-op. Consider replacing it with a re-send
  magic-link or simple re-login if inactivity re-auth must stay enforced.

### Deployment prerequisites (Supabase) — required before this works in prod
1. **Email provider / SMTP** configured in Supabase Auth (magic links are
   real emails).
2. **Email OTP / magic link** sign-in method enabled.
3. **Redirect URLs**: the deployed frontend origin(s) must be in Supabase Auth
   "Redirect URLs" (the backend passes the request origin as `emailRedirectTo`).
4. Backend env for the directory gate: `MS Graph` credentials so `verify-email`
   passes (otherwise it fails closed with 503 — the frontend tolerates that and
   still sends the link, but the directory gate is then effectively off).

### Verified
- `npm run build` (frontend) passes.
- No remaining references to the hardcoded password or `signInWithPassword`
  in `frontend/src`.

## 4. Recommendations for the orphaned branches
- Delete or archive `codex/email-otp-login`, `claude/objective-ritchie-078546`,
  and `codex/cafeteria-stock-updates` to stop the confusing GitHub branch list,
  once you have confirmed nothing unique on them is still needed.
