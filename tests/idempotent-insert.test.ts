import { describe, expect, it, vi } from "vitest";
import { clientCreateError, insertWithStableId } from "../src/lib/idempotent-insert";

const id = "11111111-1111-4111-8111-111111111111";
const failed = { data: null, error: { code: "", message: "TypeError: fetch failed" } };
const created = { data: { id }, error: null };

describe("client creation after a lost database response", () => {
  it("retries a failed connection and returns the created record", async () => {
    const insert = vi.fn().mockResolvedValueOnce(failed).mockResolvedValueOnce(created);
    const findById = vi.fn();
    expect(await insertWithStableId(id, insert, findById)).toEqual(created);
    expect(insert).toHaveBeenCalledTimes(2);
  });

  it("recognizes a write that committed before its response was lost", async () => {
    const insert = vi.fn().mockResolvedValueOnce(failed).mockResolvedValueOnce({ data: null, error: { code: "23505", message: "duplicate key" } });
    const findById = vi.fn().mockResolvedValue(created);
    expect(await insertWithStableId(id, insert, findById)).toEqual(created);
    expect(findById).toHaveBeenCalledTimes(1);
  });

  it("does not retry a permission error", async () => {
    const denied = { data: null, error: { code: "42501", message: "permission denied" } };
    const insert = vi.fn().mockResolvedValue(denied);
    expect(await insertWithStableId(id, insert, vi.fn())).toEqual(denied);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("uses a clear message if all connection attempts fail", async () => {
    const insert = vi.fn().mockResolvedValue(failed);
    expect(await insertWithStableId(id, insert, vi.fn())).toEqual(failed);
    expect(insert).toHaveBeenCalledTimes(3);
    expect(clientCreateError(failed.error)).toMatch(/Check the client list/);
  });
});
