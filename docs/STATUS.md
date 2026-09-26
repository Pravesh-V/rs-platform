# ReddSphere implementation status

Updated 26 September 2026. Status terms: **implemented** = code exists; **tested** = relevant automated checks passed; **partial** = incomplete behavior or required environment test; **blocked** = external access needed; **planned** = not started. The full target remains [BUILD_BRIEF.md](BUILD_BRIEF.md). This status is not a claim that the product is finished.

| Area | Status | Evidence and next action |
|---|---|---|
| Next.js/TypeScript application, responsive agency/client pages | Implemented; build tested | Production build and lint pass. Test authenticated browser flow with development Supabase. |
| Login and sign-out | Implemented; partial validation | Supabase Auth server flow and verified claims wired. Login page smoke-tested without credentials. Verify real session refresh and persistence. |
| Organization membership and client isolation | Implemented; embedded Postgres tested | RLS policies, explicit table privileges and server checks pass a two-client embedded test. Repeat with real Auth in a development Supabase project. |
| Client creation and company fact records | Implemented; untested in Postgres | Forms and tables exist. Facts default to pending; approval and conflict review are planned. |
| Campaigns and baseline/comparison dates | Implemented; unit tested | Date constraints and client-zone day boundaries. Campaign versions and intervention events remain planned. |
| Authorized CSV import preview | Implemented; unit tested | Row validation, identity parsing, duplicate detection, nullable values, and size cap tested. Need live import acceptance test. |
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
| GitHub and Supabase connection | In progress | The supplied GitHub remote is configured on its existing `main` history; code has not been pushed yet. GitHub Actions CI and pinned Supabase CLI/config are ready. The development project is not linked yet. |
| Production deployment | Not started | Needs production accounts, reviewed migration, live tests, backup plan, and authorization. |

Build gate before calling Milestone 1 complete: live development Supabase migration; first owner bootstrap; two isolated fictional clients; CSV import for two periods; persistence after new session; tested cross-client denial; verified authenticated CSV export; documented source permission. The lack of configured Supabase access currently prevents this gate.
