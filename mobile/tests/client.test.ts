/// <reference types="node" />
/** The app's API client: bearer tokens, refresh on 401, sign-in and errors. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError, createClient, errorMessage, queryString, type TokenPair, type TokenStore } from "../src/lib/client";

type Call = { url: string; init: RequestInit };

function memoryStore(initial: TokenPair | null = null): TokenStore & { value: TokenPair | null } {
  return {
    value: initial,
    async load() {
      return this.value;
    },
    async save(tokens) {
      this.value = tokens;
    },
  };
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const header = (init: RequestInit, name: string) => new Headers(init.headers).get(name);

function fakeFetch(handler: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetch = (async (url: string, init: RequestInit = {}) => {
    const call = { url: String(url), init };
    calls.push(call);
    return handler(call);
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

test("sends the access token as a bearer header", async () => {
  const store = memoryStore({ access_token: "a1", refresh_token: "r1" });
  const { fetch, calls } = fakeFetch(() => json(200, { ok: true }));
  const client = createClient({ baseUrl: "https://api.test/api/v1/", store, fetch });
  assert.deepEqual(await client.request("/users/me"), { ok: true });
  assert.equal(calls[0].url, "https://api.test/api/v1/users/me");
  assert.equal(header(calls[0].init, "Authorization"), "Bearer a1");
});

test("anonymous requests carry no token", async () => {
  const store = memoryStore({ access_token: "a1", refresh_token: "r1" });
  const { fetch, calls } = fakeFetch(() => json(200, []));
  const client = createClient({ baseUrl: "https://api.test", store, fetch });
  await client.request("/events/", { anonymous: true });
  assert.equal(header(calls[0].init, "Authorization"), null);
});

test("refreshes once on a 401 and retries with the new token", async () => {
  const store = memoryStore({ access_token: "old", refresh_token: "r1" });
  const { fetch, calls } = fakeFetch(({ url, init }) => {
    if (url.endsWith("/auth/refresh")) {
      assert.deepEqual(JSON.parse(String(init.body)), { refresh_token: "r1" });
      return json(200, { access_token: "new" });
    }
    return header(init, "Authorization") === "Bearer new" ? json(200, { id: 1 }) : json(401, { detail: "expired" });
  });
  const client = createClient({ baseUrl: "https://api.test", store, fetch });
  // Two requests at once share one refresh
  const [a, b] = await Promise.all([client.request("/orders/mine"), client.request("/users/me")]);
  assert.deepEqual(a, { id: 1 });
  assert.deepEqual(b, { id: 1 });
  assert.equal(calls.filter((c) => c.url.endsWith("/auth/refresh")).length, 1);
  // The refresh token is kept when the response leaves it out
  assert.deepEqual(store.value, { access_token: "new", refresh_token: "r1" });
});

test("a refused refresh signs the device out", async () => {
  const store = memoryStore({ access_token: "old", refresh_token: "r1" });
  let signedOut = 0;
  const { fetch } = fakeFetch(({ url }) => (url.endsWith("/auth/refresh") ? json(401, { detail: "revoked" }) : json(401, { detail: "Not authenticated" })));
  const client = createClient({ baseUrl: "https://api.test", store, fetch, onSignedOut: () => signedOut++ });
  await assert.rejects(client.request("/users/me"), (e: unknown) => e instanceof ApiError && e.status === 401);
  assert.equal(store.value, null);
  assert.equal(signedOut, 1);
});

test("signs in with a form body and stores the pair", async () => {
  const store = memoryStore();
  const { fetch, calls } = fakeFetch(() => json(200, { access_token: "a", refresh_token: "r", token_type: "bearer" }));
  const client = createClient({ baseUrl: "https://api.test", store, fetch });
  await client.signIn("guest@example.com", "pw-for-test");
  assert.equal(header(calls[0].init, "Content-Type"), "application/x-www-form-urlencoded");
  assert.equal(new URLSearchParams(String(calls[0].init.body)).get("username"), "guest@example.com");
  assert.equal(store.value?.access_token, "a");
  assert.equal(await client.hasSession(), true);
});

test("a failed sign-in shows the server's message", async () => {
  const { fetch } = fakeFetch(() => json(401, { detail: "Incorrect email or password" }));
  const client = createClient({ baseUrl: "https://api.test", store: memoryStore(), fetch });
  await assert.rejects(client.signIn("a@b.kz", "x"), { message: "Incorrect email or password" });
});

test("sign-out clears the device and revokes only this session", async () => {
  const store = memoryStore({ access_token: "a", refresh_token: "r" });
  const { fetch, calls } = fakeFetch(() => new Response(null, { status: 204 }));
  const client = createClient({ baseUrl: "https://api.test", store, fetch });
  await client.signOut();
  assert.equal(store.value, null);
  assert.ok(calls[0].url.endsWith("/auth/logout-session"));
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { refresh_token: "r" });
});

test("a network failure becomes a friendly error", async () => {
  const fetch = (async () => {
    throw new TypeError("Network request failed");
  }) as typeof globalThis.fetch;
  const client = createClient({ baseUrl: "https://api.test", store: memoryStore(), fetch });
  await assert.rejects(client.request("/events/"), { message: /Could not reach BiletFlow/ });
});

test("validation errors name the field", () => {
  const message = errorMessage(422, { detail: [{ loc: ["body", "display_name"], msg: "String should have at least 2 characters" }] });
  assert.equal(message, "display name: String should have at least 2 characters");
  assert.match(errorMessage(503, { detail: "boom" }), /unavailable/);
});

test("query strings skip empty values and repeat arrays", () => {
  assert.equal(queryString({ q: "jazz", city: "", page: 2, ids: ["a", "b"], x: undefined }), "?q=jazz&page=2&ids=a&ids=b");
  assert.equal(queryString({}), "");
});
