# Security model

This document describes how ZNIT ESG isolates tenant data, authenticates
requests, and the conventions every API contributor must follow.

## Tenant model

Every business object belongs to a **company** (`public.companies`). When a
user signs up via Clerk, they create (or are invited into) a Clerk
**Organization**, which the webhook (`/api/webhooks/clerk`) mirrors as a row
in `public.companies`. The user gets a row in `public.users` keyed by
`(clerk_user_id, clerk_org_id)` with the local `company_id` populated.

Switching organization in the Clerk UI changes `auth().orgId`, which makes
`getCurrentUser()` resolve to a different `public.users` row, scoped to a
different company. There is no path through the API that returns rows from a
company other than the one the user has currently active.

## Authentication

| Layer | Mechanism |
|---|---|
| Browser → app | Clerk session cookie (HttpOnly, set by Clerk SDK) |
| Middleware | `clerkMiddleware` in [middleware.ts](../middleware.ts) — blocks all routes except `/`, `/sign-in`, `/sign-up`, `/api/health`, `/api/webhooks/clerk`, and `/api/projects/*/powerbi/*` |
| Route handler | `getCurrentUser(req)` from [lib/server/auth.ts](../lib/server/auth.ts) — extracts Clerk session, looks up the local user row by `(clerk_user_id, clerk_org_id)`, returns `AuthUser` with `company_id` |
| PowerBI export | Shared API key `POWERBI_API_KEY` — separate from user sessions, intended for read-only ingestion |
| Clerk webhook | `svix` HMAC verified against `CLERK_WEBHOOK_SECRET` |

## Authorization (row-level)

The application connects to Supabase with the `service_role` key, which
**bypasses Postgres Row Level Security**. Authorization is therefore enforced
at the application layer:

### Rule 1 — every query on a tenanted table MUST filter by `company_id`

Tenanted tables: `companies`, `users`, `projects`, `abc_curves`, `abc_items`,
`item_mappings`, `scenarios`, `scenario_items`, `scenario_results`,
`factor_rules`, `equipment_rules`.

For root queries (e.g. listing the user's projects), pass
`.eq("company_id", user.company_id)` to the Supabase client directly.

For deep queries that key off a child ID from the URL (e.g.
`/api/scenarios/[scenarioId]`), use the helper in
[lib/server/access.ts](../lib/server/access.ts):

```ts
const user = await getCurrentUser(req);
try {
  await assertScenarioOwnership(scenarioId, user);
} catch (e) {
  if (e instanceof ForbiddenError) return forbidden(e.message);
  throw e;
}
```

`assertScenarioOwnership` resolves `scenario → project → company_id` and
throws `ForbiddenError` if it doesn't match. `assertProjectOwnership` does
the same for `projectId`.

### Rule 2 — never trust IDs from request bodies or query strings

If a route accepts a `scenario_id` or `project_id` in the body, run the
matching `assert*Ownership` check before mutating.

## Postgres RLS posture

RLS is enabled on every tenanted table in
[supabase/migration.sql](../supabase/migration.sql), but the only policy is
`USING (true)` for `service_role`. This is intentional: it makes RLS a
**second line of defense** the day we ever move off `service_role`. In the
meantime, the database trusts the application; the application enforces
isolation. See above.

If we migrate to anon/authenticated roles in the future, the migration plan
is:
1. Add policies keyed on `company_id = (auth.jwt() ->> 'org_id')::text`
2. Have the Next.js server mint a short-lived JWT per request with the
   user's `clerk_org_id` and pass it in the Supabase client's `auth` config
3. Drop the `service_role_all` policies

## Known caveats

- **PowerBI shared API key**: `POWERBI_API_KEY` is a single secret across all
  tenants. Anyone with it can read any project's PowerBI export endpoints.
  Pre-launch action: scope the key per-company or migrate to signed tokens.
- **Bcrypt + jose still in `package.json`**: leftover from the legacy auth
  path. No code uses them but they're not yet removed — schedule a cleanup
  PR.
- **`hashed_password` column**: kept nullable on `public.users` for the
  legacy seed rows. Drop the column once production data is verified to have
  `clerk_user_id` set on every row.

## Checklist for new API routes

- [ ] Calls `getCurrentUser(req)` first; returns `unauthorized()` on failure
- [ ] Filters every tenanted table query by `company_id = user.company_id`,
      either directly or via `assert*Ownership`
- [ ] Returns `forbidden(...)` on ownership mismatch, not `404` (don't leak
      whether the resource exists in another tenant)
- [ ] Validates user-supplied IDs and file uploads at the boundary
- [ ] Doesn't echo `error.message` from a database call to the client — wrap
      it
