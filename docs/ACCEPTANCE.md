# Milestone 1 development acceptance

Run this only against an isolated development Supabase project after applying the foundation migration. The app does not contain sample client records. Record the date, tester, database project, and results before marking Milestone 1 complete.

## Setup

1. Create two Auth users: an agency owner and a researcher. Bootstrap the owner and organization with the SQL in the README.
2. Sign in as owner. Create fictional clients A and B, each with a campaign and distinct baseline/comparison dates. Add a company fact to each. Keep both client IDs.
3. In the development SQL editor, substitute the actual IDs in the following statement to give the researcher access to A only:

   ```sql
   insert into public.memberships(organization_id,user_id,role)
   values ('ORG-UUID'::uuid,'RESEARCHER-USER-UUID'::uuid,'researcher');

   insert into public.client_access(client_id,organization_id,user_id,role)
   values ('CLIENT-A-UUID'::uuid,'ORG-UUID'::uuid,'RESEARCHER-USER-UUID'::uuid,'researcher');
   ```

4. Prepare authorized CSV observations with two timestamps for the same Reddit item, one in each campaign period, plus a row with blank `views`. The import form can assign rows with blank `campaign_id` cells to the selected campaign. Use a source note that records permission and collection context. Use only records you are permitted to store. Clearly labelled synthetic records are suitable for the development-only check, but are never live Reddit evidence.

## Owner flow

- Import the CSV into A. The preview must show the row count, unknown views as unknown, and no errors. Commit it. The campaign page must show the newest lifetime counter within each period, the matched-item change, coverage, and source timestamps. The export must contain the same campaign observations and unknown cells must remain blank.
- Submit the same form again without changing the file or source note. It must return the original batch ID and leave item and snapshot counts unchanged.
- Change the source note and resubmit with the same file and idempotency key. It must reject the conflicting request.
- Upload a new file with the same item and observation time but a different view count. It must reject the conflict without partially adding rows.
- Add a published contribution using a real, permitted Reddit URL. Confirm the record persists and that merely creating a campaign or fact did not create a contribution.
- Sign out and back in. Confirm all created records and evidence remain visible. Confirm B has no A evidence.

## Isolation flow

- Sign in as the researcher. Only A should appear in the client list. Opening B's URL directly, its import page, and its CSV export must not reveal B's data. B must not appear through the Supabase API under this user's session.
- The researcher should be able to add an A fact and campaign and import A evidence. Confirm the same actions on B fail even if a direct RPC request is made with B's client ID.
- Sign out and confirm authenticated client URLs no longer reveal records.

## Database checks

- Confirm every application table has RLS enabled, anonymous table access is unavailable, and direct authenticated inserts into `reddit_items`, `metric_snapshots`, `contributions`, `import_batches`, and `audit_events` are denied. The two authorized RPCs must remain callable only by authenticated users with the relevant client role.
- Check the import batch and audit event against the committed rows. Invalid or conflicting batches must leave no partial records.
- Record any failing query and fix the policy or permission before adding live collectors or declaring this milestone complete.

## Development run, 27 September 2026

Project: `rs-platform-dev` (`dhvmgwunrcdzjgbpgrjp`). The owner signed in and created `client 1` through the app. A second explicitly fictional client, `ReddSphere Test B`, and distinct comparison campaigns were inserted under the owner's authenticated database role. The labelled synthetic fixture was committed through `commit_reddit_import` for `client 1`: 2 items, 3 observations, 1 unknown-view observation and 1 batch. Repeating the same request and idempotency key returned the same batch ID; Test B retained zero evidence.

A rolled-back live transaction temporarily gave the owner identity researcher access to `client 1` only. Under that role, the database returned one visible client, zero visibility of Test B and three visible observations. A follow-up query confirmed the owner role was restored and no temporary grant remained. This exercises the live RLS rules but does not replace a separate Auth-user/browser denial test.

A second rolled-back transaction used the same temporary researcher scope to record a synthetic contribution for `client 1` through `record_contribution`, then confirmed the RPC denied Test B with `Client access denied`. The final check showed the owner role restored, zero temporary grants, and zero contribution-test items or rows left behind.

