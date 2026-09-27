import type { SupabaseClient } from "@supabase/supabase-js";
import { DateTime } from "luxon";
import { retryIdempotentRequest } from "./idempotent-insert";
import type { Observation } from "./metrics";

export type RedditItem = {
  id: string; external_id: string; canonical_url: string; subreddit: string; item_type: string;
  published_at: string | null; affiliation: string; campaign_id: string | null;
};

export type Snapshot = Observation & { id: string; source_type: string };

export function periodBounds(start: string, end: string, zone: string): [string,string] {
  const first = DateTime.fromISO(start, { zone }).startOf("day");
  const lastExclusive = DateTime.fromISO(end, { zone }).plus({ days: 1 }).startOf("day");
  if (!first.isValid || !lastExclusive.isValid || first >= lastExclusive) throw new Error("Invalid campaign dates or timezone.");
  return [first.toUTC().toISO()!, lastExclusive.toUTC().toISO()!];
}

async function pages<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const output: T[] = [];
  for (let from = 0; from < 10000; from += 500) {
    const result = await retryIdempotentRequest(async () => fetchPage(from, from + 499));
    if (result.error) throw new Error(result.error.message);
    const part = result.data ?? [];
    output.push(...part);
    if (part.length < 500) return { rows: output, truncated: false };
  }
  return { rows: output, truncated: true };
}

export async function evidence(db: SupabaseClient, clientId: string) {
  const items = await pages<RedditItem>((from,to) => db.from("reddit_items").select("id,external_id,canonical_url,subreddit,item_type,published_at,affiliation,campaign_id").eq("client_id",clientId).order("id").range(from,to));
  const snapshots = await pages<Snapshot>((from,to) => db.from("metric_snapshots").select("id,item_id,observed_at,source_type,views,score,replies,shares").eq("client_id",clientId).order("id").range(from,to));
  return { items: items.rows, snapshots: snapshots.rows, truncated: items.truncated || snapshots.truncated };
}
