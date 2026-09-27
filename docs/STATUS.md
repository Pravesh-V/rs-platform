# ReddSphere implementation status

Updated 27 September 2026. Status terms: **implemented** = code exists; **tested** = relevant automated checks passed; **partial** = incomplete behavior or required environment test; **blocked** = external access needed; **planned** = not started. The full target remains [BUILD_BRIEF.md](BUILD_BRIEF.md). This status is not a claim that the product is finished.

| Area | Status | Evidence and next action |
|---|---|---|
| Next.js/TypeScript application, responsive agency/client pages | Implemented; build tested | Production build and lint pass. Test authenticated browser flow with development Supabase. |
| Login and sign-out | Implemented; partial validation | The development owner signed in and reached `/clients`. The login distinguishes invalid credentials from Auth service failures. A mobile layout bug hid the sign-out control; the control is now visible beside the brand at narrow widths. Verify sign-out, session refresh, and persistence after a new session in the browser. |
| Organization membership and client isolation | Implemented; live database isolation tested | RLS and explicit privileges pass embedded tests. A rolled-back live transaction with temporary researcher access to only `client 1` showed one visible client, zero access to Test B and three visible observations; owner membership was restored. Repeat in a browser with a separate Auth user. |
| Client creation and company fact records | Implemented; client creation verified live | The development owner created `client 1`; the record persisted in Supabase. Facts default to pending; fact submission, approval and conflict review remain. |
| Campaigns and baseline/comparison dates | Implemented; live database insert tested | Two development campaigns with distinct periods persisted under the owner role. Date constraints and client-zone day boundaries are unit tested. The signed-in campaign form still needs browser validation; versions and intervention events remain planned. |
| Authorized CSV import preview | Implemented; unit tested | Row validation, identity parsing, duplicate detection, nullable values, size cap, and campaign assignment tested. Need live import acceptance test. |
| Atomic import, revisions, idempotency, metric snapshots | Implemented; live RPC tested | The development owner imported three labelled synthetic observations through the live RPC: two items, one unknown-view observation and one batch in `client 1`, with zero evidence in Test B. Repeating the same request returned the same batch ID. Live rejected-key and conflicting-observation checks left one batch and three observations. Browser import and metric correction workflow remain. |
| Published contribution recording | Implemented; live RPC access tested | A rolled-back development transaction recorded a synthetic A contribution under temporary researcher access and confirmed B was denied. No test contribution remained. User-reported URLs are labelled `user_reported` until checked; the signed-in browser flow remains to verify. |
| Deterministic period comparisons | Implemented; live browser result checked | The owner confirmed the synthetic campaign displays baseline `100`, comparison `140`, and matched change `+40`. Unit tests cover latest lifetime views, unknown values, matched-item changes and the required rate example. Additional metrics planned. |
| CSV evidence export | Implemented; authenticated owner export verified | The owner downloaded the selected campaign CSV; it contained all three synthetic observations, blank unknown views and negative score `-2`. Unit tests cover formula-safe text. Cross-client denial with another Auth user remains. |
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
| GitHub and Supabase connection | In progress | Code is pushed to the supplied public GitHub repository and CI passes. The development project's publishable key is in local ignored `.env.local`; both current migrations are applied, with 12 tables, 18 policies, RLS on all 12 tables and both RPCs verified live. The owner created a client through the app; two clients, two campaigns and a synthetic evidence batch are now persisted. Browser acceptance and CLI migration-history repair remain. |
| Production deployment | Not started | Needs production accounts, reviewed migration, live tests, backup plan, and authorization. |

Build gate before calling Milestone 1 complete: browser import for two periods; persistence after a new session; cross-client denial with a separate Auth user; documented source permission. The live schema, owner membership, two development clients, distinct campaigns, labelled synthetic evidence, visible 100/140/+40 comparison, authenticated CSV export and transaction-scoped RLS isolation are present. Remaining browser checks and CLI migration-history synchronization still matter.

Future SaaS direction: preserve organization-level tenancy and client-scoped access as the product grows. Self-service organization provisioning, tenant billing, and cross-organization administration are not implemented; design and test these explicitly before offering the platform to outside agencies.
