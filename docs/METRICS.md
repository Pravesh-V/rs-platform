# Metric definitions

Definition version 0.2, implemented foundation and manual-review subset. These are descriptive observations. They do not prove that Reddit activity caused sales or AI answers.

## Current app

- Each metric snapshot belongs to a client and Reddit item and has an `observed_at` timestamp. Blank source counters remain `NULL` (unknown).
- Campaign date windows are inclusive calendar dates in the client’s IANA timezone. The implementation converts local midnight at the first date and midnight after the last date to UTC for filtering. This handles daylight-saving transitions.
- For each item and period, use the latest snapshot **observed within that period**. `latest recorded lifetime views` sums those latest item counters only where views are known. Display the number of measured items and all observed items.
- Baseline and comparison totals may include different items. The matched change uses only items with known views in both windows: sum of comparison latest lifetime views minus sum of baseline latest lifetime views.
- The matched change describes counter growth between the two observation times. It is not a count of unique viewers, and it is not necessarily activity confined to the calendar month.
- Score is Reddit score, not exact upvotes. No score-derived views are calculated.
- The evidence CSV exports raw selected observations. Dashboard and export use the same selected campaign.
- Community-and-format rows group recorded contributions linked to the selected campaign. Each contribution is counted once. For each contribution item, only the latest observation inside the selected comparison window contributes a known lifetime-view value; a missing observation or unknown views remain visible through separate denominators. Groups are descriptive and are not a randomized comparison or attribution result.

## Manual AI visibility

- A cohort is one frozen prompt-set version, wave, provider, model label, collection method, and exact configuration note. Rates never combine unlike cohorts.
- Planned observations = prompts in the frozen set × planned repeats. Attempted observations include valid answers, refusals, and errors. The app shows each count separately; missing and refused answers are not quietly treated as valid answers.
- AI mention rate = valid answers labelled as mentioning the client by a human / all valid answers in the cohort. Recommendation rate uses the same denominator and the human recommendation label. Both rates are withheld until every valid answer in the displayed cohort has a review; a zero-valid-answer cohort has an undefined rate.
- Reddit source rate = valid answers with at least one user-supplied HTTPS Reddit/redd.it citation URL / all valid answers. Multiple Reddit URLs in one answer count once. A URL is not proof that the provider generated the citation or cited an agency comment.
- The newest review version determines each answer's labels. Review corrections preserve older versions. The UI uses exact row counts to detect API truncation and blocks summary calculations when it cannot load all runs, citations or reviews in the selected cohort.

## Next metric modules

- Own-domain citation rates need a verified domain inventory and source validation before implementation. A duplicate citation URL in one answer must count the answer once.
- A Reddit citation rate is distinct from brand mention or recommendation. A thread citation is not proof of citing an agency comment.
- Positive independent mention share = positive independent mentions / all classified independent mentions, including neutral and mixed. Unclassified and unknown affiliation counts are displayed separately.
- Share of voice = brand mention events / mention events for the fixed tracked brand set and monitored universe; each brand counts at most once per Reddit item.
- Percentage-point change is new percentage minus baseline percentage. Relative percent change is `(new-old)/old × 100`. When the baseline rate is zero, relative change and multiple are undefined.

Required example: 2/20 to 10/20 = 10% to 50%, eight additional qualifying answers, +40 percentage points, +400% relative change, and 5× the original rate. If there are three repeats of 20 prompts, the planned answer count is 60, not 20.

Manual AI rates are exposed for saved, reviewed cohorts only. Automated provider collection, citation verification, search metrics, and multi-source published reports are **not yet implemented**. Their calculation versions, classification rules, exclusions, model/configuration hashes, and report datasets must be frozen with approved reports.

Manual search observations are displayed as individual records and exact-cohort keyword coverage. A cohort is one frozen set version, wave label, provider, collection method and result type; the set fixes engine, region, language and device. The latest outcome per keyword within that cohort is used. Presence rate = present keywords / all planned keywords only if every keyword has a present or explicit `not_found` outcome. Errors and missing observations withhold the rate; absence is limited to the documented sampled scope. Ordinary results, AI summaries and advertisements remain separate. No aggregate rank, audience exposure or wave-to-wave change is claimed yet.

Campaign UTM links use opaque record IDs in `utm_campaign` and optional `utm_content`. The generator itself records no sessions, conversions or revenue. If GA4 data is added later, untagged visits, copied links and attribution-model choices must be shown as limitations; a tagged visit is not a causal experiment.

The manual analytics ledger records one source-reported metric at a time. Every row names the property/report, its IANA timezone, period, source/medium, session or event dimension scope, metric definition or attribution note, and source permission. Sessions are whole numbers and use session-scoped dimensions; key-event credits and revenue can be fractional and may use event-scoped dimensions. Corrected entries point to the previous immutable row. The app deliberately does not sum rows across overlapping periods, different properties, scopes, attribution models, currencies or corrected versions. These are descriptive source reports, not a verified GA4 connection or a causal claim. [Google distinguishes session and event traffic dimensions](https://support.google.com/analytics/answer/11080067), and its [key-event reporting attribution model can change attributed event credit](https://support.google.com/analytics/answer/16291112).

## Internal report snapshot

`reddit-lifetime-v1` is calculated in Postgres from the campaign's current version and client timezone when a report version is created. For each period, it saves the count of observations and observed items, the count of items with known views, and the sum of each item's latest recorded lifetime views. The matched change uses only items with known views in both periods. A missing known value remains `null`, rather than zero. The snapshot lists the exact observation and campaign-event IDs used, the date windows, timezone, campaign version, calculation version, and SHA-256 checksum. Approval freezes that version; a correction creates another. The internal report covers only campaign-linked Reddit observations. Its narrative requires human review and must describe missing sources and uncertainty. An approved version can be downloaded as a branded PDF derived from this same saved dataset, with the checksum and coverage note displayed. The evidence JSON remains the machine-readable source-ID record. Client publication remains unimplemented.
