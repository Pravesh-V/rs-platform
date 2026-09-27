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

## Manual AI visibility

- A cohort is one frozen prompt-set version, wave, provider, model label, collection method, and exact configuration note. Rates never combine unlike cohorts.
- Planned observations = prompts in the frozen set × planned repeats. Attempted observations include valid answers, refusals, and errors. The app shows each count separately; missing and refused answers are not quietly treated as valid answers.
- AI mention rate = valid answers labelled as mentioning the client by a human / all valid answers in the cohort. Recommendation rate uses the same denominator and the human recommendation label. Both rates are withheld until every valid answer in the displayed cohort has a review; a zero-valid-answer cohort has an undefined rate.
- Reddit source rate = valid answers with at least one user-supplied HTTPS Reddit/redd.it citation URL / all valid answers. Multiple Reddit URLs in one answer count once. A URL is not proof that the provider generated the citation or cited an agency comment.
- The newest review version determines each answer's labels. Review corrections preserve older versions. The UI caps the displayed run sample and blocks summary calculations when it cannot load the entire cohort.

## Next metric modules

- Own-domain citation rates need a verified domain inventory and source validation before implementation. A duplicate citation URL in one answer must count the answer once.
- A Reddit citation rate is distinct from brand mention or recommendation. A thread citation is not proof of citing an agency comment.
- Positive independent mention share = positive independent mentions / all classified independent mentions, including neutral and mixed. Unclassified and unknown affiliation counts are displayed separately.
- Share of voice = brand mention events / mention events for the fixed tracked brand set and monitored universe; each brand counts at most once per Reddit item.
- Percentage-point change is new percentage minus baseline percentage. Relative percent change is `(new-old)/old × 100`. When the baseline rate is zero, relative change and multiple are undefined.

Required example: 2/20 to 10/20 = 10% to 50%, eight additional qualifying answers, +40 percentage points, +400% relative change, and 5× the original rate. If there are three repeats of 20 prompts, the planned answer count is 60, not 20.

Manual AI rates are exposed for saved, reviewed cohorts only. Automated provider collection, citation verification, search metrics, and approved report snapshots are **not yet implemented**. Their calculation versions, classification rules, exclusions, model/configuration hashes, and report datasets must be frozen with approved reports.
