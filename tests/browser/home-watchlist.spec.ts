import { expect, test, type Page } from '@playwright/test';
import { collectionRowsSettingsLink, openCollectionRowsFromSettings } from './collection-rows-fixture';
import { useDesktopLayout } from './layout-fixture';

const editor = (page: Page) => page.getByRole('dialog', { name: 'Customize Home rows', exact: true });
const preview = (page: Page) => editor(page).getByRole('complementary', { name: 'Home row preview', exact: true });
const homeRow = (page: Page) => page.locator('#homeTab [data-home-row]').filter({ has: page.locator('.tvl-home-row-title', { hasText: /Watchlist|Watch next/ }) });

async function setup(page: Page, seeded = false) {
  if (seeded) await page.addInitScript(() => localStorage.setItem(`jellyfin-cinema.home-collections.v1:${encodeURIComponent(location.origin)}:demo`, JSON.stringify({ version: 1, rows: [
    { id: 'watchlist', kind: 'watchlist', title: 'Watchlist', collectionIds: [], ranked: false, placement: 'end', itemSort: 'collection', itemOrder: [] }
  ] })));
  await page.goto('/?featured=0#/mypreferencesmenu');
  await useDesktopLayout(page);
  await expect(collectionRowsSettingsLink(page)).toBeVisible();
  await page.evaluate(() => {
    const api = window.TvItemLayoutDemo!.api;
    const state = (window as any).__watchlistFixture = { fail: false, requests: 0, pages: [] as number[], items: [
      { Id: 'movie-tide', Name: 'After the Tide', Type: 'Movie', ProductionYear: 2025 },
      { Id: 'series-north', Name: 'The North Line', Type: 'Series', ProductionYear: 2024 }
    ] };
    api.getWatchlist = async query => {
      state.requests++; state.pages.push(query?.startIndex || 0);
      if (state.fail) throw new Error('offline');
      const start = query?.startIndex || 0, limit = query?.limit || 100;
      return { items: state.items.slice(start, start + limit), total: state.items.length, nextStartIndex: Math.min(start + limit, state.items.length) };
    };
  });
}
async function openEditor(page: Page) {
  await openCollectionRowsFromSettings(page);
  await expect(editor(page).getByRole('button', { name: 'Save rows', exact: true })).toBeEnabled();
}
async function notify(page: Page, user?: string) {
  await page.evaluate(user => {
    const api = window.TvItemLayoutDemo!.api;
    window.dispatchEvent(new CustomEvent('tvl-watchlist-change', { detail: { serverId: api.serverId, userId: user || api.userId } }));
  }, user);
}
async function goHome(page: Page) { await page.evaluate(() => { location.hash = '/home'; }); }

test('Watchlist can be previewed, titled, ordered, placed and saved without choosing a collection', async ({ page }) => {
  await setup(page); await openEditor(page);
  await editor(page).getByRole('button', { name: 'Add Watchlist row', exact: true }).click();
  const content = editor(page).getByRole('group', { name: 'Watchlist row', exact: true });
  await expect(content.getByRole('searchbox')).toHaveCount(0);
  await expect(content.getByRole('button', { name: 'Add collection tabs' })).toHaveCount(0);
  await expect(preview(page).locator('.tvl-home-row-card')).toHaveCount(2);
  await content.getByLabel('Row title', { exact: true }).fill('Watch next');
  await editor(page).getByRole('button', { name: 'Item order', exact: true }).click();
  await editor(page).getByRole('button', { name: 'Move The North Line earlier', exact: true }).click();
  await expect(preview(page).locator('.tvl-home-row-card').first()).toHaveAttribute('data-item-id', 'series-north');
  await editor(page).getByRole('button', { name: 'Home position', exact: true }).click();
  await editor(page).getByRole('button', { name: 'Move to top', exact: true }).click();
  await editor(page).getByRole('button', { name: 'Save rows', exact: true }).click();
  await expect(editor(page)).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem(`jellyfin-cinema.home-collections.v1:${encodeURIComponent(location.origin)}:demo`)!).rows[0]);
  expect(saved).toMatchObject({ kind: 'watchlist', collectionIds: [], title: 'Watch next', placement: 'start', itemSort: 'custom', itemOrder: ['series-north', 'movie-tide'] });
  expect(saved.tabs).toBeUndefined();
  await goHome(page);
  await expect(homeRow(page).locator('.tvl-home-row-card')).toHaveCount(2);
  await expect(homeRow(page).locator('.tvl-home-row-card').first()).toHaveAttribute('data-item-id', 'series-north');
  await homeRow(page).getByRole('button', { name: 'The North Line', exact: true }).click();
  await expect(page).toHaveURL(/#\/details\?id=series-north/);
  await page.keyboard.press('Escape');
  await expect(homeRow(page).getByRole('button', { name: 'The North Line', exact: true })).toBeFocused();
  await openEditor(page); await editor(page).getByRole('button', { name: 'Remove row', exact: true }).click();
  await editor(page).getByRole('button', { name: 'Save rows', exact: true }).click(); await goHome(page);
  await expect(homeRow(page)).toHaveCount(0);
});

