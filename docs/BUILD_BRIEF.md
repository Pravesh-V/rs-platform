# ReddSphere Reddit Marketing Platform Build Brief

Version 1 | 26 September 2026 | Product requirements and implementation instructions

Build a private, multi-client application for ReddSphere to research companies and Reddit discussions, plan and create content, track campaigns, measure search and AI visibility, and produce evidence-backed monthly reports. This document defines the complete intended product, a staged build plan, and a Vercel deployment path. It is a specification, not a claim that the application or its integrations already exist.

## 1 Getting started with Codex

Use Codex to implement and test the application in a Git repository. Use Vercel to host it and a persistent database to retain client records. A conversation alone is not the application's database, scheduler, or production hosting. Official Codex guidance describes connecting a repository, configuring an environment, assigning tasks, and reviewing changes [S1].

Owner setup steps

1. Create a private GitHub repository named reddsphere-platform and include a README. Add this Markdown file as docs/BUILD_BRIEF.md. If your Codex interface accepts attachments, attach it as well; the repository copy is the durable source of instructions. The Word version contains the same requirements for reading.
2. Open Codex, connect the repository, and configure its development environment. Give it the kickoff instruction below. Build milestone by milestone and keep unfinished features in docs/STATUS.md.
3. Create separate development and production database projects when ready. Configure secrets through each service's secret settings, never through source files or public chat messages.
4. Review the first working client flow before adding live collectors. Supply authorized exports initially. Approve provider access and spending separately when enabling paid integrations.
5. Import the repository into Vercel, follow Section 11, and test with a private pilot client. Deployment is a separate action from writing this specification.

Kickoff instruction to paste into Codex

Read docs/BUILD_BRIEF.md completely and treat it as the product specification. Build ReddSphere as a real application, not a landing page or static dashboard. Inspect existing repository instructions first. Create docs/STATUS.md with all requirements and their status. Implement Milestone 1 and its acceptance checks end to end before moving to Milestone 2. Use Next.js, TypeScript, Supabase, and a Vercel-compatible architecture unless an existing repository requires a justified alternative. Make routine implementation decisions yourself. Ask only for necessary credentials, spending authorization, or a material product decision. Do not silently omit features. Keep all missing integrations visibly disconnected; never substitute demo data for live results. Preserve client isolation and source evidence. Deliver working code, migrations, tests, setup instructions, and a clear completion report. Prepare deployment configuration but do not publish or spend money until I authorize it. Recheck current official provider documentation before implementing integrations.

The complete product scope remains the target even though implementation is staged. Finishing a milestone must not be described as finishing the whole platform.

## 2 Product purpose and experience

The primary question is: What changed for this client, what evidence supports it, which Reddit activity was associated with it, and what should we do next? The main workflow is onboarding, baseline audit, research, campaign planning, content approval, publication recording, monitoring, comparison, and monthly reporting.

Use a professional black, white, and restrained red visual identity. Start on a working client dashboard with a date range, comparison period, data freshness, and useful controls. Avoid a marketing homepage, decorative statistics, and giant hero sections. Support desktop work and readable mobile review. Charts need units, denominators, legends, accessible alternatives, and drill-through to records.

Navigation

- Agency overview: clients, work due, collection failures, reports awaiting approval, and usage budgets.
- Client workspace: overview, company knowledge, research, opportunities, content, campaigns, Reddit performance, sentiment, competitors, AI visibility, search visibility, reports, and settings.
- Agency operations: team assignments, client access, contributors, costs, integrations, and audit history.

Required interaction states

Every data module supports loading, empty, error, partial, stale, disconnected, and successful states. Provide last successful sync and coverage notes. Unknown data must not appear as zero. A new client begins empty; demo data lives in a separately labelled demo workspace. Filters and exports must use the same dataset and definitions.

Roles

The owner manages the organization, integrations, billing settings, and access. Managers handle assigned clients and approve reports. Researchers and writers work on assigned records. Reviewers approve content. Contributors see only assigned briefs and their submissions. Client viewers see only approved material for their client. All permissions must be enforced on the server and in storage, not only through hidden UI controls.

The product assists professional research and disclosed participation. It must not manufacture customer experiences, fake endorsements, coordinated votes, hidden account personas, or evasion of subreddit enforcement. Publishing requires a human-reviewed workflow and supported provider access.

## 3 Company research and Reddit opportunities

Company knowledge base

