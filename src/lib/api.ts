/**
 * Safe JSON fetch with retries for Render free-tier cold starts /
 * intermittent edge "Not Found" responses (plain text, not JSON).
 */
export async function fetchJson<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: { retries?: number; retryDelayMs?: number },
): Promise<{ res: Response; data: T }> {
  const retries = options?.retries ?? 8;
  const retryDelayMs = options?.retryDelayMs ?? 500;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(input, {
        ...init,
        cache: init?.cache ?? "no-store",
      });
      const text = await res.text();
      const trimmed = text.trim();
      const contentType = res.headers.get("content-type") ?? "";

      // Render edge sometimes returns plain "Not Found" while the free
      // instance is spinning / routing flaps (x-render-routing: no-server).
      const looksLikeEdgeMiss =
        (res.status === 404 || res.status === 502 || res.status === 503) &&
        (!trimmed ||
          /^not\s*found\.?$/i.test(trimmed) ||
          !contentType.includes("application/json"));

      const isJson = contentType.includes("application/json") || looksLikeJson(trimmed);

      if (looksLikeEdgeMiss && !isJson && attempt < retries) {
        await sleep(retryDelayMs * Math.min(attempt + 1, 6));
        continue;
      }

      if (!trimmed) {
        if (!res.ok && attempt < retries) {
          await sleep(retryDelayMs * Math.min(attempt + 1, 6));
          continue;
        }
        return { res, data: {} as T };
      }

      if (!isJson) {
        if (attempt < retries) {
          await sleep(retryDelayMs * Math.min(attempt + 1, 6));
          continue;
        }
        throw new Error(
          "Server is waking up — wait a few seconds and try again",
        );
      }

      try {
        return { res, data: JSON.parse(trimmed) as T };
      } catch {
        if (attempt < retries) {
          await sleep(retryDelayMs * Math.min(attempt + 1, 6));
          continue;
        }
        throw new Error(
          "Server is waking up — wait a few seconds and try again",
        );
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error("Network error");
      // Don't retry intentional aborts.
      if (err instanceof DOMException && err.name === "AbortError") {
        throw err;
      }
      if (
        lastError.message.includes("waking up") &&
        attempt >= retries
      ) {
        throw lastError;
      }
      if (attempt < retries) {
        await sleep(retryDelayMs * Math.min(attempt + 1, 6));
        continue;
      }
    }
  }

  throw lastError ?? new Error("Server is waking up — try again");
}

function looksLikeJson(text: string) {
  return text.startsWith("{") || text.startsWith("[");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
