import assert from "node:assert/strict";
import { test } from "node:test";
import { ModelHttpError, runWithFallback } from "./fallback.ts";

const ok = (v: string) => async () => v;
const http = (status: number) => async (): Promise<string> => {
  throw new ModelHttpError(status, `status ${status}`);
};
const quiet = () => {};
const check = (v: unknown) => (typeof v === "string" && v !== "bad" ? v : null);
const mock = async () => "MOCK";

function run(calls: Record<string, () => Promise<unknown>>, timeoutMs = 1000) {
  const tried: string[] = [];
  const p = runWithFallback({
    models: Object.keys(calls),
    call: (model) => {
      tried.push(model);
      return calls[model]();
    },
    check,
    fallback: mock,
    timeoutMs,
    warn: quiet,
  });
  return p.then((r) => ({ ...r, tried }));
}

test("first model answers", async () => {
  assert.deepEqual(await run({ a: ok("A"), b: ok("B") }), { value: "A", source: "ai", model: "a", tried: ["a"] });
});

test("429 / 5xx / network error / bad shape -> next model", async () => {
  for (const first of [http(429), http(500), http(503), async () => Promise.reject(new TypeError("fetch failed")), ok("bad")]) {
    const r = await run({ a: first, b: ok("B") });
    assert.deepEqual([r.value, r.source, r.model, r.tried], ["B", "ai", "b", ["a", "b"]]);
  }
});

test("404 (model name gone) -> next model", async () => {
  const r = await run({ a: http(404), b: ok("B") });
  assert.equal(r.model, "b");
});

test("400 / 401 / 403 -> straight to mock, later models not tried", async () => {
  for (const s of [400, 401, 403]) {
    const r = await run({ a: http(s), b: ok("B") });
    assert.deepEqual([r.value, r.source, r.model, r.tried], ["MOCK", "fallback", null, ["a"]]);
  }
});

test("all models fail -> mock with source fallback", async () => {
  const r = await run({ a: http(429), b: http(503) });
  assert.deepEqual([r.value, r.source, r.model, r.tried], ["MOCK", "fallback", null, ["a", "b"]]);
});

test("no models configured -> mock", async () => {
  const r = await run({});
  assert.deepEqual([r.value, r.source], ["MOCK", "fallback"]);
});

test("a model that hangs past the time limit -> next model", async () => {
  const started = Date.now();
  const r = await run({ a: () => new Promise(() => {}), b: ok("B") }, 50);
  assert.equal(r.model, "b");
  assert.ok(Date.now() - started < 1000);
});
