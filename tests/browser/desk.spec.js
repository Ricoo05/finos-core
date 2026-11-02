import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

const source = "00000000-0000-0000-0000-000000000101";
const destination = "00000000-0000-0000-0000-000000000102";
async function navigate(page, name) {
  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name, exact: true })
    .click();
}
async function ready(page) {
  await page.goto("/");
  await expect(page.getByText("All balances reconcile")).toBeVisible();
}
const sections = [
  ["Overview", "Account positions"],
  ["Settlement", "New transfer"],
  ["Journal", "Double-entry journal"],
  ["Event pipeline", "Outbox delivery"],
  ["Market & scenarios", "Settlement analysis"],
  ["Engineering", "Running architecture"],
];

test("default workbench has horizontal navigation, account cards and an inline journal", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1024, height: 1000 });
  await ready(page);
  await expect(
    page
      .getByRole("navigation", { name: "Workspace" })
      .getByRole("button", { name: "Settlement", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("heading", { name: "New transfer", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Double-entry journal", exact: true }),
  ).toBeVisible();
  const cards = page.locator(".account-grid>.account-card");
  await expect(cards).toHaveCount(4);
  const first = await cards.nth(0).boundingBox(),
    second = await cards.nth(1).boundingBox();
  expect(second.x).toBeGreaterThan(first.x);
  expect(second.y).toBe(first.y);
  await page.screenshot({
    path: testInfo.outputPath("workbench-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 1000 });
  const mobileFirst = await cards.nth(0).boundingBox(),
    mobileSecond = await cards.nth(1).boundingBox();
  expect(mobileSecond.x).toBe(mobileFirst.x);
  expect(mobileSecond.y).toBeGreaterThan(mobileFirst.y);
  await page.screenshot({
    path: testInfo.outputPath("workbench-mobile.png"),
    fullPage: true,
  });
});

test("all six views render at desktop and mobile sizes without page overflow", async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [name, title] of sections) {
      await navigate(page, name);
      await expect(
        page.getByRole("heading", { name: title, exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
        `${name} at ${width}px`,
      ).toBe(true);
    }
    if (width === 1440 || width === 390) {
      await navigate(page, "Overview");
      await page.screenshot({
        path: testInfo.outputPath(`overview-${width}.png`),
        fullPage: true,
      });
    }
  }
  expect(errors).toEqual([]);
});

test("settlement form commits, replays after reload, rejects tampering and invalid precision", async ({
  page,
  request,
}) => {
  await ready(page);
  await navigate(page, "Settlement");
  const reference = "BROWSER-" + randomUUID();
  await page.getByLabel("Amount", { exact: true }).fill("2.34");
  await page.getByLabel("Reference", { exact: true }).fill(reference);
  const before = await (await request.get("/api/state")).json();
  await page
    .getByRole("button", { name: "Post transfer", exact: true })
    .click();
  await expect(page.getByText("COMMITTED", { exact: true })).toBeVisible();
  const id = await page.locator(".receipt dd").first().innerText();
  await page.reload();
  await expect(page.getByText("All balances reconcile")).toBeVisible();
  await navigate(page, "Settlement");
  await page
    .getByRole("button", { name: "Replay last request", exact: true })
    .click();
  await expect(
    page.getByText("IDEMPOTENT REPLAY", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".receipt dd").first()).toHaveText(id);
  await page
    .getByRole("button", { name: "Test payload mismatch", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("422");
  await page
    .getByRole("button", {
      name: "Start a new transfer / new key",
      exact: true,
    })
    .click();
  await page.getByLabel("Amount", { exact: true }).fill("1.001");
  await page
    .getByRole("button", { name: "Post transfer", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("two decimal places");
  const after = await (await request.get("/api/state")).json();
  expect(after.counts.transfers).toBe(before.counts.transfers + 1);
  expect(after.reconciliation.healthy).toBe(true);
});

test("freeze blocks a new transfer and unfreeze restores account availability", async ({
  page,
  request,
}) => {
  await ready(page);
  await navigate(page, "Settlement");
  const row = page
    .locator(".account-controls>div")
    .filter({ hasText: "Meridian Treasury" });
  try {
    await row.getByRole("button", { name: "Freeze", exact: true }).click();
    await expect(
      row.getByRole("button", { name: "Unfreeze", exact: true }),
    ).toBeVisible();
    await page.getByLabel("Amount", { exact: true }).fill("0.01");
    await page
      .getByLabel("Reference", { exact: true })
      .fill("FROZEN-" + randomUUID());
    await page
      .getByRole("button", { name: "Post transfer", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "Both accounts must be active",
    );
    await row.getByRole("button", { name: "Unfreeze", exact: true }).click();
    await expect(
      row.getByRole("button", { name: "Freeze", exact: true }),
    ).toBeVisible();
  } finally {
    await request.post(`/api/accounts/${destination}/status`, {
      data: { frozen: false },
    });
  }
});

test("paused relay retains an event, then resumes and projects it once", async ({
  page,
  request,
}) => {
  await ready(page);
  await navigate(page, "Event pipeline");
  try {
    await page
      .getByRole("button", { name: "Pause relay", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Resume relay", exact: true }),
    ).toBeVisible();
    const result = await request.post("/api/transfers", {
      headers: { "Idempotency-Key": randomUUID() },
      data: {
        sourceId: source,
        destinationId: destination,
        amountMinor: "1",
        currency: "INR",
        reference: "BACKLOG-" + randomUUID(),
        quoteId: null,
      },
    });
    expect(result.status()).toBe(201);
    const { receipt } = await result.json();
    const row = page.getByRole("row").filter({ hasText: receipt.eventId });
    await expect(row).toContainText("PENDING");
    await page
      .getByRole("button", { name: "Resume relay", exact: true })
      .click();
    await expect(row).toContainText("PROCESSED");
    await expect
      .poll(async () => {
        const s = await (await request.get("/api/state")).json();
        return s.counts.unprojected_events;
      })
      .toBe(0);
  } finally {
    await request.post("/api/pipeline/pause", { data: { paused: false } });
  }
});

test("connection failure is visible and refresh reconnects to the backend", async ({
  page,
}) => {
  await ready(page);
  await page.route("**/api/state", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Backend temporarily unavailable" }),
    }),
  );
  await page.getByRole("button", { name: "Refresh data", exact: true }).click();
  await expect(
    page.getByText("Data may be stale", { exact: true }),
  ).toBeVisible();
  await page.unroute("**/api/state");
  await page.getByRole("button", { name: "Refresh data", exact: true }).click();
  await expect(
    page.getByText("Server updates every 2s", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("FX form requires a server quote, settles its exact amount, and preserves the receipt on replay", async ({
  page,
  request,
}) => {
  await ready(page);
  const initial = await (await request.get("/api/state")).json();
  await page.getByLabel("Amount", { exact: true }).fill("1.00");
  await page
    .getByLabel("Reference", { exact: true })
    .fill("FX-BROWSER-" + randomUUID());
  await page.getByLabel("Input currency", { exact: true }).selectOption("USD");
  await expect(
    page.getByRole("button", { name: "Post transfer", exact: true }),
  ).toBeDisabled();
  const quoteResponse = page.waitForResponse(
    (r) => r.url().endsWith("/api/quotes") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Get reference FX quote", exact: true })
    .click();
  const response = await quoteResponse;
  if (!initial.market.available || initial.market.stale) {
    expect(response.status()).toBe(503);
    await expect(page.getByRole("alert")).toContainText(
      "Fresh reference FX data is unavailable",
    );
    await page
      .getByLabel("Input currency", { exact: true })
      .selectOption("INR");
    await expect(
      page.getByRole("button", { name: "Post transfer", exact: true }),
    ).toBeEnabled();
    return;
  }
  expect(response.status()).toBe(200);
  const quote = await response.json();
  await expect(
    page.getByRole("button", { name: "Post transfer", exact: true }),
  ).toBeEnabled();
  const transferResponse = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/transfers") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Post transfer", exact: true })
    .click();
  const posted = await transferResponse;
  expect(posted.status()).toBe(201);
  const first = await posted.json();
  expect(first.receipt.amountMinor).toBe(quote.settlementAmountMinor);
  await expect(page.getByText("COMMITTED", { exact: true })).toBeVisible();
  const replayResponse = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/transfers") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Replay last request", exact: true })
    .click();
  const replay = await (await replayResponse).json();
  expect(replay.replayed).toBe(true);
  expect(replay.receipt).toEqual(first.receipt);
  const after = await (await request.get("/api/state")).json();
  expect(after.counts.transfers).toBe(initial.counts.transfers + 1);
  expect(after.reconciliation.healthy).toBe(true);
});

test("translation scenario uses the selected shock and the archived simulator remains explicitly labeled", async ({
  page,
  request,
}) => {
  await ready(page);
  await navigate(page, "Market & scenarios");
  const state = await (await request.get("/api/state")).json();
  await page.locator("#shock").focus();
  await page.locator("#shock").press("End");
  await expect(page.locator(".scenario label strong")).toHaveText("+10%");
  if (state.market.available) {
    const total = state.accounts.reduce(
      (sum, a) => sum + BigInt(a.balance),
      0n,
    );
    const expected = (
      Number(total) /
      100 /
      Number(state.market.ratesToInr.USD) /
      1.1
    ).toLocaleString("en-US", { maximumFractionDigits: 2 });
    await expect(page.locator(".scenario-value")).toHaveText("$" + expected);
  }
  await page.goto("/?mode=simulator");
  await expect(
    page.getByText("ARCHIVED EDUCATIONAL SIMULATOR", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open the real ledger →" }),
  ).toBeVisible();
  await expect(
    page.getByText("FINOS-Core could not render", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Settlement Workbench/ }).first(),
  ).toBeVisible();
});
