# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start the Next.js development server
npm run lint      # Run ESLint over the repository
npm run build     # Production build and TypeScript validation
npm run start     # Serve a completed production build
npm test          # Run the Excel pairing parser tests
```

Run one parser test by name with Node's built-in test runner:

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --test-name-pattern="trùng bàn" lib/excel/parse-pairings.test.mts
```

Before considering a change complete, run `npm test`, `npm run lint`, and `npm run build`. The build catches Next.js Cache Components/prerendering errors that lint does not.

## Architecture

This is a Next.js App Router application for USCC chess referees. It is evolving from the official Next.js/Supabase starter, so starter routes under `app/auth/` and `app/protected/` coexist with the newer product routes.

### Application routes

- `/` redirects to `/login`.
- `/login` is the current Vietnamese referee login page. It signs in with Supabase, then reads the user's `profiles.role` before allowing access to `/dashboard`.
- `/dashboard` is shared by `technical` and `recorder` referees.
- `/admin` is restricted to the `technical` role.
- `/tournaments` and `/tournaments/[id]` are currently UI shells for the tournament workflow.
- `/auth/*` and `/protected` are largely inherited starter routes. Do not assume they are the canonical product flow.

There are currently two login paths: `/login` and the starter `/auth/login`. Product pages use `/login`, while the session proxy still redirects unauthenticated requests to `/auth/login`. Be deliberate when touching redirects; this should eventually be normalized rather than extended further.

### Supabase and authorization

Supabase access is split by runtime:

- `lib/supabase/client.ts`: browser client for Client Components.
- `lib/supabase/server.ts`: cookie-aware server client for Server Components and Route Handlers. Create a new client per request.
- `lib/supabase/proxy.ts` plus root `proxy.ts`: refreshes auth cookies and redirects unauthenticated requests.
- `lib/supabase/admin.ts`: server-only privileged client using `SUPABASE_SECRET_KEY`. Never import it into Client Components.
- `lib/require-referee.ts`: reusable server-side role guard for `technical` and `recorder` roles.

Authorization depends on a Supabase `profiles` table keyed by the Auth user ID. Current code expects at least:

```text
profiles.id        = auth.users.id
profiles.full_name
profiles.role      = "technical" | "recorder"
```

UI checks are not sufficient authorization. Server actions and route handlers that mutate referee data should use `requireReferee()` or perform an equivalent server-side role check; database Row Level Security remains the final boundary.

### Cache Components and authenticated pages

`next.config.ts` enables both `cacheComponents` and `partialPrefetching`. Supabase Auth uses time-dependent values internally, so authenticated Server Components must opt into request-time rendering before accessing the server client:

```tsx
import { connection } from "next/server";

async function AuthenticatedContent() {
  await connection();
  const supabase = await createClient();
  // ...
}
```

`/dashboard` and `/admin` already follow this pattern and render their content inside `Suspense`. Omitting `connection()` can produce a Next.js "Blocking Route" error involving `Date.now()` during prerendering.

### Tournament and Excel domain

The intended product flow is: create a tournament, import pairings, record a result, collect sequential confirmation from White and Black, finalize or resolve an exception, display official results, and export them for Swiss-Manager.

`lib/excel/parse-pairings.ts` is only a preliminary Chess-Results parser. It:

- reads the first worksheet;
- finds a header row where columns A/B/G are `Bàn`, `White`, and `Black`;
- reads board, player names, clubs, and source result from fixed columns;
- reports missing names and duplicate boards.

Do not treat this fixed layout as the final Swiss-Manager integration. The product requirements require a real Swiss-Manager export/import sample before its column format can be finalized.

`lib/result-rules.ts` defines the result lifecycle. Normal and resignation results require sequential White/Black confirmation; absence, forfeit, and other special results require technical approval. Bye remains blocked until a real Swiss-Manager sample and USCC result codes are agreed.

### UI

The project uses Tailwind CSS and shadcn/ui (`components/ui`) with the `@/` path alias pointing to the repository root. Reuse those components before adding another UI dependency. Product-facing copy is Vietnamese.

## Environment

Required variables are documented in `.env.example`:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
```

The secret key is server-only. Local development reads `.env.local`.
