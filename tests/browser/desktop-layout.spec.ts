import { expect, test, type Page } from '@playwright/test';
import { openCollectionRowsFromSettings } from './collection-rows-fixture';

// Serve the preview with the display mode selected before either application
// script runs. No TV layout class or TV-only native controls are added.
async function desktop(page: Page) {
  await page.route('http://127.0.0.1:4173/**', async route => {
    if (route.request().resourceType() !== 'document') return route.continue();
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace('class="layout-tv"', 'class="layout-desktop"') });
  });
}
const home = (page: Page) => page.locator('#indexPage #homeTab');

test.beforeEach(async ({ page }) => desktop(page));

test('desktop Home themes native sections and mouse/keyboard navigation restores item focus', async ({ page }) => {
  await page.goto('/?featured=0#/home');
  await expect(page.locator('body')).toHaveClass(/tvl-home/);
  await expect(page.locator('.layout-tv')).toHaveCount(0);
  await expect(home(page).getByRole('region', { name: 'My Media', exact: true }).locator('.card')).toHaveCount(5);
  const item = home(page).getByRole('region', { name: 'Continue watching', exact: true }).getByRole('button', { name: 'After the Tide', exact: true });
  await item.click();
  const details = page.getByRole('dialog', { name: 'After the Tide details', exact: true });
  await expect(details).toBeVisible(); await expect(page.locator('body')).not.toHaveClass(/tvl-home/);
  await expect(details.getByText('1h 54m', { exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('cinema-desktop-movie.png'), fullPage: true });
  await details.getByRole('button', { name: 'Add to favourites', exact: true }).click();
  await expect(details.getByRole('button', { name: 'Remove from favourites', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await details.getByRole('button', { name: 'Resume', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(details.getByRole('button', { name: 'Play from beginning', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(details.getByRole('button', { name: 'Watch trailer', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(item).toBeFocused(); await expect(page.locator('body')).toHaveClass(/tvl-home/);
  await expect(page.locator('.layout-tv')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('cinema-desktop-home.png'), fullPage: true });
});

test('desktop collection tabs, ranked cards and live row editor retain their saved Home behavior', async ({ page }) => {
  const config = { version: 1, rows: [{ id: 'desktop-platform', kind: 'items', title: 'Weekend picks', collectionIds: ['collection-coast'], ranked: true, placement: 'start', itemSort: 'collection', itemOrder: [], tabs: [
    { id: 'movies', label: 'Movies', collectionId: 'collection-coast', itemSort: 'collection', itemOrder: [] },
    { id: 'shows', label: 'Shows', collectionId: 'collection-wilderness', itemSort: 'collection', itemOrder: [] }
  ] }] };
  await page.addInitScript(config => localStorage.setItem(`jellyfin-cinema.home-collections.v1:${encodeURIComponent(location.origin)}:demo`, JSON.stringify(config)), config);
  await page.goto('/?featured=0#/home');
  const row = home(page).locator('[data-home-row="desktop-platform"]');
  await expect(row.getByRole('tab', { name: 'Movies', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(row.locator('.tvl-home-rank')).toHaveCount(2);
  await row.getByRole('tab', { name: 'Shows', exact: true }).click();
  const series = row.getByRole('button', { name: 'Rank 1: North of Nowhere', exact: true });
  await series.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'North of Nowhere details', exact: true })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(series).toBeFocused();
  await expect(row.getByRole('tab', { name: 'Shows', exact: true })).toHaveAttribute('aria-selected', 'true');
  await openCollectionRowsFromSettings(page);
  const editor = page.getByRole('dialog', { name: 'Customize Home rows', exact: true });
  const title = editor.getByLabel('Row title', { exact: true });
  await title.fill('Desktop favourites'); await title.press('ArrowLeft');
  await expect(title).toBeFocused();
  expect(await title.evaluate(node => (node as HTMLInputElement).selectionStart)).toBe('Desktop favourites'.length - 1);
  const preview = editor.getByRole('complementary', { name: 'Home row preview' });
  await expect(preview).toContainText('Desktop favourites'); await expect(preview.locator('.tvl-home-rank')).toHaveCount(2);
  await editor.getByRole('button', { name: 'Save rows', exact: true }).click();
  await page.evaluate(() => { location.hash = '/home'; });
  await expect(row).toHaveAttribute('aria-label', 'Desktop favourites');
  await expect(row.getByRole('tab', { name: 'Shows', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(row.locator('.tvl-home-rank')).toHaveCount(3);
  await row.getByRole('tab', { name: 'Movies', exact: true }).click();
  await expect(row.locator('.tvl-home-rank')).toHaveCount(2);
  await expect(page.locator('.layout-tv')).toHaveCount(0);
});

test('desktop show browsing preserves typed search and Back returns to the selected result', async ({ page }) => {
  await page.goto('/?featured=0#/tv?topParentId=library-tv');
  const shows = page.getByRole('dialog', { name: 'TV Shows', exact: true });
  await shows.getByRole('button', { name: 'All shows', exact: true }).click();
  const search = shows.getByRole('searchbox', { name: 'Search shows', exact: true });
  await search.click(); await search.fill('North'); await search.press('Enter');
  const result = shows.locator('[data-show-item="series-north"]');
  await expect(result).toHaveCount(1); await result.click();
  const details = page.getByRole('dialog', { name: 'North of Nowhere details', exact: true });
  await details.getByRole('button', { name: 'Episodes & seasons', exact: true }).click();
  await details.getByRole('navigation', { name: 'Seasons' }).getByRole('button', { name: /^Season 2/ }).click();
  await expect(details.getByRole('button', { name: 'S2 · E1 First Light', exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('cinema-desktop-series.png'), fullPage: true });
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await expect(search).toHaveValue('North'); await expect(result).toBeFocused();
  await expect(page.locator('.layout-tv')).toHaveCount(0);
});
