import { describe, expect, it } from "vitest";
import { parse } from "csv-parse/sync";
import { previewCsv } from "../src/lib/imports";
import { parseRedditUrl, parseTimestamp } from "../src/lib/reddit";
import { evidenceCsv, safeCell } from "../src/lib/csv";

describe("evidence input and output", () => {
  it("extracts post and comment identities without treating score as views", () => {
    expect(parseRedditUrl("https://reddit.com/r/Tools/comments/abc123/example/")).toMatchObject({ externalId:"t3_abc123",subreddit:"tools",itemType:"post" });
    expect(parseRedditUrl("https://www.reddit.com/r/Tools/comments/abc123/example/def456/")).toMatchObject({ externalId:"t1_def456",subreddit:"tools",itemType:"comment" });
    expect(() => parseRedditUrl("http://www.reddit.com/r/Tools/comments/abc123/example/")).toThrow();
  });

  it("previews bad rows and duplicate observations before commit", () => {
    const csv = `url,title,text,published_at,observed_at,views,score,replies,shares,affiliation,campaign_id\nhttps://reddit.com/r/tools/comments/abc123/example/,A,,2026-09-01T01:00:00Z,2026-09-02T01:00:00Z,,7,,,independent,\nhttps://reddit.com/r/tools/comments/abc123/example/,A,,2026-09-01T01:00:00Z,2026-09-02T01:00:00Z,4,7,,,independent,\nhttps://example.com/x,A,,,2026-09-02T01:00:00Z,4,7,,,independent,`;
    const preview = previewCsv(csv);
    expect(preview.rows).toHaveLength(1);
    expect(preview.rows[0].views).toBeNull();
    expect(preview.errors.map((row) => row.line)).toEqual([3,4]);
  });

  it("assigns blank campaign IDs and rejects a conflicting CSV campaign", () => {
    const selected = "11111111-1111-4111-8111-111111111111";
    const other = "22222222-2222-4222-8222-222222222222";
    const csv = (campaignId: string) => `url,title,text,published_at,observed_at,views,score,replies,shares,affiliation,campaign_id\nhttps://reddit.com/r/tools/comments/abc123/example/,A,,2026-09-01T01:00:00Z,2026-09-02T01:00:00Z,100,7,,,independent,${campaignId}\n`;
    expect(previewCsv(csv(""), selected).rows[0].campaign_id).toBe(selected);
    expect(previewCsv(csv(other), selected).errors[0].message).toMatch(/differs from the selected campaign/);
  });

  it("neutralizes formula cells in exported CSV", () => {
    expect(safeCell("=HYPERLINK(\"bad\")")).toBe('"\'=HYPERLINK(""bad"")"');
    expect(safeCell(" safe")).toBe('" safe"');
    expect(safeCell("-1+2")).toBe('"\'-1+2"');
    expect(safeCell(-2)).toBe('"-2"');
  });

  it("exports unknown views as blank while keeping negative scores numeric", () => {
    const csv = evidenceCsv(
      [{ id:"item", external_id:"t3_abc123", canonical_url:"https://www.reddit.com/r/tools/comments/abc123/", subreddit:"tools", item_type:"post", published_at:null, affiliation:"independent", campaign_id:null }],
      [{ id:"snapshot", item_id:"item", observed_at:"2026-09-02T00:00:00Z", source_type:"authorized_import", views:null, score:-2, replies:0, shares:null }],
    );
    expect(parse(csv, { columns:true })[0]).toMatchObject({ external_id:"t3_abc123", views_lifetime:"", score:"-2", replies:"0", shares:"" });
  });

  it("rejects invalid calendar timestamps even when they have an offset", () => {
    expect(() => parseTimestamp("2026-02-30T10:00:00Z")).toThrow();
  });
});
