import { describe, expect, it } from "vitest";
import { buildRedditUtmUrl } from "../src/lib/utm";

const campaign = "11111111-1111-4111-8111-111111111111";
const contribution = "22222222-2222-4222-8222-222222222222";

describe("Reddit UTM links", () => {
  it("uses opaque IDs, preserves the landing query, and replaces stale UTM values", () => {
    const link = new URL(buildRedditUtmUrl("https://example.com/signup?plan=pro&utm_source=old&utm_content=old#form",campaign,contribution));
    expect(link.searchParams.get("plan")).toBe("pro");
    expect(link.searchParams.get("utm_source")).toBe("reddit");
    expect(link.searchParams.get("utm_medium")).toBe("organic_social");
    expect(link.searchParams.get("utm_campaign")).toBe(campaign);
    expect(link.searchParams.get("utm_content")).toBe(contribution);
    expect(link.hash).toBe("#form");
    expect(link.searchParams.getAll("utm_source")).toHaveLength(1);
  });

  it("omits the contribution tag when unassigned and rejects unsafe destinations", () => {
    expect(new URL(buildRedditUtmUrl("https://example.com/?utm_content=old",campaign)).searchParams.has("utm_content")).toBe(false);
    expect(() => buildRedditUtmUrl("http://example.com",campaign)).toThrow();
    expect(() => buildRedditUtmUrl("https://user:pass@example.com",campaign)).toThrow();
    expect(() => buildRedditUtmUrl("https://example.com","private-client-name")).toThrow();
  });
});