Store website, product names and aliases, approved facts, pricing with verification dates, target customers, positioning, differentiators, prohibited claims, tone examples, competitors, geographic focus, and campaign objectives. Import owner-provided files and approved public sources. Each extracted fact carries a source, retrieval date, and review status. Conflicting or old facts are flagged rather than merged into confident claims.

Baseline audit

At campaign start, snapshot discoverable mentions, available sentiment, relevant communities, competitor presence, search results, AI test results, and attributable website traffic. Record scope, dates, methods, missing data, and collection coverage. If no historical records exist, say so; never reconstruct a historical baseline from current searches as though it were observed then.

Subreddit research

Maintain a directory with relevance, topic fit, source links, observed activity, rules and their checked date, promotional restrictions, recurring threads, suitable formats, and the agency's own results. Distinguish subreddit membership from active audience and actual reach. Rule checks are advice, not guarantees of moderator approval.

Thread research and opportunity queue

Search permitted sources for brand mentions, product categories, buying questions, competitor alternatives, objections, and educational needs. Save thread URL, Reddit ID where available, subreddit, title, available text, publication time, collection time, engagement observations, and source coverage. Deduplicate cross-source discoveries. Mark archived, locked, removed, unavailable, and already handled items when supported by evidence.

Rank opportunities with an explainable breakdown: client relevance, buyer intent, freshness, useful unanswered angle, community fit, and response feasibility. Keep these as adjustable prioritization signals, not predicted sales probabilities. Each result includes why it matters, a suggested helpful angle, applicable rules, sources, an owner, and a status from new through reviewed, assigned, drafted, published, or dismissed.

Comparisons and learning

Compare communities and content formats using the client's observed data. Extract recurring questions, complaints, competitor strengths, and content gaps. Store recommendations as hypotheses linked to evidence; do not equate engagement with purchasing intent. Include a pre-sales company audit that can become a client workspace without duplicate records.

## 4 Post builder and campaign execution

Content builder

Start from a selected thread or a new post brief. Choose client, campaign, subreddit, intended audience, objective, format, tone, and length. Supply current conversation context and approved company facts. Generate editable titles, posts, comment drafts, and follow-up replies with source references for factual claims. Offer comparison, tutorial, founder update, product demonstration, question, and FAQ formats only when suitable to the community.

The builder must explain its proposed angle, identify unsupported claims, avoid invented first-hand experience, and flag when affiliation should be disclosed. It must not promise virality, removal avoidance, or AI citations. Provide a claim-review panel and a rules checklist with last-checked dates. User-provided style examples are editable per client; do not blend client voices.

Review workflow

Use draft, internal review, client review, approved, published, and revision requested states. Keep immutable draft versions, reviewer comments, approval identity, and approval time. Editing an approved draft invalidates approval. Approval does not publish content. Initially provide copy-to-clipboard and a Reddit link, then record the actual publication URL. An optional future publish connector must verify access and require a separate explicit publish action.

Campaign management

Store goals, baseline dates, start/end dates, target communities, deliverables, owner, budget, content calendar, and linked opportunities. Record launch events, pricing changes, advertising changes, and other interventions that could explain a performance shift. Keep baseline and comparison windows editable but versioned.

Team and contributor delivery

Assign briefs, due dates, submissions, review outcomes, published links, and agreed fees. Prevent duplicate assignments on the same opportunity. Track work accepted, revisions, outstanding pay, and payment references. Payment tracking does not authorize automatic disbursement. Never store contributors' Reddit passwords.

Follow-up and experiments

Create an inbox for questions or complaints on tracked content where access permits. Suggest replies for review. Tag experiments by hypothesis, audience, format, period, and primary metric; compare matched groups where practical. Organic posts in different subreddits are observational comparisons, not automatically randomized A/B tests. Support calendar and Discord notifications later, with separate recipient and send permissions.

## 5 Visibility and performance measurement

Reddit performance

For each post/comment record, store publication subreddit, URL, campaign, format, author affiliation category, available views, score, replies, shares, and status. Preserve observation timestamps. Import account-owner insights when direct access is unavailable. Reddit describes post and comment insights, but a metric visible in the product is not automatically exposed through an API [S3]. Do not infer views from score or subreddit size.

Build community, campaign, format, and contribution comparisons. Distinguish the subreddit where content was published from the location where a viewer discovered it. View totals are impressions, not deduplicated people. Do not add repeated lifetime snapshots together: show the latest lifetime value or a supported period delta, clearly labelled. Comment scores may be approximate; never call score an exact count of upvotes.

Traffic and business outcomes

