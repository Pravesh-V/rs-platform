import type { RedditItem, Snapshot } from "./data";

export function safeCell(value: unknown) {
  const string = value === null || value === undefined ? "" : String(value);
  const neutralized = typeof value !== "number" && /^[\s\t\r\n]*[=+\-@]/.test(string) ? `'${string}` : string;
  return `"${neutralized.replaceAll('"','""')}"`;
}

export function evidenceCsv(items: RedditItem[], snapshots: Snapshot[]) {
  const itemMap = new Map(items.map((item) => [item.id, item]));
  const names = ["external_id","url","subreddit","item_type","affiliation","published_at","observed_at","views_lifetime","score","replies","shares","source_type"];
  const rows = snapshots.map((observation) => {
    const item = itemMap.get(observation.item_id);
    return [item?.external_id,item?.canonical_url,item?.subreddit,item?.item_type,item?.affiliation,item?.published_at,observation.observed_at,observation.views,observation.score,observation.replies,observation.shares,observation.source_type];
  });
  return [names.map(safeCell).join(","),...rows.map((row) => row.map(safeCell).join(","))].join("\r\n") + "\r\n";
}
