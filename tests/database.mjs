import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite();
await db.exec(`
  create role anon;
  create role authenticated;
  create schema auth;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid
  $$;
`);
const sql = readFileSync(new URL('../supabase/migrations/20260926000100_foundation.sql', import.meta.url), 'utf8');
await db.exec(sql);
await db.exec(readFileSync(new URL('../supabase/migrations/20260927000100_client_owner_read.sql', import.meta.url), 'utf8'));
console.log('Migration executed in PGlite.');
const org = '11111111-1111-4111-8111-111111111111';
const owner = '22222222-2222-4222-8222-222222222222';
const researcher = '33333333-3333-4333-8333-333333333333';
const a = '44444444-4444-4444-8444-444444444444';
const b = '55555555-5555-4555-8555-555555555555';
await db.exec(`
  insert into auth.users(id) values ('${owner}'),('${researcher}');
  insert into public.organizations(id,name) values ('${org}','Agency');
  insert into public.memberships(organization_id,user_id,role) values
    ('${org}','${owner}','owner'),('${org}','${researcher}','researcher');
  insert into public.clients(id,organization_id,name) values
    ('${a}','${org}','A'),('${b}','${org}','B');
  insert into public.client_access(client_id,organization_id,user_id,role)
    values ('${a}','${org}','${researcher}','researcher');
  insert into public.client_facts(client_id,kind,statement)
    values ('${b}','product','B-only fact');
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
await assert.rejects(db.query('insert into public.clients(organization_id,name) values ($1,$2) returning id', [org,'Denied client']));
for (const rpcSignature of ['public.commit_reddit_import(uuid,uuid,text,text,jsonb)','public.record_contribution(uuid,uuid,text,text,text,text,text,text,timestamptz)']) {
  assert.equal((await db.query('select has_function_privilege($1,$2,$3) as allowed', ['anon',rpcSignature,'EXECUTE'])).rows[0].allowed,false,`${rpcSignature} should deny anonymous calls`);
  assert.equal((await db.query('select has_function_privilege($1,$2,$3) as allowed', ['authenticated',rpcSignature,'EXECUTE'])).rows[0].allowed,true,`${rpcSignature} should allow authenticated calls`);
}
for (const table of ['reddit_items','metric_snapshots','contributions','import_batches','audit_events']) {
  assert.equal((await db.query('select has_table_privilege($1,$2,$3) as allowed', ['authenticated',`public.${table}`,'INSERT'])).rows[0].allowed,false,`${table} should require an RPC`);
  assert.equal((await db.query('select has_table_privilege($1,$2,$3) as allowed', ['anon',`public.${table}`,'SELECT'])).rows[0].allowed,false,`${table} should not be visible anonymously`);
}
await db.exec(`set role anon`);
await assert.rejects(db.query('select name from public.clients'));
console.log('Basic role isolation and anonymous denial passed.');
await db.exec(`set role authenticated; set request.jwt.claim.sub = '${researcher}'`);
assert.equal((await db.query('select count(*)::int as count from public.client_facts')).rows[0].count,0);
await db.query('insert into public.client_facts(client_id,kind,statement) values ($1,$2,$3)',[a,'product','Example']);
assert.equal((await db.query('select count(*)::int as count from public.client_facts')).rows[0].count,1);
await assert.rejects(db.query('insert into public.client_facts(client_id,kind,statement) values ($1,$2,$3)',[b,'product','Denied']));
await assert.rejects(db.query('insert into public.metric_snapshots(client_id,item_id,observed_at,source_type) values ($1,$2,$3,$4)',[a,a,'2026-09-02T00:00:00Z','manual']));
const campaign = '99999999-9999-4999-8999-999999999999';
await db.query('insert into public.campaigns(id,client_id,name,baseline_start,baseline_end,comparison_start,comparison_end) values ($1,$2,$3,$4,$5,$6,$7)',[campaign,a,'Example campaign','2026-09-01','2026-09-03','2026-10-01','2026-10-03']);
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
const contributionSql = 'select public.record_contribution($1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz) as id';
const contributionArgs = [a,null,'t3_def456','https://www.reddit.com/r/tools/comments/def456/','tools','post','Published example','post','2026-09-03T00:00:00Z'];
const contributionId = (await db.query(contributionSql,contributionArgs)).rows[0].id;
assert.equal((await db.query(contributionSql,contributionArgs)).rows[0].id,contributionId);
await assert.rejects(db.query(contributionSql,[...contributionArgs.slice(0,7),'comment',contributionArgs[8]]));
await assert.rejects(db.query(contributionSql,[b,...contributionArgs.slice(1)]));
assert.equal((await db.query('select count(*)::int as count from public.contributions')).rows[0].count,1);
assert.equal((await db.query('select verification_status from public.contributions')).rows[0].verification_status,'user_reported');
console.log('RPC access, two-period evidence, idempotency and conflict checks passed.');
const saved = await db.dumpDataDir();
await db.close();
const reopened = new PGlite({loadDataDir:saved});
assert.equal((await reopened.query('select count(*)::int as count from public.metric_snapshots')).rows[0].count,2);
assert.equal((await reopened.query('select count(*)::int as count from public.import_batches')).rows[0].count,2);
console.log('Evidence survived an embedded database restart.');
await reopened.close();
