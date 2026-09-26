import { z } from "zod";
import { DateTime } from "luxon";

const redditUrl = z.string().url().max(500);

export function parseRedditUrl(input: string) {
  const parsed = redditUrl.parse(input);
  const url = new URL(parsed);
  if (url.protocol !== "https:" || !["reddit.com", "www.reddit.com"].includes(url.hostname.toLowerCase())) {
    throw new Error("Use a reddit.com HTTPS post or comment URL.");
  }
  const match = url.pathname.match(/^\/r\/([A-Za-z0-9_]+)\/comments\/([a-z0-9]+)(?:\/[^/]+)?(?:\/([a-z0-9]+))?\/?$/i);
  if (!match) throw new Error("Use a Reddit post or comment URL with an item ID.");
  const subreddit = match[1].toLowerCase();
  const postId = match[2].toLowerCase();
  const commentId = match[3]?.toLowerCase();
  const itemType = commentId ? "comment" : "post";
  const externalId = `${commentId ? "t1" : "t3"}_${commentId ?? postId}`;
  const canonicalUrl = `https://www.reddit.com/r/${subreddit}/comments/${postId}/${commentId ? `_/${commentId}/` : ""}`;
  return { subreddit, externalId, itemType, canonicalUrl } as const;
}

export const nullableCount = z.union([z.number().int().nonnegative(), z.null()]);

export function parseNullableInteger(value: string, allowNegative = false): number | null {
  if (value.trim() === "") return null;
  if (!/^-?\d+$/.test(value.trim())) throw new Error("Metric must be an integer or blank.");
  const number = Number(value);
  if (!Number.isSafeInteger(number) || (!allowNegative && number < 0)) throw new Error("Metric is outside its allowed range.");
  return number;
}

export function parseTimestamp(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) || !/(Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new Error("Use an ISO 8601 timestamp with a timezone offset.");
  }
  const parsed = DateTime.fromISO(value, { setZone: true });
  if (!parsed.isValid) throw new Error("Invalid timestamp.");
  return parsed.toUTC().toISO()!;
}
