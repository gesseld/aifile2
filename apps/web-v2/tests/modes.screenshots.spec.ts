// Playwright screenshot capture for advanced modes
// Usage (from repo root or apps/web-v2):
// 1) Ensure Next dev server is running on port 3001
// 2) npx playwright install chromium
// 3) npx playwright test apps/web-v2/tests/modes.screenshots.spec.ts --project=chromium --reporter=list --config=apps/web-v2/playwright.config.ts
//    or: npx playwright test --project=chromium --grep @modes --config=apps/web-v2/playwright.config.ts
//
// Artifacts will be saved under apps/web-v2/test-results/modes/

import { test, expect, Page } from '@playwright/test';

const outDir = 'apps/web-v2/test-results/modes';
const pageUrl = '/dev/modes';

async function gotoModes(page: Page) {
  const base = test.info().config.use?.baseURL || 'http://localhost:3001';
  await page.goto(base + pageUrl);
  await expect(page.getByTestId('dev-modes-page')).toBeVisible();
}

async function resetAll(page: Page) {
  const btn = page.getByTestId('toggle-reset-all');
  if (await btn.isVisible()) {
    await btn.click();
  }
}

async function refreshSnapshot(page: Page) {
  const btn = page.getByTestId('snapshot-refresh');
  if (await btn.isVisible()) {
    await btn.click();
  }
}

test.describe('Advanced modes visual verification', () => {
  test.beforeEach(async ({ page }) => {
    await gotoModes(page);
    await resetAll(page);
  });

  test('Light (default) - baseline', async ({ page }) => {
    await refreshSnapshot(page);
    await page.screenshot({ path: `${outDir}/light-baseline.png`, fullPage: true });
  });

  test('Dark theme', async ({ page }) => {
    await page.getByTestId('toggle-theme-dark').click();
    await refreshSnapshot(page);
    await page.screenshot({ path: `${outDir}/dark.png`, fullPage: true });
  });

  test('Density: compact', async ({ page }) => {
    await page.getByTestId('toggle-density-compact').click();
    await refreshSnapshot(page);
    await page.screenshot({ path: `${outDir}/density-compact.png`, fullPage: true });
  });

  test('High contrast: on', async ({ page }) => {
    await page.getByTestId('toggle-high-contrast-on').click();
    await refreshSnapshot(page);
    await page.screenshot({ path: `${outDir}/high-contrast.png`, fullPage: true });
  });

  test('Text zoom: lg', async ({ page }) => {
    await page.getByTestId('toggle-text-zoom-lg').click();
    await refreshSnapshot(page);
    await page.screenshot({ path: `${outDir}/text-zoom-lg.png`, fullPage: true });
  });

  test('Text zoom: xl', async ({ page }) => {
    await page.getByTestId('toggle-text-zoom-xl').click();
    await refreshSnapshot(page);
    await page.screenshot({ path: `${outDir}/text-zoom-xl.png`, fullPage: true });
  });

  test('Reduced motion: on', async ({ page }) => {
    await page.getByTestId('toggle-reduce-motion-on').click();
    await refreshSnapshot(page);
    await page.screenshot({ path: `${outDir}/reduced-motion.png`, fullPage: true });
  });

  test('Combo: Dark + Compact', async ({ page }) => {
    await page.getByTestId('combo-dark-compact').click();
    await refreshSnapshot(page);
    await page.screenshot({ path: `${outDir}/combo-dark-compact.png`, fullPage: true });
  });

  test('Combo: High Contrast', async ({ page }) => {
    await page.getByTestId('combo-high-contrast').click();
    await refreshSnapshot(page);
    await page.screenshot({ path: `${outDir}/combo-high-contrast.png`, fullPage: true });
  });

  test('Combo: Text Zoom lg', async ({ page }) => {
    await page.getByTestId('combo-text-zoom-lg').click();
    await refreshSnapshot(page);
    await page.screenshot({ path: `${outDir}/combo-text-zoom-lg.png`, fullPage: true });
  });

  test('Combo: Reduced Motion', async ({ page }) => {
    await page.getByTestId('combo-reduce-motion').click();
    await refreshSnapshot(page);
    await page.screenshot({ path: `${outDir}/combo-reduced-motion.png`, fullPage: true });
  });
});