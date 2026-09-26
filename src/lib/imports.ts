import { parse } from "csv-parse/sync";
import { z } from "zod";
import { parseNullableInteger, parseRedditUrl, parseTimestamp } from "./reddit";

export const headers = ["url", "title", "text", "published_at", "observed_at", "views", "score", "replies", "shares", "affiliation", "campaign_id"];

export type ImportRow = {
  external_id: string;
  canonical_url: string;
  subreddit: string;
  item_type: "post" | "comment";
  title: string | null;
  body: string | null;
  published_at: string | null;
  observed_at: string;
  views: number | null;
  score: number | null;
  replies: number | null;
  shares: number | null;
  affiliation: "agency" | "brand" | "independent" | "paid_disclosed" | "unknown";
  campaign_id: string | null;
};

export type Preview = { rows: ImportRow[]; errors: { line: number; message: string }[] };

export function previewCsv(input: string): Preview {
  if (new TextEncoder().encode(input).length > 1_000_000) throw new Error("Use a CSV smaller than 1 MB.");
  let records: Record<string, string>[];
  try {
    records = parse(input, { columns: true, bom: true, skip_empty_lines: true, trim: true, relax_quotes: false, skip_records_with_error: false });
  } catch (error) {
    throw new Error(`CSV could not be parsed: ${error instanceof Error ? error.message : "unknown error"}`);
  }
  if (records.length > 500) throw new Error("Import at most 500 rows at a time.");
  if (records.length && !headers.every((header) => Object.hasOwn(records[0],header))) throw new Error("CSV headers do not match the template.");
  const rows: ImportRow[] = [];
  const errors: Preview["errors"] = [];
  const seen = new Set<string>();
  records.forEach((record, index) => {
    try {
      for (const field of ["url", "observed_at", "affiliation"]) if (!record[field]) throw new Error(`Missing ${field}.`);
      const item = parseRedditUrl(record.url);
      const affiliation = record.affiliation as ImportRow["affiliation"];
      if (!["agency", "brand", "independent", "paid_disclosed", "unknown"].includes(affiliation)) throw new Error("Invalid affiliation.");
      if (record.title?.length > 500 || record.text?.length > 20000) throw new Error("Text field exceeds size limit.");
      if (record.campaign_id && !z.string().uuid().safeParse(record.campaign_id).success) throw new Error("Campaign ID must be a UUID.");
      const observedAt = parseTimestamp(record.observed_at);
      const publishedAt = record.published_at ? parseTimestamp(record.published_at) : null;
      if (publishedAt && observedAt < publishedAt) throw new Error("Observation cannot precede publication.");
      const row: ImportRow = {
        external_id: item.externalId,
        canonical_url: item.canonicalUrl,
        subreddit: item.subreddit,
        item_type: item.itemType,
        title: record.title || null,
        body: record.text || null,
        published_at: publishedAt,
        observed_at: observedAt,
        views: parseNullableInteger(record.views ?? ""),
        score: parseNullableInteger(record.score ?? "", true),
        replies: parseNullableInteger(record.replies ?? ""),
        shares: parseNullableInteger(record.shares ?? ""),
        affiliation,
        campaign_id: record.campaign_id || null,
      };
      const key = `${row.external_id}|${row.observed_at}`;
      if (seen.has(key)) throw new Error("Duplicate item and observation time in this file.");
      seen.add(key);
      rows.push(row);
    } catch (error) {
      errors.push({ line: index + 2, message: error instanceof Error ? error.message : "Invalid row." });
    }
  });
  return { rows, errors };
}