Create UTM links containing non-sensitive campaign and contribution identifiers. Connect authorized GA4 properties or import compatible exports. Track reported sessions, key events such as signup, qualified leads, and revenue where the client supplies them. Keep analytics attribution models and time zones explicit. Generic reddit.com referral traffic is not exact subreddit attribution. Untagged or stripped links remain unattributed; copied tagged links are not perfect causal evidence [S4].

Search visibility

Track a fixed keyword set, geography, language, device setting, observation date, ranking URL, and result type through a suitable search-results provider or manual observations. Separate ordinary results, AI summaries, and advertisements. Search Console can report the client's verified website, not arbitrary Reddit threads. Show rankings for third-party Reddit pages as external observations, with provider and sampling method.

Competitor and brand visibility

Resolve brand aliases and ambiguous names before counting mentions. Compare brands across the same monitored universe and time period. Distinguish a company-owned website citation from an independent page that mentions the company. Track relevant review sites and other public domains as citation sources when discovered, without expanding the product into an unrelated social publishing suite.

Evidence navigation

Every aggregate opens its contributing records and exclusions. A source panel shows observed facts, manually supplied values, AI classifications, reviewer changes, collection errors, and available underlying evidence. Show unobserved fields as unknown. Do not claim complete Reddit coverage.

## 6 AI visibility and citation analysis

Measurement design

Create versioned prompt sets by buyer stage: discovery, product comparison, alternatives, use cases, and reputation. Separate unbranded discovery prompts from prompts explicitly naming the client. Freeze the baseline set and record language, region, platform, model/version when exposed, search mode, test time, and repeat number. Never prime the measurement provider with the client's marketing brief when running an unbranded visibility test.

Start with one supported search-enabled API provider plus manual answer imports. Add other providers through independent adapters after verifying their APIs and permissions. Label API measurements by provider and model; never label them as identical to consumer ChatGPT, Gemini, or Perplexity app exposure. Actual consumer-interface samples must be separately identified and collected through an authorized method. Do not claim an API recreates Google's AI Overviews.

Saved answer evidence

Store the exact question, response, run settings, outcome, parsed citation annotations, collection timestamp, and usage/cost where available. OpenAI web-search responses can expose URL citations; use structured annotations rather than inventing sources from prose [S5]. Preserve visible clickable attribution. Separate sources cited in the answer from other sources merely returned by retrieval.

Classifications

For each answer and brand, record mention, explicit positive recommendation, own-domain citation, third-party brand-supporting citation, and contextual sentiment. Link citation claims to supporting spans where possible. A Reddit citation does not automatically prove the thread mentions or recommends the client. Unavailable thread content is unverified. Keep model confidence separate from empirical accuracy and allow human correction.

Citation explorer

Normalize citation URLs without losing original URLs, resolve permitted redirects safely, extract subreddit and post/comment IDs where possible, and link to agency contributions. Label exact comment matches, thread-level matches, unrelated threads, and unknown matches separately. A thread citation is not proof that the model used the agency's specific comment. Count distinct citing answers separately from citation occurrences.

Repeated measurement

Use a configurable initial design of 20 prompts, three repeats per provider per reporting wave, subject to a cost preview. Report prompt count, successful answer count, failures, and repeats. Keep API errors and refusals visible with predefined handling. Recalculate baseline comparisons only for matched test conditions; show changed-model or changed-prompt results in a separate series.

## 7 Metric definitions and monthly history

Implement calculations in deterministic code, not in a language model's prose. Version the definitions. The default AI unit is one valid answer observation for a specific prompt, repeat, provider, and configuration. Report each provider separately before any explicitly weighted aggregate.

Core formulas

- Mention rate = valid answers naming the brand / valid answers in the matched cohort.
- Recommendation rate = valid answers explicitly recommending the brand / valid answers in that cohort.
- Own-domain citation rate = valid answers citing an approved client domain / valid answers in that cohort.
- Reddit source rate = valid answers citing at least one Reddit URL / valid answers in that cohort. This is separate from brand visibility.
- Positive mention share = positive independent mentions / all classified independent mentions, including neutral and mixed. Show unclassified records separately.
- Share of voice = brand mention events / mention events across the fixed tracked brand set. Count each brand at most once per Reddit item; multi-brand items can contribute to multiple brands.
- Percentage-point change = new percentage minus old percentage. Relative change = (new minus old) / old multiplied by 100. If the old value is zero, show not defined and report the absolute change.

Required example

