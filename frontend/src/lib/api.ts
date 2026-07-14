export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

export function buildApiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_URL}${normalizedPath}`;
}

interface FetchWithRetryOptions extends RequestInit {
  timeout?: number;
  retries?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

/**
 * Fetch with timeout and retry logic for handling Render free tier cold starts.
 *
 * Default behavior:
 * - 90 second timeout (enough for cold start + analysis)
 * - 2 retries on timeout/network errors
 * - Exponential backoff between retries
 */
export async function fetchWithRetry(
  url: string,
  options: FetchWithRetryOptions = {},
): Promise<Response> {
  const {
    timeout = 90000, // 90 seconds - enough for cold start + heavy analysis
    retries = 2,
    onRetry,
    ...fetchOptions
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on abort signals that weren't from our timeout
      if (error instanceof Error && error.name === "AbortError") {
        // Check if this was our timeout or user-initiated
        if (!error.message.includes("aborted")) {
          throw error;
        }
      }

      // Don't retry if we've exhausted attempts
      if (attempt === retries) {
        break;
      }

      // Notify caller of retry (for UI feedback)
      if (onRetry) {
        onRetry(attempt + 1, lastError);
      }

      // Exponential backoff: 2s, 4s
      const backoffMs = Math.min(2000 * Math.pow(2, attempt), 5000);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  // If we get here, all retries failed
  throw new Error(
    `Request failed after ${retries + 1} attempts: ${lastError?.message ?? "Unknown error"}`,
  );
}
