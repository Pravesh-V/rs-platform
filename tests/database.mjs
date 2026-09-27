import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite();
await db.exec(`
  create role anon;
  create role authenticated;
  alter default privileges in schema public grant execute on functions to anon;
  create schema auth;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid
  $$;
`);
const sql = readFileSync(new URL('../supabase/migrations/20260926000100_foundation.sql', import.meta.url), 'utf8');
await db.exec(sql);
await db.exec(readFileSync(new URL('../supabase/migrations/20260927000100_client_owner_read.sql', import.meta.url), 'utf8'));
await db.exec(readFileSync(new URL('../supabase/migrations/20260927000200_fact_review.sql', import.meta.url), 'utf8'));
await db.exec(readFileSync(new URL('../supabase/migrations/20260927000300_rpc_anon_privileges.sql', import.meta.url), 'utf8'));
await db.exec(readFileSync(new URL('../supabase/migrations/20260927000400_manual_research.sql', import.meta.url), 'utf8'));
await db.exec(readFileSync(new URL('../supabase/migrations/20260927000500_content_review.sql', import.meta.url), 'utf8'));
await db.exec(readFileSync(new URL('../supabase/migrations/20260927000600_campaign_history.sql', import.meta.url), 'utf8'));
await db.exec(readFileSync(new URL('../supabase/migrations/20260927000700_sentiment_review.sql', import.meta.url), 'utf8'));
await db.exec(readFileSync(new URL('../supabase/migrations/20260927000800_manual_ai_visibility.sql', import.meta.url), 'utf8'));
await db.exec(readFileSync(new URL('../supabase/migrations/20260927000900_report_snapshots.sql', import.meta.url), 'utf8'));
await db.exec(readFileSync(new URL('../supabase/migrations/20260927001000_manual_search_visibility.sql', import.meta.url), 'utf8'));
console.log('Migration executed in PGlite.');
const org = '11111111-1111-4111-8111-111111111111';
const owner = '22222222-2222-4222-8222-222222222222';
const researcher = '33333333-3333-4333-8333-333333333333';
const manager = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const a = '44444444-4444-4444-8444-444444444444';
const b = '55555555-5555-4555-8555-555555555555';
await db.exec(`
  insert into auth.users(id) values ('${owner}'),('${researcher}'),('${manager}');
  insert into public.organizations(id,name) values ('${org}','Agency');
  insert into public.memberships(organization_id,user_id,role) values
    ('${org}','${owner}','owner'),('${org}','${researcher}','researcher'),('${org}','${manager}','manager');
  insert into public.clients(id,organization_id,name) values
    ('${a}','${org}','A'),('${b}','${org}','B');
  insert into public.client_access(client_id,organization_id,user_id,role)
    values ('${a}','${org}','${researcher}','researcher'),('${a}','${org}','${manager}','manager');
  insert into public.client_facts(client_id,kind,statement)
    values ('${b}','product','B-only fact');
  insert into public.community_research(client_id,subreddit,relevance_note,source_note,created_by)
    values ('${b}','btest','Synthetic B-only community','Synthetic test fixture','${owner}');
  insert into public.opportunities(client_id,external_id,canonical_url,subreddit,title,context_note,priority_reason,source_note,observed_at,created_by)
    values ('${b}','t3_btest123','https://www.reddit.com/r/btest/comments/btest123/','btest','Synthetic B-only thread','Synthetic context','Synthetic priority','Synthetic test fixture','2026-09-02T00:00:00Z','${owner}');
  set role authenticated;
  set request.jwt.claim.sub = '${researcher}';
`);
assert.deepEqual((await db.query('select name from public.clients order by name')).rows.map(row => row.name), ['A']);
await db.exec(`set request.jwt.claim.sub = '${owner}'`);
assert.deepEqual((await db.query('select name from public.clients order by name')).rows.map(row => row.name), ['A','B']);
const newClient = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab';
assert.equal((await db.query('insert into public.clients(id,organization_id,name) values ($1,$2,$3) returning id', [newClient,org,'New client'])).rows[0].id,newClient);
assert.deepEqual((await db.query('select name from public.clients order by name')).rows.map(row => row.name), ['A','B','New client']);
await db.exec(`set request.jwt.claim.sub = '${researcher}'`);
assert.equal((await db.query('select count(*)::int as count from public.community_research')).rows[0].count,0);
assert.equal((await db.query('select count(*)::int as count from public.opportunities')).rows[0].count,0);
await db.query('insert into public.community_research(client_id,subreddit,relevance_note,source_note,created_by) values ($1,$2,$3,$4,$5)',[a,'tools','Synthetic relevance','Synthetic test fixture',researcher]);
await assert.rejects(db.query('insert into public.community_research(client_id,subreddit,relevance_note,source_note,created_by) values ($1,$2,$3,$4,$5)',[b,'denied','Synthetic relevance','Synthetic test fixture',researcher]));
const opportunityId = (await db.query('insert into public.opportunities(client_id,external_id,canonical_url,subreddit,title,context_note,priority_reason,source_note,observed_at,created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id',[a,'t3_abc123','https://www.reddit.com/r/tools/comments/abc123/','tools','Synthetic A thread','Synthetic context','Synthetic priority','Synthetic test fixture','2026-09-02T00:00:00Z',researcher])).rows[0].id;
await assert.rejects(db.query('update public.opportunities set status = $1 where id = $2',['reviewed',opportunityId]));
const statusSql = 'select public.set_opportunity_status($1,$2,$3) as id';
assert.equal((await db.query(statusSql,[a,opportunityId,'reviewed'])).rows[0].id,opportunityId);
assert.equal((await db.query(statusSql,[a,opportunityId,'reviewed'])).rows[0].id,opportunityId);
await assert.rejects(db.query(statusSql,[b,opportunityId,'dismissed']));
assert.equal((await db.query('select status from public.opportunities where id = $1',[opportunityId])).rows[0].status,'reviewed');
assert.equal((await db.query('select count(*)::int as count from public.opportunities')).rows[0].count,1);
await assert.rejects(db.query('insert into public.clients(organization_id,name) values ($1,$2) returning id', [org,'Denied client']));
for (const rpcSignature of ['public.commit_reddit_import(uuid,uuid,text,text,jsonb)','public.record_contribution(uuid,uuid,text,text,text,text,text,text,timestamptz)','public.review_client_fact(uuid,uuid,text,text)','public.set_opportunity_status(uuid,uuid,text)']) {
  assert.equal((await db.query('select has_function_privilege($1,$2,$3) as allowed', ['anon',rpcSignature,'EXECUTE'])).rows[0].allowed,false,`${rpcSignature} should deny anonymous calls`);
  assert.equal((await db.query('select has_function_privilege($1,$2,$3) as allowed', ['authenticated',rpcSignature,'EXECUTE'])).rows[0].allowed,true,`${rpcSignature} should allow authenticated calls`);
}
for (const table of ['reddit_items','metric_snapshots','contributions','import_batches','audit_events']) {
  assert.equal((await db.query('select has_table_privilege($1,$2,$3) as allowed', ['authenticated',`public.${table}`,'INSERT'])).rows[0].allowed,false,`${table} should require an RPC`);
  assert.equal((await db.query('select has_table_privilege($1,$2,$3) as allowed', ['anon',`public.${table}`,'SELECT'])).rows[0].allowed,false,`${table} should not be visible anonymously`);
}
for (const table of ['community_research','opportunities']) {
  assert.equal((await db.query('select has_table_privilege($1,$2,$3) as allowed', ['anon',`public.${table}`,'SELECT'])).rows[0].allowed,false,`${table} should not be visible anonymously`);
}
await db.exec(`set role anon`);
await assert.rejects(db.query('select name from public.clients'));
console.log('Basic role isolation and anonymous denial passed.');
await db.exec(`set role authenticated; set request.jwt.claim.sub = '${researcher}'`);
assert.equal((await db.query('select count(*)::int as count from public.client_facts')).rows[0].count,0);
const factId = (await db.query('insert into public.client_facts(client_id,kind,statement) values ($1,$2,$3) returning id',[a,'product','Example'])).rows[0].id;
assert.equal((await db.query('select count(*)::int as count from public.client_facts')).rows[0].count,1);
await assert.rejects(db.query('insert into public.client_facts(client_id,kind,statement) values ($1,$2,$3)',[b,'product','Denied']));
await assert.rejects(db.query('update public.client_facts set review_status = $1 where id = $2',['approved',factId]));
const reviewSql = 'select public.review_client_fact($1,$2,$3,$4) as id';
await assert.rejects(db.query(reviewSql,[a,factId,'approved','Reviewed source']));
await db.exec(`set request.jwt.claim.sub = '${owner}'`);
const bFactId = (await db.query('select id from public.client_facts where client_id = $1',[b])).rows[0].id;
await assert.rejects(db.query(reviewSql,[a,bFactId,'approved','Wrong client']));
assert.equal((await db.query(reviewSql,[a,factId,'approved','Reviewed source'])).rows[0].id,factId);
assert.equal((await db.query(reviewSql,[a,factId,'approved','Reviewed source'])).rows[0].id,factId);
assert.deepEqual((await db.query('select review_status,reviewed_by,review_note from public.client_facts where id = $1',[factId])).rows[0],{review_status:'approved',reviewed_by:owner,review_note:'Reviewed source'});
assert.equal((await db.query("select count(*)::int as count from public.audit_events where event_type = 'fact_reviewed'")).rows[0].count,1);
await db.exec(`set request.jwt.claim.sub = '${manager}'`);
assert.equal((await db.query(reviewSql,[a,factId,'stale','Needs recheck'])).rows[0].id,factId);
assert.deepEqual((await db.query('select review_status,reviewed_by from public.client_facts where id = $1',[factId])).rows[0],{review_status:'stale',reviewed_by:manager});
await assert.rejects(db.query(reviewSql,[b,bFactId,'approved','Wrong client']));
await db.exec(`set request.jwt.claim.sub = '${owner}'`);
assert.equal((await db.query("select count(*)::int as count from public.audit_events where event_type = 'fact_reviewed'")).rows[0].count,2);
assert.equal((await db.query("select count(*)::int as count from public.audit_events where event_type = 'opportunity_status_changed'")).rows[0].count,1);
await db.exec(`set request.jwt.claim.sub = '${researcher}'`);
await assert.rejects(db.query('insert into public.metric_snapshots(client_id,item_id,observed_at,source_type) values ($1,$2,$3,$4)',[a,a,'2026-09-02T00:00:00Z','manual']));
const campaign = '99999999-9999-4999-8999-999999999999';
await db.query('insert into public.campaigns(id,client_id,name,baseline_start,baseline_end,comparison_start,comparison_end) values ($1,$2,$3,$4,$5,$6,$7)',[campaign,a,'Example campaign','2026-09-01','2026-09-03','2026-10-01','2026-10-03']);
assert.deepEqual((await db.query('select version,origin,actor_id from public.campaign_versions where campaign_id=$1',[campaign])).rows[0],{version:1,origin:'created',actor_id:researcher});
const reviseCampaignSql = 'select public.revise_campaign($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as version';
const campaignRevisionArgs = [a,campaign,1,'Example campaign','Qualified signups','2026-09-01','2026-09-04','2026-10-01','2026-10-04','Extended both windows with source coverage'];
assert.equal((await db.query(reviseCampaignSql,campaignRevisionArgs)).rows[0].version,2);
assert.equal((await db.query(reviseCampaignSql,campaignRevisionArgs)).rows[0].version,2);
await assert.rejects(db.query(reviseCampaignSql,[...campaignRevisionArgs.slice(0,3),'Changed title',...campaignRevisionArgs.slice(4)]));
await assert.rejects(db.query(reviseCampaignSql,[b,campaign,...campaignRevisionArgs.slice(2)]));
assert.equal((await db.query('select count(*)::int as count from public.campaign_versions where campaign_id=$1',[campaign])).rows[0].count,2);
await assert.rejects(db.query('update public.campaigns set name=$1 where id=$2',['Bypass history',campaign]));
const campaignEventId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const campaignEventSql = 'select public.record_campaign_event($1,$2,$3,$4,$5::timestamptz,$6,$7) as id';
const campaignEventArgs = [campaignEventId,a,campaign,'pricing_change','2026-09-20T12:00:00Z','Synthetic price change','Synthetic editorial test'];
assert.equal((await db.query(campaignEventSql,campaignEventArgs)).rows[0].id,campaignEventId);
assert.equal((await db.query(campaignEventSql,campaignEventArgs)).rows[0].id,campaignEventId);
await assert.rejects(db.query(campaignEventSql,[campaignEventId,a,campaign,'pricing_change','2026-09-20T12:00:00Z','Different description','Synthetic editorial test']));
await assert.rejects(db.query(campaignEventSql,['eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeef',b,campaign,'launch','2026-09-20T12:00:00Z','Denied','Synthetic editorial test']));
assert.equal((await db.query('select count(*)::int as count from public.campaign_events where campaign_id=$1',[campaign])).rows[0].count,1);
const row = { external_id: 't3_abc123', canonical_url: 'https://www.reddit.com/r/tools/comments/abc123/', subreddit: 'tools', item_type: 'post', published_at: '2026-09-01T00:00:00Z', affiliation: 'independent', campaign_id: campaign, title: 'Example', body: null, observed_at: '2026-09-02T00:00:00Z', views: 10, score: 3, replies: 0, shares: null };
const key = '66666666-6666-4666-8666-666666666666';
const importSql = 'select public.commit_reddit_import($1,$2,$3,$4,$5::jsonb) as id';
const args = [a,key,'example.csv','Permissioned export',JSON.stringify([row])];
const batch = (await db.query(importSql,args)).rows[0].id;
assert.equal((await db.query(importSql,args)).rows[0].id,batch);
await assert.rejects(db.query(importSql,[a,key,'example.csv','Changed note',JSON.stringify([row])]));
await assert.rejects(db.query(importSql,[b,'77777777-7777-4777-8777-777777777777','example.csv','Permissioned export',JSON.stringify([row])]));
await assert.rejects(db.query(importSql,[a,'88888888-8888-4888-8888-888888888888','example.csv','Permissioned export',JSON.stringify([{...row,views:11}])]));
const later = {...row,observed_at:'2026-10-02T00:00:00Z',views:50,score:5};
await db.query(importSql,[a,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','later.csv','Permissioned export',JSON.stringify([later])]);
assert.deepEqual((await db.query('select views::int as views from public.metric_snapshots order by observed_at')).rows.map(row => row.views),[10,50]);
assert.equal((await db.query('select count(*)::int as count from public.import_batches')).rows[0].count,2);
const itemId = (await db.query('select id from public.reddit_items where client_id=$1 and external_id=$2',[a,'t3_abc123'])).rows[0].id;
const sentimentSql = 'select public.review_reddit_sentiment($1,$2,$3,$4,$5,$6) as version';
const firstReview = [a,itemId,0,'mixed','pricing','Synthetic manual review'];
assert.equal((await db.query(sentimentSql,firstReview)).rows[0].version,1);
assert.equal((await db.query(sentimentSql,firstReview)).rows[0].version,1);
await assert.rejects(db.query(sentimentSql,[a,itemId,0,'positive','pricing','Changed stale review']));
await assert.rejects(db.query(sentimentSql,[b,itemId,0,'positive','pricing','Wrong client']));
await assert.rejects(db.query('update public.sentiment_reviews set label=$1 where item_id=$2',['positive',itemId]));
assert.equal((await db.query(sentimentSql,[a,itemId,1,'positive','product','Synthetic corrected review'])).rows[0].version,2);
assert.equal((await db.query('select count(*)::int as count from public.sentiment_review_versions where item_id=$1',[itemId])).rows[0].count,2);
assert.equal((await db.query('select label from public.sentiment_reviews where item_id=$1',[itemId])).rows[0].label,'positive');
for (const table of ['sentiment_reviews','sentiment_review_versions']) {
  assert.equal((await db.query('select has_table_privilege($1,$2,$3) as allowed',['authenticated',`public.${table}`,'INSERT'])).rows[0].allowed,false);
  assert.equal((await db.query('select has_table_privilege($1,$2,$3) as allowed',['anon',`public.${table}`,'SELECT'])).rows[0].allowed,false);
}
assert.equal((await db.query('select has_function_privilege($1,$2,$3) as allowed',['anon','public.review_reddit_sentiment(uuid,uuid,integer,text,text,text)','EXECUTE'])).rows[0].allowed,false);
const contributionSql = 'select public.record_contribution($1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz) as id';
const contributionArgs = [a,null,'t3_def456','https://www.reddit.com/r/tools/comments/def456/','tools','post','Published example','post','2026-09-03T00:00:00Z'];
const contributionId = (await db.query(contributionSql,contributionArgs)).rows[0].id;
assert.equal((await db.query(contributionSql,contributionArgs)).rows[0].id,contributionId);
await assert.rejects(db.query(contributionSql,[...contributionArgs.slice(0,7),'comment',contributionArgs[8]]));
await assert.rejects(db.query(contributionSql,[b,...contributionArgs.slice(1)]));
assert.equal((await db.query('select count(*)::int as count from public.contributions')).rows[0].count,1);
assert.equal((await db.query('select verification_status from public.contributions')).rows[0].verification_status,'user_reported');
const draftId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const createDraftSql = 'select public.create_content_draft($1,$2,$3,$4,$5,$6,$7) as id';
const draftArgs = [draftId,a,campaign,opportunityId,'Helpful reply','Answer with a source, no sales claim.','Synthetic editorial test'];
assert.equal((await db.query(createDraftSql,draftArgs)).rows[0].id,draftId);
assert.equal((await db.query(createDraftSql,draftArgs)).rows[0].id,draftId);
await assert.rejects(db.query(createDraftSql,[draftId,a,campaign,opportunityId,'Changed','Answer with a source, no sales claim.','Synthetic editorial test']));
await assert.rejects(db.query(createDraftSql,['ffffffff-ffff-4fff-8fff-ffffffffffff',b,null,null,'Denied','No access','Synthetic editorial test']));
assert.equal((await db.query('select count(*)::int as count from public.content_drafts')).rows[0].count,1);
assert.equal((await db.query('select count(*)::int as count from public.content_draft_versions')).rows[0].count,1);
await assert.rejects(db.query('update public.content_drafts set status=$1 where id=$2',['approved',draftId]));
const reviewDraftSql = 'select public.review_content_draft($1,$2,$3,$4,$5) as id';
assert.equal((await db.query(reviewDraftSql,[a,draftId,1,'submit',null])).rows[0].id,draftId);
assert.equal((await db.query(reviewDraftSql,[a,draftId,1,'submit',null])).rows[0].id,draftId);
await assert.rejects(db.query(reviewDraftSql,[a,draftId,1,'approve','Cannot self-approve as researcher']));
await assert.rejects(db.query(reviewDraftSql,[b,draftId,1,'request_revision','Wrong client']));
await db.exec(`set request.jwt.claim.sub = '${manager}'`);
assert.equal((await db.query(reviewDraftSql,[a,draftId,1,'request_revision','Add a primary source'])).rows[0].id,draftId);
await db.exec(`set request.jwt.claim.sub = '${researcher}'`);
const reviseDraftSql = 'select public.revise_content_draft($1,$2,$3,$4,$5,$6) as version';
const revisionArgs = [a,draftId,1,'Helpful reply','Updated answer with a primary source.','Synthetic editorial test'];
assert.equal((await db.query(reviseDraftSql,revisionArgs)).rows[0].version,2);
assert.equal((await db.query(reviseDraftSql,revisionArgs)).rows[0].version,2);
await assert.rejects(db.query(reviseDraftSql,[a,draftId,1,'Different edit','Stale version','Synthetic editorial test']));
await assert.rejects(db.query(reviewDraftSql,[a,draftId,1,'submit',null]));
assert.equal((await db.query(reviewDraftSql,[a,draftId,2,'submit',null])).rows[0].id,draftId);
await db.exec(`set request.jwt.claim.sub = '${manager}'`);
assert.equal((await db.query(reviewDraftSql,[a,draftId,2,'approve','Source checked'])).rows[0].id,draftId);
assert.equal((await db.query(reviewDraftSql,[a,draftId,2,'approve','Source checked'])).rows[0].id,draftId);
assert.deepEqual((await db.query('select current_version,status,approved_by from public.content_drafts where id=$1',[draftId])).rows[0],{current_version:2,status:'approved',approved_by:manager});
assert.equal((await db.query('select count(*)::int as count from public.content_review_events where draft_id=$1',[draftId])).rows[0].count,4);
await db.exec(`set request.jwt.claim.sub = '${researcher}'`);
assert.equal((await db.query(reviseDraftSql,[a,draftId,2,'Helpful reply','Third revision with another source.','Synthetic editorial test'])).rows[0].version,3);
assert.deepEqual((await db.query('select status,approved_by from public.content_drafts where id=$1',[draftId])).rows[0],{status:'draft',approved_by:null});
for (const rpcSignature of ['public.create_content_draft(uuid,uuid,uuid,uuid,text,text,text)','public.revise_content_draft(uuid,uuid,integer,text,text,text)','public.review_content_draft(uuid,uuid,integer,text,text)']) {
  assert.equal((await db.query('select has_function_privilege($1,$2,$3) as allowed',['anon',rpcSignature,'EXECUTE'])).rows[0].allowed,false);
  assert.equal((await db.query('select has_function_privilege($1,$2,$3) as allowed',['authenticated',rpcSignature,'EXECUTE'])).rows[0].allowed,true);
}
for (const table of ['content_drafts','content_draft_versions','content_review_events','campaign_versions','campaign_events']) {
  assert.equal((await db.query('select has_table_privilege($1,$2,$3) as allowed',['authenticated',`public.${table}`,'INSERT'])).rows[0].allowed,false);
  assert.equal((await db.query('select has_table_privilege($1,$2,$3) as allowed',['anon',`public.${table}`,'SELECT'])).rows[0].allowed,false);
}
await db.exec(`set request.jwt.claim.sub = '${owner}'`);
const bDraftId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
await db.query(createDraftSql,[bDraftId,b,null,null,'B private draft','Do not expose to A','Synthetic B-only fixture']);
await db.exec(`set request.jwt.claim.sub = '${researcher}'`);
assert.equal((await db.query('select count(*)::int as count from public.content_drafts where client_id=$1',[b])).rows[0].count,0);
assert.equal((await db.query('select count(*)::int as count from public.content_draft_versions where client_id=$1',[b])).rows[0].count,0);
assert.equal((await db.query('select count(*)::int as count from public.campaign_versions where client_id=$1',[b])).rows[0].count,0);
await assert.rejects(db.query(reviewDraftSql,[b,bDraftId,1,'submit',null]));
for (const rpcSignature of ['public.revise_campaign(uuid,uuid,integer,text,text,date,date,date,date,text)','public.record_campaign_event(uuid,uuid,uuid,text,timestamp with time zone,text,text)']) {
  assert.equal((await db.query('select has_function_privilege($1,$2,$3) as allowed',['anon',rpcSignature,'EXECUTE'])).rows[0].allowed,false);
  assert.equal((await db.query('select has_function_privilege($1,$2,$3) as allowed',['authenticated',rpcSignature,'EXECUTE'])).rows[0].allowed,true);
}
await db.exec(`set request.jwt.claim.sub = '${owner}'`);
const promptSet = '12121212-1212-4212-8212-121212121212';
const promptId = '13131313-1313-4313-8313-131313131313';
const answerId = '14141414-1414-4414-8414-141414141414';
await db.exec(`set request.jwt.claim.sub = '${researcher}'`);
await db.query('insert into public.ai_prompt_sets(id,client_id,name,version,language,region,planned_repeats,created_by) values($1,$2,$3,$4,$5,$6,$7,$8)',[promptSet,a,'Buyer questions',1,'en','US',3,researcher]);
await assert.rejects(db.query('insert into public.ai_prompt_sets(id,client_id,name,version,language,region,planned_repeats,created_by) values($1,$2,$3,$4,$5,$6,$7,$8)',['15151515-1515-4515-8515-151515151515',b,'Denied',1,'en','US',3,researcher]));
await db.query('insert into public.ai_prompts(id,client_id,prompt_set_id,ordinal,buyer_stage,branded,question,created_by) values($1,$2,$3,$4,$5,$6,$7,$8)',[promptId,a,promptSet,1,'discovery',false,'What tools solve this problem?',researcher]);
const freezeSql = 'select public.freeze_ai_prompt_set($1,$2) as id';
assert.equal((await db.query(freezeSql,[a,promptSet])).rows[0].id,promptSet);
assert.equal((await db.query(freezeSql,[a,promptSet])).rows[0].id,promptSet);
await assert.rejects(db.query('insert into public.ai_prompts(id,client_id,prompt_set_id,ordinal,buyer_stage,branded,question,created_by) values($1,$2,$3,$4,$5,$6,$7,$8)',['16161616-1616-4616-8616-161616161616',a,promptSet,2,'comparison',false,'Which alternative?',researcher]));
const answerSql = 'select public.record_manual_ai_answer($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::timestamptz,$12,$13,$14,$15,$16::jsonb) as id';
const citationJson = JSON.stringify(['https://www.reddit.com/r/tools/comments/abc123/','https://example.com/source']);
const answerArgs = [answerId,a,promptSet,promptId,'2026-09 baseline','Example provider','Example model','manual_consumer','English, US, search on',1,'2026-09-20T12:00:00Z','valid','An example answer with source links.',null,'Synthetic manual sample',citationJson];
assert.equal((await db.query(answerSql,answerArgs)).rows[0].id,answerId);
assert.equal((await db.query(answerSql,answerArgs)).rows[0].id,answerId);
await assert.rejects(db.query(answerSql,[...answerArgs.slice(0,12),'Changed answer',...answerArgs.slice(13)]));
await assert.rejects(db.query(answerSql,['17171717-1717-4717-8717-171717171717',...answerArgs.slice(1)]));
await assert.rejects(db.query(answerSql,['18181818-1818-4818-8818-181818181818',b,...answerArgs.slice(2)]));
await assert.rejects(db.query('insert into public.ai_answer_runs(id,client_id,prompt_set_id,prompt_id,wave_label,provider,model_label,collection_method,config_note,repeat_no,observed_at,outcome,answer_text,source_note,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)',[answerId,a,promptSet,promptId,'other','X','Y','manual_consumer','Z',2,'2026-09-21T00:00:00Z','valid','No','Synthetic test',researcher]));
assert.equal((await db.query('select count(*)::int as count from public.ai_citations where run_id=$1',[answerId])).rows[0].count,2);
const reviewAnswerSql = 'select public.review_ai_answer($1,$2,$3,$4,$5,$6) as version';
await assert.rejects(db.query(reviewAnswerSql,[a,answerId,0,true,true,'Researcher should not approve']));
await db.exec(`set request.jwt.claim.sub = '${manager}'`);
await assert.rejects(db.query(reviewAnswerSql,[a,answerId,0,false,true,'Recommendation implies mention']));
assert.equal((await db.query(reviewAnswerSql,[a,answerId,0,true,false,'Client named but not recommended'])).rows[0].version,1);
assert.equal((await db.query(reviewAnswerSql,[a,answerId,0,true,false,'Client named but not recommended'])).rows[0].version,1);
assert.equal((await db.query(reviewAnswerSql,[a,answerId,1,true,true,'Explicit recommendation verified'])).rows[0].version,2);
assert.equal((await db.query('select count(*)::int as count from public.ai_answer_reviews where run_id=$1',[answerId])).rows[0].count,2);
await db.exec(`set request.jwt.claim.sub = '${owner}'`);
const bSet = '19191919-1919-4919-8919-191919191919';
await db.query('insert into public.ai_prompt_sets(id,client_id,name,version,language,region,planned_repeats,created_by) values($1,$2,$3,$4,$5,$6,$7,$8)',[bSet,b,'Private B prompts',1,'en','US',1,owner]);
await db.exec(`set request.jwt.claim.sub = '${researcher}'`);
assert.equal((await db.query('select count(*)::int as count from public.ai_prompt_sets where client_id=$1',[b])).rows[0].count,0);
assert.equal((await db.query('select count(*)::int as count from public.ai_answer_runs where client_id=$1',[b])).rows[0].count,0);
for (const table of ['ai_answer_runs','ai_citations','ai_answer_reviews']) {
  assert.equal((await db.query('select has_table_privilege($1,$2,$3) as allowed',['authenticated',`public.${table}`,'INSERT'])).rows[0].allowed,false);
  assert.equal((await db.query('select has_table_privilege($1,$2,$3) as allowed',['anon',`public.${table}`,'SELECT'])).rows[0].allowed,false);
}
for (const signature of ['public.freeze_ai_prompt_set(uuid,uuid)','public.record_manual_ai_answer(uuid,uuid,uuid,uuid,text,text,text,text,text,integer,timestamp with time zone,text,text,text,text,jsonb)','public.review_ai_answer(uuid,uuid,integer,boolean,boolean,text)']) {
  assert.equal((await db.query('select has_function_privilege($1,$2,$3) as allowed',['anon',signature,'EXECUTE'])).rows[0].allowed,false);
}
await db.exec(`set request.jwt.claim.sub = '${owner}'`);
const reportId = '20202020-2020-4020-8020-202020202020';
const reportSql = 'select public.create_report_snapshot($1,$2,$3,$4::date,$5,$6,$7) as id';
const reportArgs = [reportId,a,campaign,'2026-10-01','Synthetic observation summary','Check missing views next month','Synthetic fixture; no attribution'];
await db.exec(`set request.jwt.claim.sub = '${researcher}'`);
await assert.rejects(db.query(reportSql,reportArgs));
await db.exec(`set request.jwt.claim.sub = '${manager}'`);
assert.equal((await db.query(reportSql,reportArgs)).rows[0].id,reportId);
assert.equal((await db.query(reportSql,reportArgs)).rows[0].id,reportId);
await assert.rejects(db.query(reportSql,[reportId,b,campaign,...reportArgs.slice(3)]));
const report = (await db.query('select version,status,dataset,dataset_sha256 from public.report_snapshots where id=$1',[reportId])).rows[0];
assert.equal(report.version,1);
assert.equal(report.status,'draft');
assert.equal(report.dataset.baseline.latest_lifetime_views,10);
assert.equal(report.dataset.comparison.latest_lifetime_views,50);
assert.equal(report.dataset.matched.change,40);
assert.equal(report.dataset.evidence_snapshot_ids.length,2);
assert.match(report.dataset_sha256,/^[a-f0-9]{64}$/);
await assert.rejects(db.query('update public.report_snapshots set executive_summary=$1 where id=$2',['Tampered',reportId]));
const approveReportSql = 'select public.approve_report_snapshot($1,$2,$3) as id';
assert.equal((await db.query(approveReportSql,[a,reportId,'Reviewed synthetic observations'])).rows[0].id,reportId);
assert.equal((await db.query(approveReportSql,[a,reportId,'Reviewed synthetic observations'])).rows[0].id,reportId);
await assert.rejects(db.query(approveReportSql,[b,reportId,'Wrong client']));
await db.exec(`set request.jwt.claim.sub = '${owner}'`);
assert.equal((await db.query('select count(*)::int as count from public.audit_events where record_id=$1',[reportId])).rows[0].count,2);
await db.exec(`set request.jwt.claim.sub = '${researcher}'`);
await assert.rejects(db.query(approveReportSql,[a,reportId,'Researcher approval denied']));
assert.equal((await db.query('select count(*)::int as count from public.report_snapshots where client_id=$1',[b])).rows[0].count,0);
for (const signature of ['public.create_report_snapshot(uuid,uuid,uuid,date,text,text,text)','public.approve_report_snapshot(uuid,uuid,text)']) {
  assert.equal((await db.query('select has_function_privilege($1,$2,$3) as allowed',['anon',signature,'EXECUTE'])).rows[0].allowed,false);
}
assert.equal((await db.query('select has_table_privilege($1,$2,$3) as allowed',['authenticated','public.report_snapshots','INSERT'])).rows[0].allowed,false);
await db.exec(`set request.jwt.claim.sub = '${owner}'`);
const searchSet = '25252525-2525-4252-8252-252525252525';
const keyword = '26262626-2626-4262-8262-262626262626';
const searchObservation = '27272727-2727-4272-8272-272727272727';
await db.exec(`set request.jwt.claim.sub = '${researcher}'`);
await db.query('insert into public.search_sets(id,client_id,name,version,engine,region,language,device,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',[searchSet,a,'Discovery terms',1,'Google Search','US','en','desktop',researcher]);
await assert.rejects(db.query('insert into public.search_sets(id,client_id,name,version,engine,region,language,device,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',['28282828-2828-4282-8282-282828282828',b,'Denied',1,'Google Search','US','en','desktop',researcher]));
await db.query('insert into public.search_keywords(id,client_id,set_id,ordinal,phrase,created_by) values($1,$2,$3,$4,$5,$6)',[keyword,a,searchSet,1,'best example tools',researcher]);
await assert.rejects(db.query('insert into public.search_observations(id,client_id,set_id,keyword_id,wave_label,observed_at,source_provider,sampling_method,result_type,outcome,rank,ranking_url,source_note,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',[searchObservation,a,searchSet,keyword,'baseline','2026-09-20T12:00:00Z','Manual browser','manual_serp','organic','present',3,'https://www.reddit.com/r/tools/comments/abc123/','Synthetic fixture',researcher]));
const freezeSearchSql = 'select public.freeze_search_set($1,$2) as id';
assert.equal((await db.query(freezeSearchSql,[a,searchSet])).rows[0].id,searchSet);
assert.equal((await db.query(freezeSearchSql,[a,searchSet])).rows[0].id,searchSet);
await assert.rejects(db.query('insert into public.search_keywords(id,client_id,set_id,ordinal,phrase,created_by) values($1,$2,$3,$4,$5,$6)',['29292929-2929-4292-8292-292929292929',a,searchSet,2,'another term',researcher]));
await db.query('insert into public.search_observations(id,client_id,set_id,keyword_id,wave_label,observed_at,source_provider,sampling_method,result_type,outcome,rank,ranking_url,source_note,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',[searchObservation,a,searchSet,keyword,'baseline','2026-09-20T12:00:00Z','Manual browser','manual_serp','organic','present',3,'https://www.reddit.com/r/tools/comments/abc123/','Synthetic fixture',researcher]);
await assert.rejects(db.query('insert into public.search_observations(id,client_id,set_id,keyword_id,wave_label,observed_at,source_provider,sampling_method,result_type,outcome,rank,ranking_url,source_note,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',['30303030-3030-4303-8303-303030303030',b,searchSet,keyword,'baseline','2026-09-20T12:00:00Z','Manual browser','manual_serp','organic','present',3,'https://example.com/','Synthetic fixture',researcher]));
await assert.rejects(db.query('insert into public.search_observations(id,client_id,set_id,keyword_id,wave_label,observed_at,source_provider,sampling_method,result_type,outcome,rank,ranking_url,source_note,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',['31313131-3131-4313-8313-313131313131',a,searchSet,keyword,'baseline','2026-09-20T12:00:00Z','Manual browser','manual_serp','organic','present',null,null,'Synthetic fixture',researcher]));
await db.exec(`set request.jwt.claim.sub = '${owner}'`);
await db.query('insert into public.search_sets(id,client_id,name,version,engine,region,language,device,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',['32323232-3232-4323-8323-323232323232',b,'Private B terms',1,'Google Search','US','en','desktop',owner]);
await db.exec(`set request.jwt.claim.sub = '${researcher}'`);
assert.equal((await db.query('select count(*)::int as count from public.search_sets where client_id=$1',[b])).rows[0].count,0);
assert.equal((await db.query('select count(*)::int as count from public.search_observations where client_id=$1',[b])).rows[0].count,0);
assert.equal((await db.query('select has_function_privilege($1,$2,$3) as allowed',['anon','public.freeze_search_set(uuid,uuid)','EXECUTE'])).rows[0].allowed,false);
for (const table of ['search_sets','search_keywords','search_observations']) {
  assert.equal((await db.query('select has_table_privilege($1,$2,$3) as allowed',['anon',`public.${table}`,'SELECT'])).rows[0].allowed,false);
}
await db.exec(`set request.jwt.claim.sub = '${owner}'`);
console.log('RPC access, two-period evidence, idempotency and conflict checks passed.');
const saved = await db.dumpDataDir();
await db.close();
const reopened = new PGlite({loadDataDir:saved});
assert.equal((await reopened.query('select count(*)::int as count from public.metric_snapshots')).rows[0].count,2);
assert.equal((await reopened.query('select count(*)::int as count from public.import_batches')).rows[0].count,2);
console.log('Evidence survived an embedded database restart.');
await reopened.close();