Two qualifying answers out of 20 versus ten out of 20 means 10% versus 50%, eight additional qualifying answers, a 40 percentage-point increase, a 400% relative increase, and five times the original rate. It does not mean five times the actual audience or five times the sales. If three repeats were run, report the real answer denominator, not simply 20.

Comparability and uncertainty

Use equal-duration windows in the client's timezone. Label month-to-date comparisons and compare matched elapsed days. Retain prompt set, competitor set, source coverage, and scoring versions. Show an intersection comparison when sets change. Small samples and repeated prompts are not independent proof of causality; do not label a lift statistically significant without an appropriate analysis.

Monthly records

Freeze each approved report with dataset IDs, calculation version, filters, dates, coverage, exclusions, evidence references, approval, and generated file checksum. Corrections create a new report version. Data retention or source-deletion obligations take priority over retaining raw source text forever; keep a redaction/deletion record and explain when evidence can no longer be reproduced. Do not retain prohibited copies in backups or exports.

## 8 Sentiment and client reporting

Sentiment workflow

Collect permitted mentions, deduplicate, resolve brand identity, and classify positive, negative, neutral, mixed, or unclassified. Also tag themes such as price, support, product quality, usability, and trust. Review uncertain, sarcastic, multilingual, and mixed statements. Store the classifier version and reviewer changes. Validate quality against a human-labelled sample before using automated scores in client claims.

Separate agency/brand contributions, independent discussion, disclosed paid content, and unknown affiliation. Do not infer coordinated behavior or identify individuals from weak signals. Compare fixed keyword and subreddit coverage over time, and show any collection changes beside the chart. A change in observed mentions does not prove that existing customers changed their minds.

Report contents

- Executive summary with observed outcomes and material limitations.
- Work delivered and approved live links, separate from outcomes.
- Reddit reach and engagement, with metric availability and period definitions.
- Community and format comparison, including attributable visits and conversions.
- Independent sentiment distribution, themes, sample sizes, and examples.
- AI visibility and citation trends using comparable tests and saved answers.
- Competitor changes and search observations.
- Costs, attributed acquisition measures where valid, and recommended next steps.

Support an interactive dashboard, CSV evidence export, and a branded PDF report generated from the same approved dataset. A client can open only their authorized report. External sharing requires a scoped, revocable link or authenticated access; no public reports by default. Reports must not invent causal claims or cherry-pick a changed prompt set.

Example source table

Each subreddit row includes contributions published, available recorded views, tracked website sessions, attributable conversions, distinct tested AI answers citing relevant threads, costs, and missing-data notes. Repeated citations to the same thread in one answer count once in the distinct-answer column. A single answer can cite multiple subreddits, so row totals may overlap; say this visibly.

Recommendations should state evidence, uncertainty, proposed action, owner, and a follow-up metric. For example: a lower-view community produced more tracked signups in the observed period; test additional suitable contributions there rather than concluding that the community is universally superior.

## 9 Architecture and integration boundaries

Proposed stack

Use Next.js App Router and TypeScript for the application and server endpoints, a shared accessible component library, Supabase Postgres for records, Supabase Auth for identity, and private object storage for permitted evidence and reports. Use a durable job runner or queue for collection, analysis, exports, and retries. Vercel hosts the web application. This is a proposed architecture, not a provider compatibility guarantee; verify current versions before implementation.

Supabase row-level security can enforce database access policies [S6]. Apply organization/client scoping consistently to database queries, storage, search, exports, and jobs. Avoid a separate microservice for every module. Keep provider adapters and deterministic measurement code separate from presentation.

Adapters and fallback behavior

- Reddit discovery: approved Reddit access or a provider contract explicitly permitting the proposed use. Otherwise authorized URL/text/CSV imports. Imports are not a permission bypass. Commercial access must be checked with Reddit before activation [S2].
- Account insights: supported account access or owner-supplied exports. Do not fabricate an insights endpoint.
- AI measurement: search-capable APIs and manually supplied samples; track provider-specific capabilities and source types.
- Search rankings: suitable licensed search-results API or manually recorded observations; coverage and geography are explicit.
- Website analytics: authorized GA4 and Search Console access or validated imports, restricted to the selected client's properties.
- Notifications: opt-in email or Discord integration. No automatic posting, messaging, or payments from a monitoring trigger.

Every adapter returns status, source timestamp, coverage, cursor, capabilities, errors, and normalized records. Missing credentials disable the action with setup guidance; they never trigger synthetic success. Retain provenance for manual imports. AI features also require appropriate permission to process the imported material with the chosen provider.

Background work

