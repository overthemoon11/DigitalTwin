// Screenshot script using Playwright
// Takes high-resolution screenshots of each application view using Chrome.
// Requires both the backend (port 3003) and frontend (port 3002) to be running.

import { chromium } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://localhost:3002';
const OUTPUT_DIR = path.resolve(__dirname, '..', 'docs', 'images');
const DEMO_OUTPUT = path.resolve(__dirname, '..', 'docs', 'AppDemo.png');

async function takeScreenshots() {
  console.log('Launching Chrome browser...');
  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2, // high-DPI for sharp output
    });
    const page = await context.newPage();

    console.log(`Navigating to ${BASE_URL}...`);
    await page.goto(BASE_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Wait for the 3D scene canvas to appear and render
    console.log('Waiting for 3D scene to render...');
    await page.waitForSelector('canvas', { timeout: 15000 });
    await page.waitForTimeout(4000); // allow Three.js to finish rendering

    // 1. App overview (full UI)
    console.log('Taking app-overview screenshot...');
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'app-overview.png'), fullPage: false });
    await page.screenshot({ path: DEMO_OUTPUT, fullPage: false });

    // 2. KPI panel - click KPIs tab
    console.log('Taking kpi-panel screenshot...');
    const kpiTab = page.getByRole('button', { name: /kpi/i });
    if (await kpiTab.count()) {
      await kpiTab.first().click();
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'kpi-panel.png'), fullPage: false });

    // 3. Copilot panel - click Copilot/Chat tab
    console.log('Taking copilot-panel screenshot...');
    const copilotTab = page.getByRole('button', { name: /chatbot|local llm/i });
    if (await copilotTab.count()) {
      await copilotTab.first().click();
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'copilot-panel.png'), fullPage: false });

    // Helper: click an asset-tree item by label text
    async function selectAsset(name) {
      const item = page.locator(`text=${name}`).first();
      if (await item.isVisible({ timeout: 2000 }).catch(() => false)) {
        await item.click();
        await page.waitForTimeout(1500); // camera transition
      }
    }

    // 4. Mechanical room
    console.log('Taking mechanical-room screenshot...');
    await selectAsset('Mechanical Room');
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'mechanical-room.png'), fullPage: false });

    // 5. Open office
    console.log('Taking open-office screenshot...');
    await selectAsset('Open Office');
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'open-office.png'), fullPage: false });

    // 6. Main lobby
    console.log('Taking mainlobby screenshot...');
    await selectAsset('Lobby');
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'mainlobby.png'), fullPage: false });

    // 7. Conference room
    console.log('Taking conference-room screenshot...');
    await selectAsset('Conference');
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'conference-room.png'), fullPage: false });

    console.log('All screenshots saved to docs/images/');
  } finally {
    await browser.close();
  }
}

takeScreenshots().catch((err) => {
  console.error('Screenshot capture failed:', err.message);
  console.error('Ensure both backend (port 3003) and frontend (port 3002) are running.');
  process.exit(1);
});
