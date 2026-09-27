const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function buildRedditUtmUrl(destination: string, campaignId: string, contributionId?: string) {
  if (!uuid.test(campaignId) || (contributionId && !uuid.test(contributionId))) throw new Error("Invalid campaign or contribution ID.");
  let url: URL;
  try { url = new URL(destination); } catch { throw new Error("Enter a complete HTTPS landing URL."); }
  if (url.protocol!=="https:" || !url.hostname || url.username || url.password) {
    throw new Error("Use an HTTPS landing URL without embedded credentials.");
  }
  url.searchParams.set("utm_source","reddit");
  url.searchParams.set("utm_medium","organic_social");
  url.searchParams.set("utm_campaign",campaignId);
  if (contributionId) url.searchParams.set("utm_content",contributionId);
  else url.searchParams.delete("utm_content");
  return url.toString();
}
