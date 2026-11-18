/**
 * The BiletFlow API client for the app.
 *
 * The website keeps tokens in httpOnly cookies behind its own proxy; a phone
 * talks to the backend directly, so this client keeps the access and
 * refresh tokens itself (in the device's secure storage, see api.ts) and
 * sends `Authorization: Bearer …`. An expired access token is swapped for a
 * new pair once, and the request is retried.
 *
 * This file has no Expo imports so it can be tested with Node.
 */

export type TokenPair = { access_token: string; refresh_token?: string | null; expires_in?: number | null };

export type TokenStore = {
  load(): Promise<TokenPair | null>;
  save(tokens: TokenPair | null): Promise<void>;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function errorMessage(status: number, body: unknown) {
  const detail =
    typeof body === "object" && body !== null && "detail" in body ? (body as { detail: unknown }).detail : undefined;
  if (status >= 500) return "The BiletFlow service is unavailable. Please try again later.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const messages = detail.flatMap((item: unknown) => {
      if (typeof item !== "object" || item === null || !("msg" in item) || typeof item.msg !== "string") return [];
      const field =
        "loc" in item && Array.isArray(item.loc)
          ? item.loc
              .filter((part: unknown) => part !== "body" && part !== "query")
              .join(" ")
              .replaceAll("_", " ")
          : "";
      const message = item.msg.replace(/^Value error, /, "");
      return [field ? `${field}: ${message}` : message];
    });
    if (messages.length) return messages.join(". ");
  }
  if (status === 401) return "Please sign in to continue.";
  if (status === 403) return "You do not have access to this.";
  if (status === 404) return "This could not be found.";
  if (status === 409) return "This conflicts with the current state. Refresh and try again.";
  return "The request could not be completed. Please check your details and try again.";
}

export type Query = Record<string, string | number | boolean | null | undefined | (string | number)[]>;

export type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  form?: FormData;
  query?: Query;
  signal?: AbortSignal;
  /** Send without the signed-in user's token. */
  anonymous?: boolean;
};

export function queryString(query?: Query) {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) value.forEach((item) => params.append(key, String(item)));
    else params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

const isTokenPair = (value: unknown): value is TokenPair =>
  typeof value === "object" && value !== null && "access_token" in value && typeof value.access_token === "string";

export function createClient({
  baseUrl,
  store,
  fetch: transport = globalThis.fetch,
  timeoutMs = 20_000,
  onSignedOut,
}: {
  baseUrl: string;
  store: TokenStore;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  /** Called when the saved session stops working (refresh refused). */
  onSignedOut?: () => void;
}) {
  const root = baseUrl.replace(/\/$/, "");
  let tokens: TokenPair | null | undefined;
  let refreshing: Promise<boolean> | null = null;

  async function current() {
    if (tokens === undefined) tokens = await store.load().catch(() => null);
    return tokens;
  }

  async function setTokens(next: TokenPair | null) {
    // A refresh response may leave out the refresh token: keep the old one
    tokens = next && !next.refresh_token && tokens?.refresh_token ? { ...next, refresh_token: tokens.refresh_token } : next;
    await store.save(tokens);
  }

  async function send(url: string, init: RequestInit, signal?: AbortSignal) {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
    const timer = setTimeout(cancel, timeoutMs);
    try {
      return await transport(url, { ...init, signal: controller.signal });
    } catch {
      if (signal?.aborted) throw new ApiError("Request cancelled", 0);
      throw new ApiError(
        controller.signal.aborted
          ? "BiletFlow took too long to respond. Please try again."
          : "Could not reach BiletFlow. Please check your connection and try again.",
        0,
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
    }
  }

  /** Trade the refresh token for a new pair; false when the session is over. */
  function refresh(): Promise<boolean> {
    refreshing ??= (async () => {
      const saved = await current();
      if (!saved?.refresh_token) return false;
      try {
        const response = await send(`${root}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ refresh_token: saved.refresh_token }),
        });
        const body: unknown = await response.json().catch(() => null);
        if (response.ok && isTokenPair(body)) {
          await setTokens(body);
          return true;
        }
        if (response.status === 401 || response.status === 403 || response.status === 422) {
          await setTokens(null);
          onSignedOut?.();
        }
        return false;
      } catch {
        return false;
      }
    })().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  async function raw(path: string, options: RequestOptions = {}): Promise<Response> {
    const url = `${root}${path}${queryString(options.query)}`;
    const hasJson = options.body !== undefined;
    const build = async (): Promise<RequestInit> => {
      const token = options.anonymous ? null : (await current())?.access_token;
      return {
        method: options.method ?? (hasJson || options.form ? "POST" : "GET"),
        headers: {
          Accept: "application/json",
          ...(hasJson ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(hasJson ? { body: JSON.stringify(options.body) } : {}),
        ...(options.form ? { body: options.form } : {}),
      };
    };
    let response = await send(url, await build(), options.signal);
    if (response.status === 401 && !options.anonymous && (await current())?.refresh_token && (await refresh()))
      response = await send(url, await build(), options.signal);
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      throw new ApiError(errorMessage(response.status, body), response.status);
    }
    return response;
  }

  /** JSON request; resolves to the parsed body (null for 204). */
  async function request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
    const response = await raw(path, options);
    if (response.status === 204) return null as T;
    return (await response.json().catch(() => null)) as T;
  }

  return {
    request,
    raw,
    url: (path: string, query?: Query) => `${root}${path}${queryString(query)}`,
    /** Headers for a download the app makes itself (PDF, CSV, .ics). */
    async authHeaders(): Promise<Record<string, string>> {
      // Make sure the token is fresh before handing it to a downloader
      const saved = await current();
      if (!saved) return {};
      try {
        const check = await send(`${root}/users/me`, { headers: { Authorization: `Bearer ${saved.access_token}` } });
        if (check.status === 401) await refresh();
      } catch {
        // Offline: try the download with what we have
      }
      const fresh = await current();
      return fresh ? { Authorization: `Bearer ${fresh.access_token}` } : {};
    },
    async hasSession() {
      return !!(await current());
    },
    async signIn(email: string, password: string) {
      const response = await send(`${root}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({ username: email, password }).toString(),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new ApiError(errorMessage(response.status, body), response.status);
      if (!isTokenPair(body)) throw new ApiError("The server returned an unexpected answer.", 502);
      await setTokens(body);
    },
    /** Sign out of this device only; other devices stay signed in. */
    async signOut() {
      const saved = await current();
      await setTokens(null);
      if (saved?.refresh_token)
        await send(`${root}/auth/logout-session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: saved.refresh_token }),
        }).catch(() => undefined);
    },
    /** Every token of this account stops working, on every device. */
    async signOutEverywhere() {
      await request("/auth/logout", { method: "POST" });
      await setTokens(null);
    },
    /** Changing the password returns a new pair; the old ones stop working. */
    async changePassword(current_password: string, new_password: string) {
      const body = await request<unknown>("/auth/change-password", { body: { current_password, new_password } });
      if (isTokenPair(body)) await setTokens(body);
    },
  };
}

export type Client = ReturnType<typeof createClient>;