test('empty and failed Watchlists have recoverable previews and ignore changes belonging to another account', async ({ page }) => {
  await setup(page, true);
  await page.evaluate(() => { (window as any).__watchlistFixture.fail = true; });
  await openEditor(page);
  await expect(preview(page)).toContainText('Your Watchlist could not be loaded.');
  await page.evaluate(() => { const fixture = (window as any).__watchlistFixture; fixture.fail = false; fixture.items = []; });
  await preview(page).getByRole('button', { name: 'Retry preview', exact: true }).click();
  await expect(preview(page)).toContainText('Your Watchlist is empty.');
  await page.evaluate(() => { (window as any).__watchlistFixture.items = [{ Id: 'movie-tide', Name: 'After the Tide', Type: 'Movie' }]; });
  const requests = await page.evaluate(() => (window as any).__watchlistFixture.requests);
  await notify(page, 'another-user');
  expect(await page.evaluate(() => (window as any).__watchlistFixture.requests)).toBe(requests);
  await expect(preview(page)).toContainText('Your Watchlist is empty.');
  await notify(page); await expect(preview(page).locator('.tvl-home-row-card')).toHaveCount(1);
  await editor(page).getByRole('button', { name: 'Save rows', exact: true }).click(); await goHome(page);
  await expect(homeRow(page).locator('.tvl-home-row-card')).toHaveCount(1);
  await page.evaluate(() => { (window as any).__watchlistFixture.items = []; });
  await notify(page); await expect(homeRow(page)).toHaveCount(0);
});

test('Home hides empty and unavailable Watchlists but keeps the saved row and refreshes it in the background', async ({ page }) => {
  await setup(page, true);
  await page.clock.install();
  await page.evaluate(() => { (window as any).__watchlistFixture.items = []; });
  const before = await page.evaluate(() => (window as any).__watchlistFixture.requests);
  await goHome(page);
  await expect.poll(() => page.evaluate(() => (window as any).__watchlistFixture.requests)).toBeGreaterThan(before);
  await expect(homeRow(page)).toHaveCount(0);
  await expect(page.locator('#homeTab')).not.toContainText('Your Watchlist is empty');
  await page.evaluate(() => { (window as any).__watchlistFixture.fail = true; });
  await notify(page); await expect(homeRow(page)).toHaveCount(0);
  await expect(page.locator('#homeTab')).not.toContainText('Your Watchlist could not be loaded');
  const failed = await page.evaluate(() => (window as any).__watchlistFixture.requests);
  await page.evaluate(() => { const state = (window as any).__watchlistFixture; state.fail = false; state.items = [{ Id: 'series-north', Name: 'The North Line', Type: 'Series' }]; });
  await page.clock.fastForward(60_001);
  await expect.poll(() => page.evaluate(() => (window as any).__watchlistFixture.requests)).toBeGreaterThan(failed);
  await expect(homeRow(page).getByRole('button', { name: 'The North Line', exact: true })).toBeVisible();
  await homeRow(page).getByRole('button', { name: 'The North Line', exact: true }).focus();
  await page.evaluate(() => { (window as any).__watchlistFixture.items = []; });
  await notify(page); await expect(homeRow(page)).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement !== document.body && !!document.activeElement?.getClientRects().length
    && !document.activeElement?.closest('[hidden], .hide'))).toBe(true);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem(`jellyfin-cinema.home-collections.v1:${encodeURIComponent(location.origin)}:demo`)!).rows);
  expect(saved).toHaveLength(1); expect(saved[0].kind).toBe('watchlist');
});

