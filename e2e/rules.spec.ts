import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/?demo')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?demo')
  await page.locator('.brand').click()
})

test('the rules panel lists the rules with their reach', async ({ page }) => {
  await page.keyboard.press('r')
  const panel = page.getByRole('complementary', { name: 'Contextual rules' })
  await expect(panel.locator('.rule-row')).toHaveCount(4)
  await expect(panel.locator('.rule-row', { hasText: 'Title contains “on call”' })).toContainText('events')
})

test('typing a rule lists every match and outlines it, and saving makes it a context', async ({ page }) => {
  await page.getByRole('button', { name: 'Rules' }).click()
  await page.getByRole('button', { name: '+ New rule' }).click()
  await page.getByLabel('Text in the title').fill('dentist')
  const panel = page.getByRole('complementary')
  await expect(panel.locator('.matches h3')).toHaveText('1 matching event')
  await expect(panel.locator('.match-list')).toContainText('Dentist')
  await expect(page.locator('.tg-event.is-highlighted', { hasText: 'Dentist' })).toBeVisible()
  await page.screenshot({ path: 'test-results/rule-editor.png' })

  await page.getByLabel('Name in the key (optional)').fill('Health')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.locator('.key-list')).toContainText('Health')
  await expect(page.locator('.tg-event', { hasText: 'Dentist' })).toHaveCount(0)
})

test('a risky or non-portable regex is refused with a reason', async ({ page }) => {
  await page.keyboard.press('r')
  await page.getByRole('button', { name: '+ New rule' }).click()
  await page.getByLabel('Match').selectOption('title_regex')
  await page.getByLabel('Regular expression').fill('(a+)+')
  await expect(page.getByText('Nested repeats')).toBeVisible()
  await page.getByLabel('Regular expression').fill('[[:alpha:]]')
  await expect(page.getByText('reads […] inside […], or && differently')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()
})

test('every event in a calendar needs a calendar', async ({ page }) => {
  await page.keyboard.press('r')
  await page.getByRole('button', { name: '+ New rule' }).click()
  await page.getByLabel('Match').selectOption('all')
  await expect(page.getByText('Choose the calendar')).toBeVisible()
  await page.getByLabel('Calendar', { exact: true }).selectOption({ label: 'Family (demo)' })
  await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled()
})

test('marking an event from its details makes it a context, and unmarking undoes it', async ({ page }) => {
  await page.locator('.tg-event', { hasText: 'Swimming' }).click()
  await page.getByRole('button', { name: /Mark as contextual/ }).click()
  await expect(page.locator('.tg-event', { hasText: 'Swimming' })).toHaveCount(0)
  await expect(page.locator('.key-list')).toContainText('Swimming')

  await page.locator('.key-list').getByRole('button', { name: 'Swimming' }).click()
  await page.getByRole('button', { name: 'Unmark as contextual' }).click()
  await expect(page.locator('.tg-event', { hasText: 'Swimming' })).toBeVisible()
})

test('make a rule from a title opens the editor prefilled', async ({ page }) => {
  await page.locator('.tg-event', { hasText: 'Team meeting' }).click()
  await page.getByRole('button', { name: 'Make a rule from this title' }).click()
  await expect(page.getByLabel('Text in the title')).toHaveValue('Team meeting')
  await expect(page.getByLabel('Calendar', { exact: true })).toHaveValue('work@demo')
})