Vercel Cron can trigger scheduled endpoints [S7]; use it to enqueue bounded jobs rather than expecting a long-running process. Use durable job state, idempotency keys, retries with backoff, rate limits, partial results, cancel/retry controls, and a per-client budget. A transient HTTP request must not be the sole record of a monitoring run.

## 10 Data contracts and security

Minimum relational model

- organizations, users, memberships, clients, client_access, client_facts, competitors, brand_aliases.
- campaigns, milestones, tasks, content_drafts, draft_versions, approvals, contributions, costs.
- subreddits, rule_snapshots, opportunities, source_documents, reddit_items, metric_snapshots, mentions, sentiment_labels.
- prompt_sets, prompt_versions, measurement_batches, answer_runs, citations, brand_observations, search_observations.
- analytics_connections, traffic_observations, conversion_observations, report_snapshots, report_versions, evidence_links.
- integration_connections, jobs, usage_ledger, audit_events, deletion_requests.

All tenant records carry organization_id and, where relevant, client_id. Source records include source_type, external_id, canonical_url, observed_at, fetched_at, permission/retention metadata, content hash, and availability status. Snapshot values are nullable and have units and period boundaries. Uniqueness constraints prevent duplicate imports and duplicate billing on retry.

Import contracts

Support a template for Reddit items with URL, subreddit, item type, text where permitted, published_at, observed_at, views, score, replies, shares, affiliation, and campaign reference. AI answer imports require prompt text, prompt version, provider, collection method, observed_at, answer text, and source URLs. Validate dates, numbers, allowed URLs, duplicates, size limits, and client ownership. Preview valid/invalid rows before commit and return row-level errors. Neutralize spreadsheet formula injection in exports.

Application contracts

Provide validated server operations for creating clients/campaigns, importing records, searching opportunities, drafting content, approving versions, starting measurements, querying metrics, and generating reports. Long jobs return a job ID; status endpoints expose progress. Use stable request schemas, authorization checks, pagination, and idempotency keys for mutations and paid jobs. Never trust a client-supplied client_id without an access check.

Security requirements

Keep provider secrets server-side and encrypted at rest; no secret belongs in a NEXT_PUBLIC variable. Verify OAuth state, refresh handling, webhook signatures, and scheduled-job secrets. Prevent SSRF when fetching URLs: restrict schemes, reject internal destinations, revalidate redirects, and bound time and response size. Treat web content as untrusted data, never as instructions to an agent. Sanitize rendered text, scope signed downloads, redact logs, and restrict uploads.

Apply backups and restoration tests, deletion workflows, session controls, and least-privilege access. Production client data must not be copied into unrestricted preview environments. Report generation and background jobs require the same tenant authorization as interactive pages.

## 11 Build milestones and Vercel deployment

Milestone 1 Foundation and evidence

Implement login, client isolation, company records, campaign baseline dates, imports, contribution records, timestamped metrics, deterministic comparisons, and CSV exports. Prove persistence across sessions with two isolated test clients. Deliver one complete baseline-to-comparison flow; no live-collection claims.

Milestone 2 Research and content

Add subreddit directory, opportunity workflow, company-source retrieval, drafting through a configured provider, revisions, approval, calendar, publication recording, sentiment review, and competitor comparisons. Verify client-specific sources and permissions. Missing provider access remains visible.

Milestone 3 AI and search visibility

Implement one working measurement provider, versioned prompts, repeat runs, citation parsing, exact/thread match distinctions, provider costs, and before/after dashboards. Add manual consumer-answer imports and search observations. Additional providers are separately tracked tasks.

Milestone 4 Monitoring and reporting

Add authorized collectors, analytics connections, durable scheduled jobs, alerts, approved monthly snapshots, branded reports, and client access. Test partial failures and stale data. Do not mark blocked collectors as completed.

Milestone 5 Agency operations and hardening

Add contributor costs, client profitability, integrations management, audit views, retention and deletion jobs, backup restoration, and an operational pilot. Optional later work includes supported direct publishing, scoped Discord notifications, invoicing exports, and a read-only conversational analyst that cites the client's records. The analyst must not execute external actions implicitly.

Deployment steps

1. Keep code and migrations in GitHub. Provide a lockfile, .env.example with names only, migration instructions, seed fixtures, and README.
2. Set up production Supabase and apply reviewed migrations and access policies. Configure authentication redirects and private storage.
3. Import the Git repository into Vercel and set framework/build settings. Vercel supports Git-linked deployments [S8].
4. Add server secrets and public-safe configuration to the correct preview/production environments. Register exact OAuth callback URLs.
5. Configure the job runner, scheduled triggers, domain, monitoring, and spending caps. Keep schedules disabled until integrations and test runs pass.
6. Test a protected preview, then authorize production publication. Verify login, isolation, imports, a real measurement, and report generation. Document rollback and database migration recovery.

