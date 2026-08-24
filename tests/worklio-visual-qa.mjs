/**
 * Visual + interaction QA for the workspace redesign.
 *
 * Walks the whole operator workflow — configure a scenario, review the
 * forecast, check the constraints, run the MPC, read the result, analyse the
 * trajectories, inspect the solver and the BMS points — capturing a screenshot
 * of every workspace and asserting that nothing overflows horizontally and that
 * the console stays clean.
 *
 * Run the backend (:3007) and a Vite dev server first, then:
 *   node tests/worklio-visual-qa.mjs [baseUrl]
 */
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = process.argv[2] || "http://localhost:3006";
const outputDir = path.resolve("docs", "images", "worklio-redesign");
const VIEWPORTS = [
  [1920, 1080],
  [1600, 900],
  [1440, 900],
  [1366, 768],
];

await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const page = await context.newPage();

const problems = [];
page.on("console", (m) => {
  if (m.type() === "error") problems.push(`console: ${m.text()}`);
});
page.on("pageerror", (e) => problems.push(`page: ${e.message}`));

const shot = (name) => page.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage: false });

async function overflow(label) {
  const m = await page.evaluate(() => ({
    docScroll: document.documentElement.scrollWidth,
    docClient: document.documentElement.clientWidth,
    mainScroll: document.querySelector(".tw-main")?.scrollWidth ?? 0,
    mainClient: document.querySelector(".tw-main")?.clientWidth ?? 0,
  }));
  const bad = m.docScroll > m.docClient + 1 || m.mainScroll > m.mainClient + 1;
  if (bad) problems.push(`overflow @ ${label}: ${JSON.stringify(m)}`);
  return { label, ...m, bad };
}

const overflows = [];
const go = async (hash) => {
  await page.evaluate((h) => {
    window.location.hash = h;
  }, hash);
  await page.waitForTimeout(500);
};

