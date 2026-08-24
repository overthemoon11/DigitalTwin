/**
 * Visual + interaction QA for the Plant AI Assistant.
 *
 * Drives the whole assistant surface the way an operator would: welcome state,
 * a starter question, a free-form plant question nobody scripted, an MPC run
 * and its explanation, a setpoint proposal and its confirmation, a scenario,
 * the scenario-JSON box behind the advanced disclosure, clear, close and
 * reopen — on all three systems, capturing every state at three viewports and
 * asserting that nothing overflows the drawer and the console stays clean.
 *
 * Two assertions here are about the FEATURE rather than the pixels, and are the
 * reason this file is worth running:
 *
 *   - a free-form question that matches no command must produce a real answer,
 *     never the old predefined command menu;
 *   - a setpoint request must render a proposal that has NOT been applied, and
 *     must only reach the twin after the confirm button is pressed.
 *
 * Run the backend (:3007) and a Vite dev server first, then:
 *   node tests/assistant-visual-qa.mjs [baseUrl]
 */
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = process.argv[2] || "http://localhost:3006";
const outputDir = path.resolve("docs", "images", "assistant-redesign");
const VIEWPORTS = [
  [1920, 1080],
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

const panel = () => page.getByRole("dialog", { name: "Plant AI Assistant" });

/** The drawer, its scroller and the composer must never overflow sideways. */
const overflows = [];
async function checkOverflow(label) {
  const m = await page.evaluate(() => {
    const el = document.querySelector(".tw-asst-scroll");
    const drawer = document.querySelector(".tw-panel");
    return {
      scrollW: el?.scrollWidth ?? 0,
      clientW: el?.clientWidth ?? 0,
      drawerW: drawer?.scrollWidth ?? 0,
      drawerClientW: drawer?.clientWidth ?? 0,
      docScroll: document.documentElement.scrollWidth,
      docClient: document.documentElement.clientWidth,
    };
  });
  const bad =
    m.scrollW > m.clientW + 1 || m.drawerW > m.drawerClientW + 1 || m.docScroll > m.docClient + 1;
  if (bad) problems.push(`overflow @ ${label}: ${JSON.stringify(m)}`);
  overflows.push({ label, ...m, bad });
}

/** The send button must stay on screen with the composer, at every height. */
async function checkComposerVisible(label) {
  const send = page.locator(".tw-asst-send");
  if (!(await send.isVisible())) problems.push(`send button hidden @ ${label}`);
  const box = await send.boundingBox();
  const size = page.viewportSize();
  if (box && box.y + box.height > size.height + 1) {
    problems.push(`send button below the fold @ ${label}: ${JSON.stringify(box)}`);
  }
}

const openAssistant = async () => {
  await page.getByRole("button", { name: "Plant AI Assistant" }).first().click();
  await panel().waitFor();
  await page.waitForTimeout(450);
};

const ask = async (text) => {
  const box = panel().getByRole("textbox", { name: /Message the Plant AI Assistant/ });
  await box.fill(text);
  await box.press("Enter");
};

/**
 * Wait for a reply to be FINISHED, not merely started.
 *
 * The agent streams, so a bubble appears as soon as the first token lands.
 * The footer strip is rendered only once the turn completes, which makes it the
 * correct thing to wait on — waiting for the bubble would screenshot a
 * half-written sentence.
 */
const waitForReply = async (count) => {
  await page
    .locator(".tw-asst-msg--ai .tw-asst-bubble")
    .nth(count - 1)
    .waitFor({ timeout: 60_000 });
  const footers = page.locator(".tw-asst-foot-meta");
  await footers.nth(count - 1).waitFor({ timeout: 90_000 }).catch(() => {
    // ETS and AHU answer locally and render no footer; the bubble is the end.
  });
  await page.waitForTimeout(400);
};

/** The regression this whole feature exists to prevent. */
const OLD_MENU = /I can help you with:|Show me a summary.*How is energy usage|Set lobby temperature to 72/i;

const lastAnswer = () => page.locator(".tw-asst-msg--ai .tw-asst-bubble").last().innerText();

async function assertRealAnswer(label) {
  const text = await lastAnswer();
  if (OLD_MENU.test(text)) problems.push(`${label}: fell back to the old command menu`);
  if (text.trim().length < 60) problems.push(`${label}: answer too short — ${JSON.stringify(text.slice(0, 80))}`);
  return text;
}

try {
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 45_000 });
  await page.getByRole("heading", { name: "Plant overview" }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(900);

  /* ── welcome state ─────────────────────────────────────────────────────── */
  await openAssistant();
  await panel().getByRole("heading", { name: /understand and optimise the chiller plant/i }).waitFor();
  const llmStatus = await page.locator(".tw-asst-status").innerText();
  await shot("assistant-welcome-1920x1080");
  await checkOverflow("welcome");
  await checkComposerVisible("welcome");

  /* ── examples + advanced scenario JSON disclosure ──────────────────────── */
  await panel().getByRole("button", { name: /Examples & advanced/ }).click();
  await panel().getByRole("textbox", { name: "Scenario JSON" }).waitFor();
  await shot("assistant-advanced-1920x1080");
  await checkOverflow("advanced");

  // Put an example in the box, then take it back out — the disclosure feeds the
  // composer rather than sending behind the operator's back.
  await panel().getByRole("button", { name: /Examples & advanced/ }).click();
  await page.waitForTimeout(200);

  /* ── starter question: efficiency ──────────────────────────────────────── */
  await panel().getByRole("button", { name: /Why is efficiency low/ }).first().click();
  await waitForReply(1);
  await shot("assistant-efficiency-1920x1080");
  await checkOverflow("efficiency");
  await assertRealAnswer("starter question");
  const badges = await page.locator(".tw-asst-src").count();
  if (!badges) problems.push("no provenance badge on the answer");
  const metrics = await page.locator(".tw-asst-metric").count();
  if (!metrics) problems.push("efficiency answer rendered no metric block");

  /* ── a free-form question nobody scripted ──────────────────────────────── */
  // This is the acceptance requirement: it matches no command, and it must
  // still produce a grounded answer.
  await ask("why is my plant using so much power today?");
  await waitForReply(2);
  await shot("assistant-freeform-1920x1080");
  await checkOverflow("freeform");
  await checkComposerVisible("freeform");
  await assertRealAnswer("free-form question");

  /* ── MPC: run, then ask why ────────────────────────────────────────────── */
  await ask("run mpc on the current conditions");
  await waitForReply(3);
  await shot("assistant-mpc-run-1920x1080");
  await checkOverflow("mpc-run");
  const mpcText = await assertRealAnswer("run mpc");
  if (!/kW/.test(mpcText)) problems.push("MPC answer quoted no power figure");

  // A follow-up with no subject of its own — the conversation has to carry it.
  await ask("why did it choose that?");
  await waitForReply(4);
  await shot("assistant-mpc-explain-1920x1080");
  await checkOverflow("mpc-explain");
  const explainText = await assertRealAnswer("mpc explanation");
  if (!/lift|CHWST|return/i.test(explainText)) {
    problems.push("MPC explanation named no mechanism");
  }

  /* ── a setpoint request: proposed, previewed, NOT applied ──────────────── */
  const chwsBefore = await page.evaluate(async () => {
    const r = await fetch("/api/simulation/state");
    return (await r.json()).headers.chws;
  });
  await ask("set CHWST to 8.2 C");
  await waitForReply(5);
  await shot("assistant-proposal-1920x1080");
  await checkOverflow("proposal");
  const proposal = page.locator(".tw-asst-action").last();
  if (!(await proposal.count())) problems.push("setpoint request rendered no proposal card");
  const chwsDuring = await page.evaluate(async () => {
    const r = await fetch("/api/simulation/state");
    return (await r.json()).headers.chws;
  });
  if (Math.abs(chwsDuring - chwsBefore) > 0.01) {
    problems.push(`setpoint was applied WITHOUT confirmation: ${chwsBefore} → ${chwsDuring}`);
  }

  /* ── …and applied only after the operator confirms ─────────────────────── */
  if (await proposal.count()) {
    await proposal.getByRole("button", { name: /Confirm and apply/ }).click();
    await page.locator(".tw-asst-action--done").last().waitFor({ timeout: 20_000 });
    await shot("assistant-proposal-applied-1920x1080");
    const chwsAfter = await page.evaluate(async () => {
      const r = await fetch("/api/simulation/state");
      return (await r.json()).headers.chws;
    });
    if (Math.abs(chwsAfter - 8.2) > 0.35) {
      problems.push(`confirmed setpoint did not reach the twin: ${chwsAfter}`);
    }
    await page.evaluate(() => fetch("/api/simulation/reset", { method: "POST" }));
  }

  /* ── scenario execution ────────────────────────────────────────────────── */
  await ask("run the peak summer scenario");
  await waitForReply(6);
  await shot("assistant-scenario-1920x1080");
  await checkOverflow("scenario");
  await assertRealAnswer("scenario");

  /* ── scenario JSON, the advanced path ──────────────────────────────────── */
  await panel().getByRole("button", { name: /Examples & advanced/ }).click();
  const jsonBox = panel().getByRole("textbox", { name: "Scenario JSON" });
  await jsonBox.fill('{ "id": "night-low-load" }');
  await panel().getByRole("button", { name: "Run scenario JSON" }).click();
  await waitForReply(7);
  await shot("assistant-scenario-json-1920x1080");
  await checkOverflow("scenario-json");
  await assertRealAnswer("scenario JSON");
  await page.evaluate(() => fetch("/api/simulation/reset", { method: "POST" }));

  /* ── suggested action (whatever the plant is actually suggesting) ──────── */
  await panel().getByRole("button", { name: "Clear conversation" }).click();
  await panel().getByRole("heading", { name: /understand and optimise/i }).waitFor();
  const suggestion = panel().locator(".tw-asst-sug").first();
  const suggestionLabel = (await suggestion.count()) ? await suggestion.innerText() : "(none)";
  if (await suggestion.count()) {
    await suggestion.click();
    await waitForReply(1);
    await shot("assistant-suggested-1920x1080");
    await checkOverflow("suggested");
  }

  /* ── close / reopen keeps the thread ───────────────────────────────────── */
  const before = await page.locator(".tw-asst-msg").count();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await openAssistant();
  const after = await page.locator(".tw-asst-msg").count();
  if (before !== after) problems.push(`thread lost on reopen: ${before} → ${after}`);

  /* ── busy state, captured mid-flight ───────────────────────────────────── */
  await page.route("**/api/assistant/chat/stream", async (route) => {
    await new Promise((r) => setTimeout(r, 2500));
    try {
      await route.continue();
    } catch {
      // The route can be torn down while this one is still parked.
    }
  });
  await ask("give me a plant status summary");
  await page.locator(".tw-asst-think").waitFor({ timeout: 8000 });
  await shot("assistant-thinking-1920x1080");
  const busyStatus = await page.locator(".tw-asst-status").innerText();
  await page.locator(".tw-asst-think").waitFor({ state: "detached", timeout: 60_000 });
  await page.unroute("**/api/assistant/chat/stream");

  /* ── the other two systems ─────────────────────────────────────────────── */
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "District Cooling" }).click();
  await page.locator(".ets-station-2d").waitFor({ timeout: 20_000 });
  await openAssistant();
  await panel().getByRole("button", { name: "Clear conversation" }).click().catch(() => {});
  await page.waitForTimeout(300);
  await shot("assistant-district-cooling-1920x1080");
  await checkOverflow("district-cooling");

  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "AHU" }).click();
  await page.locator(".ahu-station-2d").waitFor({ timeout: 20_000 });
  await openAssistant();
  await shot("assistant-ahu-1920x1080");
  await checkOverflow("ahu");

  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Chiller Plant" }).click();
  await page.getByRole("heading", { name: "Plant overview" }).waitFor();

  /* ── responsive sweep: welcome and active thread at every viewport ─────── */
  for (const [width, height] of VIEWPORTS) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(350);
    await openAssistant();

    // active conversation: two exchanges, so the thread has to earn its height
    if (!(await page.locator(".tw-asst-msg").count())) {
      await ask("how is the plant doing?");
      await waitForReply(1);
      await ask("any alarms?");
      await waitForReply(2);
    }
    await page.waitForTimeout(350);
    await shot(`assistant-thread-${width}x${height}`);
    await checkOverflow(`thread@${width}x${height}`);
    await checkComposerVisible(`thread@${width}x${height}`);

    await panel().getByRole("button", { name: "Clear conversation" }).click();
    await panel().getByRole("heading", { name: /understand and optimise/i }).waitFor();
    await page.waitForTimeout(300);
    await shot(`assistant-welcome-${width}x${height}`);
    await checkOverflow(`welcome@${width}x${height}`);
    await checkComposerVisible(`welcome@${width}x${height}`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }

  /* ── phone-class overlay ───────────────────────────────────────────────── */
  await page.setViewportSize({ width: 420, height: 820 });
  await page.waitForTimeout(400);
  await openAssistant();
  await shot("assistant-welcome-420x820");
  await checkOverflow("welcome@420");

  console.log(
    JSON.stringify(
      {
        outputDir,
        llmStatus,
        busyStatus,
        firstSuggestion: suggestionLabel.replace(/\n/g, " · "),
        threadPreservedOnReopen: before === after,
        checked: overflows.length,
        overflowFailures: overflows.filter((o) => o.bad),
        consoleProblems: problems,
      },
      null,
      2
    )
  );
  if (problems.length) process.exitCode = 1;
} catch (err) {
  await shot("assistant-failure");
  console.error("ASSISTANT QA FAILED:", err.message);
  console.error(JSON.stringify({ consoleProblems: problems, overflows }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
