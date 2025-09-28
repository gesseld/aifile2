import { test, expect, Page } from '@playwright/test'

const base = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001'
const outDir = 'apps/web-v2/test-results/statusbar'

async function gotoFilesStable(page: Page) {
  let lastErr: any = null
  for (let i = 0; i < 3; i++) {
    try {
      const resp = await page.goto(base + '/files', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      })
      if (!resp || !resp.ok()) {
        throw new Error(`GET /files not OK, status=${resp?.status()}`)
      }
      await page
        .waitForLoadState('networkidle', { timeout: 15000 })
        .catch(() => {})
      await expect(page.getByTestId('files-page')).toBeVisible({
        timeout: 10000,
      })
      await expect(page.getByTestId('file-browser-shell')).toBeVisible({
        timeout: 10000,
      })
      return
    } catch (e) {
      lastErr = e
      await page.waitForTimeout(800)
    }
  }
  throw lastErr ?? new Error('Failed to stabilize /files after retries')
}

async function screenshotStatusbar(page: Page, name: string) {
  const sb = page.getByTestId('statusbar')
  await expect(sb).toBeVisible({ timeout: 10000 })
  // ensure it's on screen and fully painted
  await sb.scrollIntoViewIfNeeded()
  await page.waitForTimeout(200)
  await sb.screenshot({ path: `${outDir}/${name}.png` })
}

test.describe('StatusBar screenshots (light/dark, compact, high-contrast)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoFilesStable(page)
  })

  test('Light - default', async ({ page }) => {
    await page.evaluate(() => {
      const html = document.documentElement
      html.removeAttribute('data-theme')
      html.removeAttribute('data-density')
      html.removeAttribute('data-high-contrast')
    })
    await screenshotStatusbar(page, 'statusbar-light')
  })

  test('Dark', async ({ page }) => {
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark')
      document.documentElement.removeAttribute('data-density')
      document.documentElement.removeAttribute('data-high-contrast')
    })
    await screenshotStatusbar(page, 'statusbar-dark')
  })

  test('Compact density', async ({ page }) => {
    await page.evaluate(() => {
      const html = document.documentElement
      html.removeAttribute('data-theme')
      html.setAttribute('data-density', 'compact')
      html.removeAttribute('data-high-contrast')
    })
    await screenshotStatusbar(page, 'statusbar-compact')
  })

  test('High-contrast', async ({ page }) => {
    await page.evaluate(() => {
      const html = document.documentElement
      html.removeAttribute('data-theme')
      html.removeAttribute('data-density')
      html.setAttribute('data-high-contrast', '1')
    })
    await screenshotStatusbar(page, 'statusbar-high-contrast')
  })
})
