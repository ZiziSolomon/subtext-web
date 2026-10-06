import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/?demo')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?demo')
  // headless pages start without keyboard focus; a real window has it
  await page.locator('.brand').click()
})

test('week view shows contexts in the key and as untitled stripes', async ({ page }) => {
  await expect(page.getByRole('tab', { name: 'Week' })).toHaveAttribute('aria-selected', 'true')
  const key = page.locator('.key-list')
  for (const name of ['School term', 'On call', 'Shifts', 'Kids weekend']) {
    await expect(key.getByRole('button', { name })).toBeVisible()
  }
  // contexts are not in the event blocks; commitments are
  await expect(page.locator('.tg-event', { hasText: 'Team meeting' })).toBeVisible()
  await expect(page.locator('.tg-event', { hasText: 'On call' })).toHaveCount(0)
  expect(await page.locator('.tg-stripe').count()).toBeGreaterThan(5)
  await page.screenshot({ path: 'test-results/week.png' })
})

test('a stripe opens its context with the reason it is one', async ({ page }) => {
  await page.locator('.tg-stripe[title^="Shifts"]').first().click()
  await expect(page.locator('dialog.details')).toContainText('title contains “shift”')
})

test('month view draws context bars and lists commitments', async ({ page }) => {
  await page.keyboard.press('m')
  await expect(page.getByRole('tab', { name: 'Month' })).toHaveAttribute('aria-selected', 'true')
  expect(await page.locator('.mg-context-bar').count()).toBeGreaterThan(3)
  await expect(page.locator('.mg-chip', { hasText: 'Dentist' })).toBeVisible()
  await page.screenshot({ path: 'test-results/month.png' })
})

test('day view and navigation', async ({ page }) => {
  await page.keyboard.press('d')
  await expect(page.locator('.tg-day-head')).toHaveCount(1)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('t')
  await page.screenshot({ path: 'test-results/day.png' })
})

test('hiding a calendar hides its events and contexts', async ({ page }) => {
  await page.getByLabel('Work').uncheck()
  await expect(page.locator('.key-list').getByRole('button', { name: 'Shifts' })).toHaveCount(0)
  await expect(page.locator('.tg-event', { hasText: 'Team meeting' })).toHaveCount(0)
})
