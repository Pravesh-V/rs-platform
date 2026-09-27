# ReddSphere platform

Private, multi-client evidence workspace for Reddit research and campaign reporting. This repository is an **incomplete prototype**, not a completed platform. The full scope is in [docs/BUILD_BRIEF.md](docs/BUILD_BRIEF.md); actual completion and blockers are in [docs/STATUS.md](docs/STATUS.md).

The current application signs users in through Supabase, enforces client access through Postgres policies, stores client facts and campaigns, imports permissioned Reddit observations, records user-reported publication URLs, compares timestamped lifetime-view observations, and exports the same campaign evidence as CSV. It also has a manual, sourced subreddit directory and opportunity queue, versioned internal drafts with reviewer decisions, manual AI-answer and search-result observations, and internal monthly evidence snapshots. Publication URLs remain marked `user_reported` until independently verified. Approving a draft or report never publishes it. The app does not make live Reddit, AI, Google, or search-provider calls.

## Prerequisites

- Node.js 24 LTS and npm. Next.js 16 requires Node 20.9 or newer, and Vercel supports Node 24. The project pins major version 24. [Next.js requirements](https://nextjs.org/docs/app/getting-started/installation), [Vercel runtimes](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).
- An isolated **development** Supabase project with Auth and Postgres, or a local Supabase stack. The local stack needs a Docker-compatible container runtime. [Supabase local setup](https://supabase.com/docs/guides/local-development/cli/getting-started).
- An email user in Supabase Auth for the first agency owner.

This checkout was created with Node 25.9, which produced an engine warning; build and unit checks passed here, but Node 24 should be used for ongoing work. The project-scoped Supabase CLI is installed. All eleven current migrations are applied to `rs-platform-dev`. Owner login, client creation, comparison display, authenticated CSV export, the fact-review RPC, manual research authorization, draft-review authorization, campaign history, sentiment review, manual AI-answer authorization, report snapshot/approval authorization, manual search authorization, and separate Auth-user API isolation have been verified there. Two development clients, comparison campaigns, and a labelled synthetic import are present; browser import, session persistence, and protected-URL browser checks remain.

## Development setup

1. Install dependencies: `npm ci`.
2. Copy `.env.example` to `.env.local`. Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the **development** project. This publishable key is intended for browser use. Do not place a Supabase secret or service-role key in a `NEXT_PUBLIC_` variable.
3. For a fresh development project, link it with the project-scoped CLI: `npx supabase login`, `npx supabase link --project-ref YOUR_DEV_PROJECT_REF`, `npx supabase db push --dry-run`, then `npx supabase db push` after reviewing the plan. This applies the migrations in `supabase/migrations/` with migration history. The CLI may ask for the development database password; enter it in the CLI prompt, not in chat or a tracked file. [Supabase migration workflow](https://supabase.com/docs/guides/deployment/database-migrations).

   The supplied `rs-platform-dev` project already has all eleven current migrations applied through the Dashboard. Its CLI migration history is not yet synchronized. Before running `db push` against that project, link the CLI and mark versions `20260926000100`, `20260927000100`, `20260927000200`, `20260927000300`, `20260927000400`, `20260927000500`, `20260927000600`, `20260927000700`, `20260927000800`, `20260927000900`, and `20260927001000` as applied with `npx supabase migration repair VERSION --status applied` for each version, then verify with `npx supabase migration list`. Do not re-run these migrations there.
4. In Supabase Auth, create an owner user. Get its UUID and run the following **in the development project’s SQL editor**, substituting that UUID:

   ```sql
   with agency as (
     insert into public.organizations(name)
     values ('ReddSphere') returning id
   )
   insert into public.memberships(organization_id,user_id,role)
   select id, 'REPLACE-WITH-AUTH-USER-UUID'::uuid, 'owner' from agency;
   ```

5. Start the app: `npm run dev`. Open `http://localhost:3000`, sign in, and create two **fictional clients in the development project**.
6. Add a campaign for each client. Import a permitted CSV with observations in two periods, or record a real published contribution. For development-only acceptance, `tests/fixtures/synthetic-evidence.csv` contains explicitly synthetic observations; never present them as live Reddit data. The import form links to a blank CSV template and can assign rows with blank `campaign_id` cells to a selected campaign. Verify that unknown counters display as unknown and that a repeated import uses its existing batch ID.

Use a custom SMTP provider before inviting real users: Supabase’s default SMTP service is for exploration and sends only to authorized team addresses with a low rate limit. [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

## CSV contract

The template columns are `url,title,text,published_at,observed_at,views,score,replies,shares,affiliation,campaign_id`. One row represents a Reddit post or comment and one observation time. `url` must be an HTTPS Reddit post/comment URL with an item ID. Timestamps must be ISO 8601 with `Z` or a numeric offset; `observed_at` is required. Blank counters mean unknown. `views`, `replies`, and `shares` are non-negative integers; `score` may be negative. `affiliation` is one of `agency`, `brand`, `independent`, `paid_disclosed`, or `unknown`. The optional campaign ID must belong to the selected client. Selecting a campaign in the import form fills blank campaign IDs; a different ID already present in the CSV is rejected.

The source note records where permissioned data came from. The import preview rejects invalid rows, and a commit with any invalid row is blocked. The database commit is atomic, uses an idempotency key, retains content revisions, and rejects conflicting item metadata or a conflicting value for the same item/observation rather than silently replacing it. Reusing an idempotency key with different content is rejected. A URL import never fetches its text.

The draft page supports manual authoring, immutable versions, submission, internal approval, and revision requests. Authors must have client edit/contribute access; owners and assigned managers/reviewers can decide reviews. A new version resets approval. Each decision and change is audited. There is no client review or publishing action yet; approved text must be checked and used separately by a human.

The campaign history page versions changes to names, goals and comparison windows, and records timestamped launch/pricing/advertising/site interventions with source notes. Earlier campaigns receive a labelled snapshot at migration time; it is not claimed as their original creation state. Changing a window recalculates the current overview, so use its recorded reason and earlier version when interpreting a result.

The sentiment page accepts human review labels for recorded Reddit items and keeps corrections as immutable versions. Its positive mention share uses only classified independent items among the newest 100 recorded items shown. Agency, brand, paid and unknown-affiliation records are kept out of the independent denominator; unclassified and unreviewed records are displayed separately. It is a bounded manual sample, not automated or comprehensive sentiment monitoring.

The AI visibility page accepts frozen, versioned prompt sets and manually supplied answer observations. Each run records its provider, model, collection method, configuration note, wave, repeat number, time, outcome, source note, and cited URLs. Human reviewers label valid answers for brand mention and recommendation; corrections remain versioned. Rates are reported only for exact provider/model/configuration cohorts with complete human review. Citation URLs are user-supplied evidence, not verified provider output. This workflow does not call a provider or incur provider API charges.

The search visibility page accepts frozen keyword sets with explicit search interface, region, language and device. Manual observations keep a wave, time, source, collection method, ordinary/AI-summary/ad type, present/not-found/error outcome, and a ranking or cited URL where applicable. Ordinary present results require a rank and HTTPS URL; absence and error require an explanation. It does not query Google, claim Search Console access to Reddit URLs, or calculate a blended ranking from incomplete samples.

The reports page prepares an internal, versioned snapshot of one campaign's baseline/comparison windows. Postgres calculates the saved totals and matched-item change, records exact observation and intervention IDs, and checksums the frozen dataset with SHA-256. Owners and assigned managers can approve a version with a review note; a correction creates a new version. The protected JSON download contains that same snapshot and narrative. This is an internal evidence package, not a branded PDF or a client-facing published report; other integrations and source coverage remain absent.

The CSV export follows the selected campaign from the overview. It lists raw observations, not a sum of repeated lifetime counters. The dashboard shows the newest 100 observations, while the export includes the full selected evidence set within the current 10,000-record safety cap. When the cap is reached, calculations and export stop instead of showing a partial total.

## Checks

Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`. Unit tests cover the calculation example, unknown values, latest lifetime counters, daylight-saving boundaries, CSV preview, URL identity, and formula-safe exports. The test command also executes the migration, two-client permission checks, two-period imports, contribution recording, and a database restart in an embedded PostgreSQL runtime. This uses a stubbed Auth identity and does not substitute for a live Supabase two-client workflow.

The development database acceptance procedure is in [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md). It checks two-client isolation, persistence, import idempotency and conflict handling, export scope, and direct table/RPC permissions. Repeat with a client viewer and a contributor when those roles gain views.

## Deployment preparation

This repository is public by owner choice. Keep credentials, client data, and private evidence out of it. Use separate development and production Supabase projects. Set Vercel to Node 24, configure the two public-safe environment variables for each environment, and apply reviewed migrations to the matching database. Do not copy production client data into previews. A commercial agency deployment needs a Vercel plan permitting commercial use. Scheduled work and external integrations have not been implemented or enabled. [Vercel plan terms](https://vercel.com/docs/plans/hobby).

Database backups do not include private Storage objects; plan a separate file backup and restoration test when report/evidence storage is added. [Supabase backups](https://supabase.com/docs/guides/platform/backups). No production launch has occurred.
