import { expect, test, type Page } from '@playwright/test';
import { homeCollectionKey } from '../../src/home-collection-settings';
import { openCollectionRowsFromSettings } from './collection-rows-fixture';

const home = (page: Page) => page.locator('#homeTab');
const themed = (page: Page, theme: string) => home(page).locator(`[data-home-row="showcase-${theme}"]`);

test('dated Christmas Advent unlocks by preview day while the actual calendar remains unchanged', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-07-15T12:00:00Z') });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?featured=0&layout=desktop&showcase=advent#/home');
  const row = themed(page, 'advent'), cards = row.locator('.tvl-home-row-card');
  await expect(cards).toHaveCount(5);
  await expect(row.locator('[data-advent-locked="false"]')).toHaveCount(3);
  await expect(row.locator('[data-advent-locked="true"]')).toHaveCount(2);
  await cards.nth(3).focus();
  await expect(cards.nth(3)).not.toHaveClass(/tvl-seasonal-item-open/);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/home$/);
  await page.getByLabel('Advent preview date', { exact: true }).selectOption('4');
  await expect(row.locator('[data-advent-locked="false"]')).toHaveCount(4);
  await expect(row.locator('[data-advent-locked="true"]')).toHaveCount(1);
  await cards.nth(3).focus();
  await expect(cards.nth(3)).toHaveClass(/tvl-seasonal-item-open/);
  expect(await page.evaluate(() => new Date().getMonth())).toBe(6);
  await cards.nth(3).click();
  await expect(page.getByRole('dialog', { name: / details$/ })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Advent demo calendar' })).toBeHidden();
});

test('latest showcase changes only the seasonal row with the calendar, keeping services and trending films', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-09T12:00:00Z') });
  await page.goto('/?featured=0&providers=1&layout=desktop&showcase=latest#/home');
  await expect(home(page).locator('.tvl-provider-tile')).toHaveCount(9);
  await expect(home(page).locator('[data-home-row="showcase-trending"] .tvl-home-row-card')).toHaveCount(5);
  await expect(themed(page, 'halloween').locator('.tvl-home-row-card')).toHaveCount(5);
  await expect(themed(page, 'christmas')).toHaveCount(0);
  await page.clock.setSystemTime(new Date('2026-12-09T12:00:00Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(themed(page, 'halloween')).toHaveCount(0);
  await expect(themed(page, 'christmas').locator('.tvl-home-row-card')).toHaveCount(5);
  await expect(home(page).locator('.tvl-provider-tile')).toHaveCount(9);
  await expect(home(page).locator('[data-home-row="showcase-trending"] .tvl-home-row-card')).toHaveCount(5);
});

for (const theme of ['halloween', 'christmas']) test(`${theme} showcase loads bundled art and opens its themed row outside the actual season`, async ({ page }) => {
  await page.clock.install({ time: new Date('2026-07-15T12:00:00Z') });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto(`/?featured=0&providers=1&layout=tv&showcase=${theme}#/home`);
  await expect(home(page).locator('.tvl-provider-tile')).toHaveCount(9);
  await expect(home(page).locator('[data-home-row="showcase-trending"] .tvl-home-rank')).toHaveCount(5);
  const row = themed(page, theme), cards = row.locator('.tvl-home-row-card');
  await expect(cards).toHaveCount(5);
  await expect(row).toHaveAttribute('data-seasonal-expansion', 'fullscreen');
  const card = cards.nth(1);
  await card.focus();
  await expect(row).toHaveClass(/tvl-seasonal-expanded/);
  await expect(card).toHaveClass(/tvl-seasonal-item-open/);
  await expect(row.locator('.tvl-seasonal-title-themed')).toHaveCSS('opacity', '1');
  await expect.poll(() => row.locator('img').evaluateAll(nodes => nodes.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
  if (theme === 'christmas') {
    await expect(cards.locator('.tvl-seasonal-advent-number')).toHaveCount(5);
    await expect(card).toHaveAttribute('data-advent-day', '2');
    await expect(card).toHaveAttribute('data-advent-locked', 'false');
  }
  const itemId = await card.getAttribute('data-item-id');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: / details$/ })).toBeVisible();
  await page.goBack();
  await expect(themed(page, theme).locator(`[data-item-id="${itemId}"]`)).toBeFocused();
  expect(requests.filter(url => /^https?:/.test(url)).every(url => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
});

test('showcase editing persists without changing the normal demo or another showcase', async ({ page }) => {
  const normal = JSON.stringify({ version: 1, rows: [] });
  await page.addInitScript(value => {
    const key = `jellyfin-cinema.home-collections.v1:${encodeURIComponent(location.origin)}:demo`;
    if (!localStorage.getItem(key)) localStorage.setItem(key, value);
  }, normal);
  await page.goto('/?featured=0&providers=1&layout=desktop&showcase=halloween#/home');
  await expect(themed(page, 'halloween')).toBeVisible();
  await openCollectionRowsFromSettings(page);
  const editor = page.getByRole('dialog', { name: 'Customize Home rows', exact: true });
  await expect(editor.getByRole('button', { name: 'Save rows', exact: true })).toBeEnabled();
  await editor.locator('[data-editor-row="showcase-halloween"]').click();
  await editor.getByLabel('Row title', { exact: true }).fill('My autumn film night');
  await editor.getByRole('button', { name: 'Save rows', exact: true }).click();
  await page.reload();
  await openCollectionRowsFromSettings(page);
  await expect(editor.locator('[data-editor-row="showcase-halloween"]')).toContainText('My autumn film night');
  const origin = new URL(page.url()).origin;
  const normalKey = homeCollectionKey(origin, 'demo');
  expect(await page.evaluate(key => localStorage.getItem(key), normalKey)).toBe(normal);
  await page.goto('/?featured=0&providers=1&layout=desktop&showcase=christmas#/home');
  await expect(themed(page, 'christmas')).toBeVisible();
  await expect(themed(page, 'halloween')).toHaveCount(0);
  await page.goto('/?featured=0&providers=1&layout=desktop#/home');
  await expect(home(page).locator('.tvl-provider-tile')).toHaveCount(9);
  await expect(home(page).locator('.tvl-home-collection-row')).toHaveCount(0);
  expect(await page.evaluate(key => localStorage.getItem(key), normalKey)).toBe(normal);
});