try {
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 45_000 });
  await page.getByRole("heading", { name: "Plant overview" }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(900);
  await shot("plant-1920x1080");
  overflows.push(await overflow("plant"));

  /* ── digital twin interactions ─────────────────────────────────────────── */
  await page.getByRole("button", { name: /Summary/ }).click();
  await page.getByText("Plant Summary", { exact: true }).waitFor();
  await shot("plant-summary-1920x1080");
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: /3D/ }).click();
  await page.locator(".chiller-plant-3d canvas").waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1200);
  await shot("plant-3d-1920x1080");
  await page.getByRole("button", { name: /2D/ }).click();
  await page.waitForTimeout(300);

  await page.locator('.scada-viewport-tools button[title="Zoom in"]').click();
  await page.locator('.scada-viewport-tools button[title="Zoom out"]').click();
  await page.locator('.scada-viewport-tools button[title="Fit full plant"]').click();

  /* ── equipment selection → contextual panel ────────────────────────────── */
  await page.getByRole("button", { name: "Assets" }).first().click();
  await page.getByRole("dialog", { name: "Plant assets" }).waitFor();
  await page.waitForTimeout(400);
  await shot("plant-assets-panel-1920x1080");
  await page.getByText("CH-3", { exact: true }).click();
  await page.waitForTimeout(700);
  await shot("plant-equipment-selected-1920x1080");
  await page.getByRole("button", { name: "Clear selection" }).click();
  await page.waitForTimeout(400);

  /* ── search palette ────────────────────────────────────────────────────── */
  await page.keyboard.press("Control+k");
  await page.getByRole("dialog", { name: "Search" }).waitFor();
  await page.getByRole("textbox", { name: "Search" }).fill("analytics");
  await page.waitForTimeout(250);
  await shot("command-palette-1920x1080");
  await page.keyboard.press("Escape");

  /* ── simulation ────────────────────────────────────────────────────────── */
  await go("#/chiller/simulation");
  await page.getByRole("heading", { name: "Simulation setup" }).waitFor();
  await page.waitForTimeout(1600);
  await shot("simulation-1920x1080");
  overflows.push(await overflow("simulation"));

  /* ── engineering: constraints ──────────────────────────────────────────── */
  await go("#/chiller/engineering/constraints");
  await page.getByRole("heading", { name: "MPC constraint set" }).waitFor();
  await page.waitForTimeout(500);
  await shot("engineering-constraints-1920x1080");
  overflows.push(await overflow("engineering-constraints"));

  /* ── run the optimiser ─────────────────────────────────────────────────── */
  await go("#/chiller/optimization");
  await page.getByRole("heading", { name: "MPC optimisation" }).waitFor();
  await shot("optimization-empty-1920x1080");

  const run = page.getByRole("button", { name: /Run MPC optimisation/ }).first();
  await run.click();
  await page
    .locator(".tw-page-head-actions .tw-pill")
    .filter({ hasText: /Optimal|Fallback used|Failed/ })
    .first()
    .waitFor({ timeout: 240_000 });
  await page.waitForTimeout(900);
  await page.evaluate(() => document.querySelector(".tw-main")?.scrollTo(0, 0));
  await shot("optimization-1920x1080");
  overflows.push(await overflow("optimization"));

  await page.evaluate(() => document.querySelector(".tw-main")?.scrollTo(0, 1500));
  await page.waitForTimeout(400);
  await shot("optimization-why-1920x1080");
  await page.evaluate(() => document.querySelector(".tw-main")?.scrollTo(0, 0));

  /* ── restore / re-apply round trip ─────────────────────────────────────── */
  const restore = page.getByRole("button", { name: "Restore current" }).first();
  if (await restore.isEnabled()) {
    await restore.click();
    await page.waitForTimeout(900);
    const reapply = page.getByRole("button", { name: "Apply optimum" }).first();
    await reapply.click();
    await page.waitForTimeout(900);
  }

  /* ── analytics ─────────────────────────────────────────────────────────── */
  await go("#/chiller/analytics");
  await page.getByRole("heading", { name: "Plant analytics" }).waitFor();
  await page.waitForTimeout(700);
  await shot("analytics-overview-1920x1080");
  overflows.push(await overflow("analytics-overview"));

  for (const [tab, name] of [
    ["Forecast", "analytics-forecast"],
    ["Plant state", "analytics-plant-state"],
    ["Energy", "analytics-energy"],
    ["Live equipment", "analytics-equipment"],
  ]) {
    await page.getByRole("tab", { name: tab }).click();
    await page.waitForTimeout(500);
    await shot(`${name}-1920x1080`);
    overflows.push(await overflow(name));
  }

  // Synchronised crosshair.
  await page.getByRole("tab", { name: "Forecast" }).click();
  await page.waitForTimeout(400);
  const chart = page.locator(".tw-chart svg").first();
  const box = await chart.boundingBox();
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.5);
  await page.waitForTimeout(350);
  await shot("analytics-crosshair-1920x1080");

  /* ── engineering: solver, bms, model, manual ───────────────────────────── */
  for (const [sub, heading, name] of [
    ["solver", "Step-by-step diagnostics", "engineering-solver"],
    ["bms", "T1 dataset mapping", "engineering-bms"],
    ["model", null, "engineering-model"],
    ["manual", "Manual plant controls", "engineering-manual"],
  ]) {
    await go(`#/chiller/engineering/${sub}`);
    if (heading) await page.getByText(heading, { exact: false }).first().waitFor({ timeout: 15_000 });
    await page.waitForTimeout(600);
    await shot(`${name}-1920x1080`);
    overflows.push(await overflow(name));
  }

  // BMS search + group filter.
  await go("#/chiller/engineering/bms");
  await page.getByLabel("Filter BMS points").fill("CHWP");
  await page.waitForTimeout(400);
  await shot("engineering-bms-filtered-1920x1080");
  await page.getByLabel("Filter BMS points").fill("");

  /* ── other systems ─────────────────────────────────────────────────────── */
  await page.getByRole("button", { name: "District Cooling" }).click();
  await page.locator(".ets-station-2d").waitFor({ timeout: 20_000 });
  await page.waitForTimeout(900);
  await shot("district-cooling-plant-1920x1080");
  overflows.push(await overflow("district-cooling"));

  await go("#/district-cooling/simulation");
  await page.waitForTimeout(800);
  await shot("district-cooling-controls-1920x1080");

  await page.getByRole("button", { name: "AHU" }).click();
  await page.locator(".ahu-station-2d").waitFor({ timeout: 20_000 });
  await page.waitForTimeout(900);
  await shot("ahu-plant-1920x1080");
  overflows.push(await overflow("ahu"));

  await page.getByRole("button", { name: "Chiller Plant" }).click();
  await page.getByRole("heading", { name: "Plant overview" }).waitFor();

  /* ── assistant panel ───────────────────────────────────────────────────── */
  /* Full coverage of the assistant lives in tests/assistant-visual-qa.mjs. */
  await page.getByRole("button", { name: "Plant AI Assistant" }).first().click();
  await page.getByRole("dialog", { name: "Plant AI Assistant" }).waitFor();
  await page.waitForTimeout(500);
  await shot("assistant-panel-1920x1080");
  await page.keyboard.press("Escape");

  /* ── responsive sweep ──────────────────────────────────────────────────── */
  for (const [width, height] of VIEWPORTS) {
    await page.setViewportSize({ width, height });
    for (const [hash, name] of [
      ["#/chiller/plant", "plant"],
      ["#/chiller/simulation", "simulation"],
      ["#/chiller/optimization", "optimization"],
      ["#/chiller/analytics", "analytics"],
      ["#/chiller/engineering/constraints", "engineering"],
    ]) {
      await go(hash);
      await page.waitForTimeout(650);
      await page.evaluate(() => document.querySelector(".tw-main")?.scrollTo(0, 0));
      if (width !== 1920) await shot(`${name}-${width}x${height}`);
      overflows.push(await overflow(`${name}@${width}`));
    }
  }

  // Collapsed rail fallback at the smallest supported width.
  await page.setViewportSize({ width: 1366, height: 768 });
  await go("#/chiller/plant");
  await page.getByRole("button", { name: /workspace navigation/i }).click();
  await page.waitForTimeout(450);
  await shot("plant-nav-collapsed-1366x768");
  overflows.push(await overflow("nav-collapsed@1366"));

  console.log(
    JSON.stringify(
      {
        outputDir,
        overflowFailures: overflows.filter((o) => o.bad),
        checked: overflows.length,
        consoleProblems: problems,
      },
      null,
      2
    )
  );
} catch (err) {
  await shot("failure");
  console.error("QA FAILED:", err.message);
  console.error(JSON.stringify({ consoleProblems: problems }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