The owner refreshed the signed-in `client 1` page and confirmed baseline views `100`, comparison views `140`, and matched-item change `+40`. The authenticated campaign export downloaded with HTTP 200. The saved CSV contained three observations, lifetime views `100` and `140`, a blank unknown-views cell, and the negative score `-2`.

Two more live import checks ran under the owner's authenticated role in a rolled-back transaction. Reusing the existing idempotency key with different request content raised `Idempotency key was reused for different data`. A new batch attempting to change the existing baseline observation from 100 to 101 views raised `An existing observation has different values; review it as a correction`. Afterwards, `client 1` still had one batch and three observations, with zero batches for the rejected key.

The fact-review migration was applied to the development project. A rolled-back owner transaction created a synthetic fact, approved it twice with the same note, and confirmed one review audit event. No test fact remained. Live privilege inspection found explicit `anon` EXECUTE grants on all three public RPCs despite their earlier PUBLIC revocations; the follow-up migration removed those grants. All three now report `anon` denied and `authenticated` allowed.

A separate temporary, confirmed Supabase Auth user was assigned researcher access to `client 1` only. Using its real email/password session through the public Supabase API, it saw exactly one client and three A observations, zero Test B observations, no direct Test B client row, and `Client access denied` from a Test B import RPC. After signing out, it saw zero clients. An initial denied-write probe hit a transient `fetch failed`; a retry completed with the expected authorization denial. The temporary Auth user was deleted, and a final database query confirmed zero remaining user, membership, and access rows for that identity. Direct protected app URLs and owner sign-out/sign-in persistence still need browser checks.

Still pending: signed-in CSV preview/commit, owner sign-out/sign-in persistence, and direct protected app URL checks in a separate researcher's browser session. The synthetic records are development fixtures, never live Reddit evidence.

The content review migration was applied to `rs-platform-dev`. A rolled-back live transaction temporarily scoped the owner identity as a researcher for `client 1`, created and retried a synthetic draft without duplicate versions, submitted it, and confirmed researcher approval and Test B creation were denied. It restored the owner role inside the transaction, approved the draft, revised it, and confirmed the approval identity was cleared and two versions remained. The final query showed the owner role restored, no temporary grant or draft, and anonymous execution denied for all three draft RPCs. The signed-in draft page still needs a browser check.

The campaign-history migration was applied. Both pre-existing development campaigns received `legacy_snapshot` version 1 rows, without claiming to reconstruct their original creation state. A rolled-back owner transaction revised one campaign and retried the same revision, recorded and retried an intervention, and confirmed one new version and one event. Afterwards the campaign was at version 1, the test event was absent, and anonymous execution of both new RPCs was denied. The signed-in campaign-history page still needs a browser check.

The sentiment-review migration was applied. A rolled-back live owner transaction labeled an existing synthetic `client 1` Reddit item, retried the same review without an extra version, and changed it to a second version. Passing the Test B client ID with the A item was denied. Afterwards zero review rows remained; anonymous RPC execution and direct authenticated inserts were denied. The signed-in sentiment page still needs a browser check.

The manual AI-visibility migration was applied. A rolled-back live owner transaction created a synthetic prompt set, froze it twice, imported one answer twice with one Reddit citation, and submitted the same human review twice. Neither retry duplicated its record. A review request that paired the Test B client ID with the A answer was denied. The final query showed zero test sets and runs, with anonymous execution denied for the answer and review RPCs. The signed-in AI-visibility page and manual form submission still need a browser check; no provider was called.

The report-snapshot migration was applied. A rolled-back live owner transaction created the same synthetic `client 1` report twice and confirmed its frozen database calculations were 100 baseline views, 140 comparison views and +40 matched-item change. It approved the version twice with one note; pairing the Test B client ID with that report was denied. The final query showed zero test reports, anonymous execution denied for both report RPCs, and no direct authenticated table insert. The signed-in report page and protected JSON download still need browser checks. No PDF or client publication exists yet.

The manual search-visibility migration was applied. A rolled-back live owner transaction created and froze a synthetic keyword set twice, then confirmed a new keyword was denied after freezing. It saved an ordinary result observation with a rank and URL; pairing that observation with the Test B client ID was denied. The final query showed zero synthetic sets and observations, with anonymous read and freeze-function access denied. The signed-in search page still needs a browser check. No search or Google AI provider was called.
