import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";

const compose = (...args) =>
  execFileSync(
    "docker",
    ["compose", "--env-file", ".local/compose.env", ...args],
    { stdio: "inherit" },
  );
const base = "http://127.0.0.1:5173/api";
async function request(path, body, key) {
  return fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(5000),
  });
}
async function waitFor(check, seconds = 90) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    try {
      const result = await check();
      if (result) return result;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    "Docker scenario did not reach the asserted state before its deadline.",
  );
}
const state = async () => {
  const response = await request("/state");
  assert.equal(response.status, 200);
  return response.json();
};
const transfer = (key) => ({
  sourceId: "00000000-0000-0000-0000-000000000101",
  destinationId: "00000000-0000-0000-0000-000000000102",
  amountMinor: "13",
  currency: "INR",
  reference: "DOCKER-" + key,
  quoteId: null,
});
async function settle(key, payload) {
  const response = await request("/transfers", payload, key);
  assert.equal(response.status, 201);
  return response.json();
}
const before = await waitFor(state);
const key = randomUUID(),
  payload = transfer(key);
const first = await settle(key, payload);
assert.equal(first.replayed, false);
const cached = await settle(key, payload);
assert.equal(cached.tier, "REDIS");
assert.equal(cached.replayed, true);
assert.deepEqual(cached.receipt, first.receipt);
assert.equal(
  (await request("/transfers", { ...payload, amountMinor: "14" }, key)).status,
  422,
);

compose("stop", "redis");
const fallback = await settle(key, payload);
assert.equal(fallback.tier, "POSTGRES");
assert.deepEqual(fallback.receipt, first.receipt);
const outageKey = randomUUID(),
  outagePayload = transfer(outageKey);
const outage = await settle(outageKey, outagePayload);
assert.equal(outage.replayed, false);
assert.equal(outage.tier, "POSTGRES");
compose("start", "redis");
await waitFor(async () => (await settle(key, payload)).tier === "REDIS", 45);

assert.equal((await request("/pipeline/pause", { paused: true })).status, 200);
const pendingKey = randomUUID(),
  pendingPayload = transfer(pendingKey);
const pending = await settle(pendingKey, pendingPayload);
assert.ok((await state()).counts.pending > 0);
compose("restart", "backend");
await waitFor(async () => {
  const current = await state();
  return (
    current.counts.pending === 0 && current.counts.unprojected_events === 0
  );
});
assert.deepEqual(
  (await settle(pendingKey, pendingPayload)).receipt,
  pending.receipt,
);

// Recreate containers while preserving their named database/broker/cache volumes.
compose("down");
compose("up", "-d", "--wait", "--wait-timeout", "180");
await waitFor(state);
assert.deepEqual((await settle(key, payload)).receipt, first.receipt);
assert.deepEqual(
  (await settle(outageKey, outagePayload)).receipt,
  outage.receipt,
);
const final = await waitFor(async () => {
  const current = await state();
  return current.counts.unprojected_events === 0 ? current : null;
});
assert.equal(final.counts.transfers, before.counts.transfers + 3);
assert.equal(final.reconciliation.healthy, true);
assert.equal(final.reconciliation.globalSumMinor, "0");
assert.equal(final.counts.pending, 0);
await writeFile(
  ".local/docker-verification.json",
  JSON.stringify(
    {
      passed: true,
      recordedAt: new Date().toISOString(),
      checks: [
        "healthy Redis replay",
        "cached payload tamper rejected",
        "Redis outage durable replay/new commit",
        "Redis recovery",
        "pending outbox survives backend restart",
        "named-volume stack recreation retains receipts",
        "three transfers committed exactly once",
        "zero ledger/projection drift",
      ],
    },
    null,
    2,
  ),
);
console.log(
  "Docker financial, Redis outage/recovery and persistent-volume restart simulations passed.",
);
