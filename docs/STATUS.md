# ReddSphere implementation status

Updated 27 September 2026. Status terms: **implemented** = code exists; **tested** = relevant automated checks passed; **partial** = incomplete behavior or required environment test; **blocked** = external access needed; **planned** = not started. The full target remains [BUILD_BRIEF.md](BUILD_BRIEF.md). This status is not a claim that the product is finished.

| Area | Status | Evidence and next action |
|---|---|---|
| Next.js/TypeScript application, responsive agency/client pages | Implemented; build tested | Production build and lint pass. Test authenticated browser flow with development Supabase. |
| Login and sign-out | Implemented; partial validation | The development owner signed in and reached `/clients`. The login now distinguishes invalid credentials from Auth service failures. Verify session refresh, sign-out, and persistence after a new session. |
| Organization membership and client isolation | Implemented; embedded Postgres tested | RLS policies, explicit table privileges and server checks pass a two-client embedded test. Repeat with real Auth in a development Supabase project. |
| Client creation and company fact records | Implemented; client creation verified live | The development owner created `client 1`; the record persisted in Supabase. Facts default to pending; fact submission, approval and conflict review remain. |
| Campaigns and baseline/comparison dates | Implemented; unit tested | Date constraints and client-zone day boundaries. Campaign versions and intervention events remain planned. |
| Authorized CSV import preview | Implemented; unit tested | Row validation, identity parsing, duplicate detection, nullable values, size cap, and campaign assignment tested. Need live import acceptance test. |
| Atomic import, revisions, idempotency, metric snapshots | Implemented; embedded Postgres tested | Security-definer RPC, duplicate submission, conflicting payload, tenant denial, and conflicting observation pass in embedded Postgres. Repeat on development Supabase. Metric correction workflow planned. |
| Published contribution recording | Implemented; embedded Postgres tested | User-reported Reddit URL is stored separately from future approval and labelled `user_reported` until checked. Verify against a development Supabase project. |
| Deterministic period comparisons | Implemented; unit tested | Latest lifetime views, unknown values, matched-item changes and required rate example tested. Additional metrics planned. |
| CSV evidence export | Implemented; unit tested in isolation | Campaign selection, formula-safe text, unknown cells, and negative numeric scores. Test authenticated export and cross-client denial. |
| Agency operations overview | Partial | Client list exists. Due work, failures, costs, assignments and budgets planned. |
| Research: subreddit directory, rules, opportunities, competitor research | Planned | Milestone 2. Requires permitted data inputs. |
| Content builder, draft versions, approvals, calendar | Planned | Milestone 2. Configure a drafting provider separately. No approval publishes. |
| Sentiment review and classification validation | Planned | Milestone 2/4. Independent and agency records need separate cohorts. |
| AI visibility, prompts, repeat runs, citations | Planned | Milestone 3. Requires provider account and approved spend. |
| Search visibility and Google generative-AI observations | Planned | Milestone 3/4. Verify API/export contract and property access. |
| GA4, Search Console, attributable traffic | Planned | Milestone 4. Requires client property access and OAuth setup. |
| Reddit live discovery and account insights | Blocked | Commercial use needs explicit approved access/contract. Import path works once database is connected. |
| Durable jobs, alerts, scheduled collection | Planned | Milestone 4. Select worker and add budget guardrails. |
| Monthly report snapshots, CSV/PDF, client viewer | Planned | Milestone 4. Current CSV is evidence export only, not approved reporting. |
| Contributor fees, profitability, audit UI, retention/deletion, backups | Planned | Milestone 5, with foundational audit event table present. |
| Direct Reddit publishing, Discord/calendar, analyst | Optional, planned | Later separate authorization and provider capability checks. |
| GitHub and Supabase connection | In progress | Code is pushed to the supplied public GitHub repository and CI passes. The development project's publishable key is in local ignored `.env.local`; both current migrations are applied, with 12 tables, 18 policies, RLS on all 12 tables and both RPCs verified live. One Auth user has a verified ReddSphere owner membership and created a client through the app. Campaign/import validation and CLI migration-history repair remain. |
| Production deployment | Not started | Needs production accounts, reviewed migration, live tests, backup plan, and authorization. |

Build gate before calling Milestone 1 complete: two isolated fictional clients; CSV import for two periods; persistence after a new session; tested cross-client denial; verified authenticated CSV export; documented source permission. The live schema, owner membership, sign-in and first client creation are present; campaign and evidence flow still need signed-in validation. CLI migration history must be synchronized before later migrations are pushed.

Future SaaS direction: preserve organization-level tenancy and client-scoped access as the product grows. Self-service organization provisioning, tenant billing, and cross-organization administration are not implemented; design and test these explicitly before offering the platform to outside agencies.
