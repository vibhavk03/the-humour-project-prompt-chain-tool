# Prompt Studio

A Next.js prompt-chain editor with Google sign-in through Supabase Auth. Only accounts whose `profiles.is_admin` field is the boolean `true` can use the workspace or generation API.

## Current phase: login first, browser saving

The app now uses Google authentication and the Supabase **publishable key**. A Supabase secret/service-role key is **not required**. Browser saving remains active until the authenticated database migration is implemented next. The previous cloud implementation and SQL file are retained as inactive preparation; do not run the earlier service-key migration for this phase.

## Run locally

1. Run `npm ci`.
2. Set these values in `.env.local` (the existing file is preserved and ignored by Git):

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
OPENAI_API_KEY=your-openai-key
```

3. Enable **Google** under Supabase Authentication → Sign-in / Providers, if not already enabled. Configure the Google client ID and secret there, not in frontend code. In the Google OAuth client, the authorized redirect URI is the callback supplied by Supabase, usually `https://your-project.supabase.co/auth/v1/callback`.
4. Under Supabase Authentication → URL Configuration, allow the app callback `http://localhost:3000/auth/callback`. If using another port or a deployed domain, add its exact `/auth/callback` URL too. Set the Site URL to the intended app URL.
5. Ensure the Google account's profile row has `id` equal to its Supabase Auth user ID and `is_admin = true`. Authenticated users must be able to select their own `is_admin` field under existing profiles RLS. The app never grants or updates admin permissions. A missing profile, missing flag, false/null flag, or failed permission lookup does not grant access; `is_superadmin` and Google metadata are not used for this check.
6. Restart with `npm run dev` and open http://localhost:3000. `/` and `/chains` require sign-in; `/login` starts the Google flow.

The development command allows up to 64 KiB of request headers because cookies from other apps on `localhost` are shared across ports. This avoids HTTP 431 errors when several local Supabase apps have saved sign-in cookies.

Google is already enabled in the currently configured Supabase project. Changing URLs/provider settings is a dashboard task if a new deployment needs it. Existing `CLIENT_ID` / `CLIENT_SECRET` entries are not needed by this app's Supabase OAuth client.

## Authentication behavior

- Google OAuth uses a PKCE callback exchange with cookie-backed sessions.
- Server page/API guards verify the user with Supabase Auth and check `profiles.is_admin` on the server. Hiding UI controls alone is not the access check.
- `proxy.ts` refreshes expiring sessions and forwards cookie updates to the response. Session responses are not publicly cached.
- App-specific auth cookie names avoid overwriting the existing humour app's login on localhost.
- OAuth return destinations are limited to this app's `/` and `/chains` routes. Cancellations and expired callbacks return to a useful sign-in error.
- Sign-out affects the current session rather than revoking the user's sessions in other projects.
- Signed-out API requests receive 401. Authenticated non-admins receive 403. Unverifiable account permissions fail closed.

## Chains and media

Create/edit/duplicate/search/delete chains; add/edit/duplicate/delete/reorder up to 20 steps; caption and illustration recipes; text or image input; text and image output; execution progress, errors, copy/download, run history; responsive editor; light/dark/system appearance.

Each account's chains and run media currently live in a separate IndexedDB database in that browser. Data survives reloads but does not sync between devices. Signing out retains saved data, which reappears when the same account signs in again. Signing in as another account opens its own browser workspace. Clearing site data removes local chains; signing in does not encrypt local browser storage.

**Import browser workspace** copies chains from the older, unscoped browser workspace into the current account workspace without overwriting existing IDs or deleting the backup. Use the same browser, hostname, and port where that older data was created. Saving is explicit, and running a chain saves its definition first. Revision checks reject stale saves from another tab.

OpenAI requests require a verified admin session. API keys remain server-only. Text/vision defaults to `gpt-4.1-mini` (override `OPENAI_CHAIN_MODEL`), and images use `gpt-image-1-mini`. Model access and credits are required. Inputs support PNG/JPEG/WebP up to 4 MB. Steps run sequentially and execution stops at the first error. Closing/refreshing interrupts execution; stale runs are labeled interrupted after 15 minutes without updates.

## Next phase: authenticated Supabase persistence

The existing `/api/studio` and `/api/studio/media` cloud endpoints are explicitly paused and cannot use a service credential. We will replace the prepared service-role access model with authenticated user sessions and RLS policies, then apply the database/Storage migration. Do not add a Supabase secret key for this login-first phase.

## Validation

```sh
npm test
npm run lint
npm run typecheck
npm run build
```

Tests cover the exact admin flag, verified sessions, denied API access, safe OAuth redirects, sign-out, account-separated IndexedDB workspaces, revision conflicts, generation behavior, and the prepared cloud adapter. Tests mock external services and spend no API credits.
