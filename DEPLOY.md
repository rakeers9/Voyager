# Vercel Deploy Notes

Things to keep in mind when deploying TRIPSITR to Vercel and after.

---

## 1. Environment variables

Set these in **Vercel → Project → Settings → Environment Variables** for **Production, Preview, and Development**. Names and exposure rules below.

| Name | Exposure | Used by | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + Server | All Supabase reads/writes | Safe to expose |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser + Server | Auth + RLS-gated queries | Safe to expose; relies on RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** | `/api/public/trips/[tripId]` (read-only share link, bypasses RLS) | **NEVER prefix with `NEXT_PUBLIC_`**. Leak = full DB access. |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Browser + Server | Basemap (client) + `/api/directions` (server) | Mapbox tokens are public-safe; restrict by URL allowlist (see §3) |
| `GOOGLE_PLACES_API_KEY` | **Server only** | `/api/geocode`, `/api/places/details`, `/api/places/photo` | Restrict by API + HTTP referrer in Google Cloud Console |
| `GEMINI_API_KEY` | **Server only** | `/api/chat` | Restrict in Google AI Studio if possible; rate-limited per key |

**Rule of thumb**: anything prefixed `NEXT_PUBLIC_*` is shipped to every browser. Anything else stays on the server. Don't rename a server-only var to `NEXT_PUBLIC_*` to "fix" a missing-var error — it's almost certainly a server-side caller and renaming exposes the secret.

---

## 2. Supabase setup

### Auth redirect URLs
After first deploy, go to **Supabase Dashboard → Authentication → URL Configuration → Redirect URLs** and add:
- `https://<your-vercel-domain>/api/auth/callback`
- `https://<your-vercel-domain>/**` (wildcard — allows post-confirm redirects to any page)
- For preview deploys, also add `https://*.vercel.app/api/auth/callback` (or per-branch URLs you actually use)
- Keep `http://localhost:3000/api/auth/callback` for local dev

If you skip this, signup confirmation links and OAuth callbacks bounce back to `/login?error=auth`.

### Site URL
Set **Site URL** to the production domain. This is used in templated emails (password reset, confirmations).

### Row-Level Security (RLS)
The schema in `supabase/schema.sql` ships with RLS policies on `trips`, `segments`, and `chat_messages`. **Do not disable RLS** — the anon key is exposed to the browser, so RLS is the only thing keeping users from reading each other's trips.

Service-role key bypasses RLS. It's used in exactly one place: `src/app/api/public/trips/[tripId]/route.ts`. Don't use it elsewhere unless you've thought hard about why.

### Email templates (optional polish)
Supabase's default email templates work but say "Supabase". To brand them, edit them under **Authentication → Email Templates**.

---

## 3. Mapbox

- Tokens are designed to be public; the security boundary is the **URL allowlist**.
- Go to **Mapbox account → Tokens → your public token → URL restrictions** and add:
  - `https://<your-vercel-domain>/*`
  - `https://*.vercel.app/*` (only if you want preview deploys to render the map; otherwise leave it off and previews will fail gracefully)
  - `http://localhost:*` for local dev
- Without restriction, anyone who scrapes your token can rack up bills against your account.
- The same token is used by `/api/directions` server-side — URL restrictions don't apply to server-to-server calls, so the bill protection there comes from the request volume only your app can generate.

---

## 4. Google Places

- Restrict the key in **Google Cloud Console → APIs & Services → Credentials**:
  - **Application restrictions**: HTTP referrers → add your domain. (Note: the key is server-only, so referrers are weak protection — but cheap.)
  - **API restrictions**: limit to **Places API (New)** and **Geocoding API**. Anything else is wasted attack surface.
- Set a daily budget cap and a billing alert. Place Details + Photos calls add up fast if a bot starts scraping.

---

## 5. Gemini

- The key is server-only. Don't expose it.
- The chat endpoint (`/api/chat`) is gated behind Supabase auth via the middleware → unauthenticated requests redirect to `/login`. So the key is reachable only through authenticated user sessions. Still:
  - Add a per-user rate limit if costs become a concern. Currently nothing throttles a logged-in user from spamming the chat.
  - The model is configured in `src/app/api/chat/route.ts` (currently Gemini 2.5-flash). Cheaper than other tiers but still metered.

---

## 6. In-memory caches

`/api/geocode` and `/api/directions` keep a `Map<>` cache in module scope. Implications on Vercel:
- Each cold start gets an empty cache.
- Caches are not shared across regions or invocations.
- Hit rate will be lower than local. Acceptable for now.
- If costs spike, move to **Vercel KV** (Redis) — minimal code change since the cache shape is `key → JSON`.

---

## 7. CI / lint

- `npm run lint` is currently uninitialized — running it pops an interactive prompt. Either:
  - Skip it (Vercel doesn't require it to deploy); or
  - Run `npx @next/codemod@canary next-lint-to-eslint-cli .` once locally and commit the resulting config so CI/Vercel build-time lint passes silently.
- `next lint` is deprecated in Next 16. Plan to migrate before bumping past 15.

---

## 8. Pre-existing TS errors (non-blocking)

Two files have pre-existing `'trip' is possibly 'null'` errors that don't fail the production build:
- `src/components/timeline/GanttBar.tsx:22`
- `src/components/timeline/PlaybackControls.tsx:12`

Add `if (!trip) return null;` guards if you want them gone, but they don't block deploy.

---

## 9. First-deploy smoke test

After Vercel's first deploy:

1. Open `https://<domain>/login` → sign up with a test email.
2. Open the confirmation link → land on `/`.
3. Click the chat FAB → describe a trip → "Build Trip" — confirms Gemini, Geocode, and Directions are all wired.
4. Verify the map shows road-following routes (not straight lines).
5. Pick a day in the day selector → confirm playhead jumps + scrubber narrows.
6. Inline-edit a segment title in IntelPanel → refresh → confirm it persisted.
7. Open the trip-menu → "Share Trip" → open the share URL in an incognito window → confirms `SUPABASE_SERVICE_ROLE_KEY` is set correctly.

If any step fails, the **Vercel → Deployments → [your deployment] → Functions** tab shows per-route logs. Most failures will be missing env vars or unconfigured Supabase redirect URLs.

---

## 10. Things NOT to commit

`.gitignore` already covers these, but worth re-checking before pushing:
- `.env`, `.env.local`, `.env.*` (allowed exception: `.env.example`)
- `.next/`
- `node_modules/`
- `tsconfig.tsbuildinfo`

If you've ever committed a real key by accident, **rotate it immediately** — even a 30-second exposure on a public repo is enough for a scraper to grab it.

---

## 11. Future hardening (when traffic justifies it)

- Per-user rate limiting on `/api/chat`, `/api/directions`, `/api/places/*` (Vercel Edge Middleware + KV is the easy path).
- Move in-memory caches to Vercel KV.
- Add a `robots.txt` denying `/share/*` indexing if you don't want shared trips searchable.
- CSP headers in `next.config.ts` (currently none).
- Sentry or similar for runtime error tracking (currently `console.error` only).
