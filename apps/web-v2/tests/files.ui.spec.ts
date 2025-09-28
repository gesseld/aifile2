import { test, expect } from '@playwright/test'

const base = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001'

/**
 * Robust navigation helper to de-flake App Router dev streaming and RSC manifest churn:
 * - Try up to 3 times to navigate to /files.
 * - Require 200 response, then wait for domcontentloaded + networkidle.
 * - Finally assert the root testids are visible before proceeding.
 */
async function gotoFilesStable(page: import('@playwright/test').Page) {
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
      // small backoff before retry
      await page.waitForTimeout(1000)
    }
  }
  throw lastErr ?? new Error('Failed to stabilize /files after retries')
}

test.describe('File Manager UI - stable data-testid selectors', () => {
  test.beforeEach(async ({ page }) => {
    await gotoFilesStable(page)
  })

  test('Sidebar: items, counters, darkmode toggle, storage meter', async ({
    page,
  }) => {
    await expect(page.getByTestId('sidebar')).toBeVisible()
    await expect(page.getByTestId('sidebar-item-all')).toBeVisible()
    await expect(page.getByTestId('sidebar-item-recent')).toBeVisible()
    await expect(page.getByTestId('sidebar-item-shared')).toBeVisible()
    await expect(page.getByTestId('sidebar-item-starred')).toBeVisible()
    await expect(page.getByTestId('sidebar-item-trash')).toBeVisible()

    // Projects placeholders
    await expect(page.getByTestId('sidebar-item-projects-alpha')).toBeVisible()
    await expect(page.getByTestId('sidebar-item-projects-beta')).toBeVisible()

    // Dark mode toggle toggles html[data-theme="dark"]
    const darkBtn = page.getByTestId('sidebar-item-darkmode')
    await expect(darkBtn).toBeVisible()
    const html = page.locator('html')
    // Ensure starts without dark attribute
    await expect(html).not.toHaveAttribute('data-theme', 'dark')
    await darkBtn.click()
    await expect(html).toHaveAttribute('data-theme', 'dark')
    await darkBtn.click()
    await expect(html).not.toHaveAttribute('data-theme', 'dark')

    // Storage meter progressbar exists (assert semantics, avoid flake on tiny fill visibility)
    const storageFill = page.getByTestId('sidebar-storage-fill')
    await expect(storageFill).toHaveAttribute('role', 'progressbar')
    // Width should be > 0 (progress present)
    const bbox = await storageFill.boundingBox()
    expect(bbox?.width || 0).toBeGreaterThan(0)
  })

  test('Toolbar/Search/Breadcrumb: stable selectors present and interactive', async ({
    page,
  }) => {
    // Search
    const search = page.getByTestId('search-input')
    await expect(search).toBeVisible()
    await search.fill('quarterly report')
    await expect(search).toHaveValue('quarterly report')

    // Upload button
    const upload = page.getByTestId('btn-upload')
    await expect(upload).toBeVisible()

    // View toggles + aria-pressed behavior
    const btnList = page.getByTestId('toolbar-list')
    const btnAI = page.getByTestId('toolbar-ai')
    await expect(btnList).toBeVisible()
    await expect(btnAI).toBeVisible()

    // Default is list=true
    await expect(btnList).toHaveAttribute('aria-pressed', 'true')
    await expect(btnAI).toHaveAttribute('aria-pressed', 'false')

    // Toggle to AI and back
    await btnAI.click()
    await expect(btnAI).toHaveAttribute('aria-pressed', 'true')
    await expect(btnList).toHaveAttribute('aria-pressed', 'false')
    await btnList.click()
    await expect(btnList).toHaveAttribute('aria-pressed', 'true')
    await expect(btnAI).toHaveAttribute('aria-pressed', 'false')

    // Sort button
    const sort = page.getByTestId('toolbar-sort')
    await expect(sort).toBeVisible()

    // Breadcrumb crumbs
    await expect(page.getByTestId('crumb-root')).toBeVisible()
    await expect(page.getByTestId('crumb-files')).toBeVisible()
    await expect(page.getByTestId('crumb-here')).toBeVisible()
  })

  test('StatusBar: presence and live regions', async ({ page }) => {
    const status = page.getByTestId('statusbar')
    await expect(status).toBeVisible()
    await expect(status).toHaveAttribute('role', 'status')
    const q = page.getByTestId('statusbar-queue')
    const net = page.getByTestId('statusbar-net')
    await expect(q).toBeVisible()
    await expect(net).toBeVisible()
  })

  test('Right Details panel placeholder present', async ({ page }) => {
    await expect(page.getByTestId('right-details-panel')).toBeVisible()
  })

  test('Main file list placeholder present', async ({ page }) => {
    await expect(page.getByTestId('file-list-placeholder')).toBeVisible()
  })
})
