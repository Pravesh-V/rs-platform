type QueryError = { code?: string; message: string };

export type InsertResult<T> = { data: T | null; error: QueryError | null };

export function isConnectionFailure(error: QueryError | null) {
  return Boolean(error && /fetch failed|ECONNRESET|ETIMEDOUT|socket hang up/i.test(error.message));
}

export async function insertWithStableId<T extends { id: string }>(
  id: string,
  insert: () => Promise<InsertResult<T>>,
  findById: () => Promise<InsertResult<T>>,
): Promise<InsertResult<T>> {
  let result: InsertResult<T> = { data: null, error: { message: "Could not create client" } };

  for (let attempt = 0; attempt < 3; attempt++) {
    result = await insert();
    if (result.data && !result.error) return result;

    if (result.error?.code === "23505") {
      const existing = await findById();
      if (existing.data?.id === id && !existing.error) return existing;
      if (isConnectionFailure(existing.error) && attempt < 2) continue;
      return result;
    }

    if (!isConnectionFailure(result.error) || attempt === 2) return result;
    await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
  }

  return result;
}

export function clientCreateError(error: QueryError | null) {
  return isConnectionFailure(error)
    ? "Database connection interrupted. Check the client list before trying again."
    : error?.message ?? "Could not create client";
}

export async function retryIdempotentRequest<T extends { error: QueryError | null }>(
  request: () => Promise<T>,
): Promise<T> {
  let result = await request();
  for (let attempt = 0; attempt < 2 && isConnectionFailure(result.error); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    result = await request();
  }
  return result;
}
