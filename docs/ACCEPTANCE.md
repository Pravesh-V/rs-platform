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