Use a Vercel plan that permits agency commercial use; Hobby is restricted to non-commercial personal use [S9]. Budget separately for hosting, database, storage, AI calls, data access, search results, and jobs. Do not assume a ChatGPT subscription funds the deployed application's provider usage. Show estimated cost before large runs and actual usage afterward.

## 12 Acceptance checks and implementation handoff

Required correctness checks

- The 2/20 to 10/20 example produces 10%, 50%, +40 percentage points, +400%, and 5x. A zero baseline produces no infinite growth claim.
- Failed API calls remain visible and are excluded according to a documented rule; report planned, attempted, and valid answers. Changed prompts/models cannot silently enter a matched comparison.
- One answer with duplicate links contributes once to the distinct-answer rate. A thread citation is never mislabelled as proof of using a specific agency comment.
- Views of 100 then 140 on the same lifetime counter produce a latest total of 140, not 240. Missing counters remain unknown.
- Reimporting identical data does not duplicate mentions or costs. An edited source record has revision history.
- Agency-created praise does not inflate the independent-sentiment chart. Mixed and unclassified labels have explicit handling.
- A client cannot read another client's record, file, job, search results, or report by changing an identifier.
- An approved report reproduces from its snapshot and versioned definitions unless legally required deletion/redaction is documented.
- No production page uses seed data when an integration fails. No approval action silently publishes to Reddit.

End-to-end pilot

Create two fictional test clients in a labelled test environment. Import sample evidence for two periods. Review sentiment, draft and approve a post, record its publication, run configured AI tests or clearly labelled imported samples, inspect citations by subreddit, and generate a report. Check responsive layouts, keyboard operation, empty/error states, tenant isolation, and export consistency. Then pilot with one authorized real client and reconcile a sample against original sources.

Repository deliverables

Produce working application code, migrations and access policies, provider adapters, documented environment variables, import templates, fixture data isolated from production, calculation tests, authorization tests, focused end-to-end tests, deployment instructions, and docs/STATUS.md. The status file lists every module as implemented, tested, partially implemented, blocked, or planned, with exact blockers and next actions. Produce docs/METRICS.md and docs/DATA_ACCESS.md so definitions and integration approvals remain auditable.

Follow-up instruction for Codex

Read docs/STATUS.md and docs/BUILD_BRIEF.md. Continue the next incomplete milestone, preserving implemented behavior and data. Resolve routine defects, run the relevant acceptance checks, and update status with evidence. Do not restart the application or replace working integrations with mocks. Clearly identify anything requiring my access, budget, or decision. Finish with what works, what was tested, what is blocked, and the next milestone.

## 13 Official references and scope notes

The architecture and requirements above are proposed product decisions. Official references support provider behavior and access constraints, not guarantees of business results. Provider capabilities, prices, permissions, and SDKs must be rechecked at implementation time. Checked 26 September 2026.

[S1] OpenAI Codex cloud setup and repository workflow
https://learn.chatgpt.com/docs/cloud

[S2] Reddit Data API Terms and Responsible Builder Policy
https://redditinc.com/policies/data-api-terms
https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy

[S3] Reddit Post and Comment Insights
https://support.reddithelp.com/hc/en-us/articles/35363096996500-Post-Comment-Insights

[S4] Google Analytics traffic sources and tagging
https://support.google.com/analytics/answer/15567068
https://support.google.com/analytics/answer/11242870

[S5] OpenAI web search and citation annotations
https://developers.openai.com/api/docs/guides/tools-web-search

[S6] Supabase row level security
https://supabase.com/docs/guides/database/postgres/row-level-security

[S7] Vercel Cron Jobs
https://vercel.com/docs/cron-jobs

[S8] Vercel Git deployments
https://vercel.com/docs/git

[S9] Vercel Hobby plan restrictions
https://vercel.com/docs/plans/hobby

Agency sites such as Reddify and Organic Reach can inform later competitive research, but their marketing claims are not technical requirements or verified benchmarks. This brief does not claim a feature-by-feature audit of every agency. It incorporates the requested company research, post creation, thread discovery, comparisons, visibility measurement, historical storage, and reporting into an implementable scope. The separate Deep Research result mentioned in conversation was not available as source content for this document.
