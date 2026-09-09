/**
 * The one place that talks to Django.
 *
 * Auth is the session cookie, not a token in browser storage - the frontend is
 * served from the same origin in production, so the cookie stays httpOnly and
 * nothing sensitive is readable by script. That means every request must send
 * credentials, and every write must carry the CSRF token.
 */

const BASE = "/api";

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : null;
}

export class ApiError extends Error {
  status: number;
  /** Field-level messages from the schema validator, keyed by field. */
  fieldErrors: Record<string, string>;

  constructor(status: number, message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

let csrfPrimed = false;

async function primeCsrf(): Promise<void> {
  if (csrfPrimed || readCookie("csrftoken")) {
    csrfPrimed = true;
    return;
  }
  await fetch(`${BASE}/auth/csrf/`, { credentials: "same-origin" });
  csrfPrimed = true;
}

type Options = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
};

export async function request<T>(path: string, options: Options = {}): Promise<T> {
  const method = options.method ?? "GET";

  if (method !== "GET") await primeCsrf();

  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const token = readCookie("csrftoken");
  if (token && method !== "GET") headers["X-CSRFToken"] = token;

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    credentials: "same-origin",
    signal: options.signal,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (response.status === 204) return undefined as T;

  const isJson = (response.headers.get("content-type") ?? "").includes("application/json");
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    // The schema validator returns {errors: {field: message}}; everything else
    // returns {detail: "..."}.
    const fieldErrors = (payload?.errors ?? {}) as Record<string, string>;
    const message =
      payload?.detail ??
      (Object.keys(fieldErrors).length
        ? "Some answers still need attention."
        : `Request failed (${response.status})`);
    throw new ApiError(response.status, message, fieldErrors);
  }

  return payload as T;
}

/** A file endpoint. Returned as a real navigation so the browser saves it. */
export function download(path: string): void {
  window.location.href = `${BASE}${path}`;
}

export const api = {
  get: <T,>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T,>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
  patch: <T,>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
};