test('Home retrieves all Watchlist pages and lets the remote reach cards past the initial sixty', async ({ page }) => {
  await setup(page, true);
  await page.evaluate(() => { const fixture = (window as any).__watchlistFixture; fixture.items = Array.from({ length: 105 }, (_, index) => ({ Id: `saved-${index}`, Name: `Saved title ${index}`, Type: index % 2 ? 'Series' : 'Movie' })); fixture.items[104] = { Id: 'movie-tide', Name: 'After the Tide', Type: 'Movie' }; });
  await goHome(page);
  await expect(homeRow(page).locator('.tvl-home-row-card')).toHaveCount(60);
  expect(await page.evaluate(() => (window as any).__watchlistFixture.pages)).toContain(100);
  const more = homeRow(page).getByRole('button', { name: 'Show more Watchlist', exact: true });
  await more.focus(); await page.keyboard.press('Enter');
  await expect(homeRow(page).locator('.tvl-home-row-card')).toHaveCount(105);
  await expect(homeRow(page).getByRole('button', { name: 'Saved title 60', exact: true })).toBeFocused();
  await expect(more).toHaveCount(0);
  await page.evaluate(() => {
    const api = window.TvItemLayoutDemo!.api, original = api.getCollectionList;
    api.getCollectionList = async () => {
      const items = await original();
      await new Promise<void>(resolve => { (window as any).__finishHomeCollectionRead = resolve; });
      (window as any).__homeCollectionReadFinished = true; return items;
    };
  });
  await homeRow(page).getByRole('button', { name: 'After the Tide', exact: true }).click();
  await expect(page).toHaveURL(/#\/details\?id=movie-tide/); await page.keyboard.press('Escape');
  await expect(homeRow(page).locator('.tvl-home-row-card')).toHaveCount(105);
  await expect.poll(() => page.evaluate(() => typeof (window as any).__finishHomeCollectionRead)).toBe('function');
  await homeRow(page).evaluate(node => {
    (window as any).__beforeHomeRefresh = node;
    (window as any).__beforeHomeRefreshCard = document.activeElement;
    (window as any).__finishHomeCollectionRead();
  });
  await expect.poll(() => page.evaluate(() => (window as any).__homeCollectionReadFinished)).toBe(true);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  // Unchanged background data must retain the expanded Watchlist and controls.
  expect(await homeRow(page).evaluate(node => node === (window as any).__beforeHomeRefresh && node.isConnected
    && document.activeElement === (window as any).__beforeHomeRefreshCard)).toBe(true);
  await expect(homeRow(page).locator('.tvl-home-row-card')).toHaveCount(105);
  await expect(homeRow(page).getByRole('button', { name: 'After the Tide', exact: true })).toBeFocused();
});

test('returning from details refreshes an existing Home Watchlist after an out-of-view update', async ({ page }) => {
  await setup(page, true); await goHome(page);
  await expect(homeRow(page).locator('.tvl-home-row-card')).toHaveCount(2);
  await homeRow(page).getByRole('button', { name: 'After the Tide', exact: true }).click();
  await expect(page).toHaveURL(/#\/details\?id=movie-tide/);
  await page.evaluate(() => { (window as any).__watchlistFixture.items = [{ Id: 'series-north', Name: 'The North Line', Type: 'Series' }]; });
  await page.keyboard.press('Escape');
  await expect(homeRow(page).locator('.tvl-home-row-card')).toHaveCount(1);
  await expect(homeRow(page).locator('.tvl-home-row-card')).toHaveAttribute('data-item-id', 'series-north');
});
