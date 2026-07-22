/**
 * Safe JSON fetch with retries for Render free-tier cold starts /
 * intermittent edge "Not Found" responses (plain text, not JSON).
 */
export async function fetchJson<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: { retries?: number; retryDelayMs?: number },
): Promise<{ res: Response; data: T }> {
  const retries = options?.retries ?? 4;
  const retryDelayMs = options?.retryDelayMs ?? 400;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(input, init);
      const text = await res.text();
      const trimmed = text.trim();

      // Render edge sometimes returns plain "Not Found" while the free
      // instance is spinning / routing flaps (x-render-routing: no-server).
      const looksLikeEdgeMiss =
        res.status === 404 &&
        (!trimmed ||
          /^not found$/i.test(trimmed) ||
          res.headers.get("x-render-routing") === "no-server");

      if (looksLikeEdgeMiss && attempt < retries) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }

      if (!trimmed) {
        if (!res.ok && attempt < retries) {
          await sleep(retryDelayMs * (attempt + 1));
          continue;
        }
        return { res, data: {} as T };
      }

      try {
        return { res, data: JSON.parse(trimmed) as T };
      } catch {
        if (attempt < retries && (res.status >= 500 || looksLikeEdgeMiss)) {
          await sleep(retryDelayMs * (attempt + 1));
          continue;
        }
        throw new Error(
          res.ok
            ? "Server returned an unexpected response"
            : trimmed.slice(0, 120) || `Request failed (${res.status})`,
        );
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error("Network error");
      if (attempt < retries) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }
    }
  }

  throw lastError ?? new Error("Request failed");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
