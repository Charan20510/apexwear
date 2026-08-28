// Fetch wrapper: bearer auth, silent-refresh-on-401, and API error helpers.

// In-memory only — never localStorage, so XSS can't read it. Refresh token is an HttpOnly cookie.
let accessToken: string | null = null;
let refreshPromise: Promise<boolean> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

async function refreshAccessToken(): Promise<boolean> {
  // Single-flight — concurrent callers await the same in-flight refresh.
  if (!refreshPromise) {
    refreshPromise = fetch("/api/auth/refresh", { method: "POST", credentials: "include" })
      .then(async (res) => {
        if (!res.ok) return false;
        const data = await res.json();
        setAccessToken(data.access);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(`API error ${status}`);
    this.status = status;
    this.body = body;
  }
}

// Pulls DRF's `{"detail": "..."}` off an ApiError, when there is one.
export function errorDetail(err: unknown): string | null {
  if (!(err instanceof ApiError) || !err.body || typeof err.body !== "object") return null;
  const detail = (err.body as Record<string, unknown>).detail;
  return typeof detail === "string" ? detail : null;
}

// DRF returns {field: ["msg", ...]}; flatten to {field: "msg ..."} for rendering.
export function toFieldErrors(err: unknown): Record<string, string> {
  if (err instanceof ApiError && err.body && typeof err.body === "object") {
    const body = err.body as Record<string, string[] | string>;
    return Object.fromEntries(
      Object.entries(body).map(([k, v]) => [k, Array.isArray(v) ? v.join(" ") : String(v)]),
    );
  }
  return { non_field: "Something went wrong. Please try again." };
}

export async function apiFetch(path: string, options: RequestInit = {}, isRetry = false): Promise<Response> {
  const headers = new Headers(options.headers);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const res = await fetch(path, { ...options, headers, credentials: "include" });

  if (res.status === 401 && !isRetry && path !== "/api/auth/refresh") {
    const refreshed = await refreshAccessToken();
    if (refreshed) return apiFetch(path, options, true);
  }
  return res;
}

export async function apiJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, options);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}
