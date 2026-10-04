import { expect, test, type Page } from '@playwright/test';

const settings = { version: 1, rows: [{ id: 'platform', kind: 'items', title: 'Trending', collectionIds: ['collection-coast'], ranked: true, placement: 'start', tabs: [
  { id: 'movies', label: 'Movies', collectionId: 'collection-coast', itemSort: 'collection', itemOrder: [] },
  { id: 'shows', label: 'Shows', collectionId: 'collection-wilderness', itemSort: 'collection', itemOrder: [] }
] }] };
const row = (page: Page) => page.locator('#homeTab [data-home-row="platform"]');
const ids = (page: Page) => row(page).locator('.tvl-home-row-card').evaluateAll(nodes => nodes.map(node => (node as HTMLElement).dataset.itemId));
async function setup(page: Page) {
  await page.clock.install();
  await page.route('**/dist/demo.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\n(() => {
      const api = window.TvItemLayoutDemo.api;
      const state = window.__members = { settings: ${JSON.stringify(settings)}, current: true, calls: 0, completed: 0, fail: false, hold: false,
        ids: ['movie-tide', 'movie-blue'] };
      const original = api.getCollectionItems;
      api.homeCollections = { isCurrent: () => state.current,
        load: async () => ({Revision: 'unchanged', Settings: state.settings}), save: async () => {throw Error('unexpected write');} };
      api.getCollectionItems = async id => {
        state.calls++;
        try {
        if (state.fail) throw Error('offline');
        const items = id === 'collection-coast' ? await Promise.all(state.ids.map(id => api.getItem(id))) : await original(id);
        if (state.hold) { state.hold = false; await new Promise(resolve => state.finish = resolve); }
        return structuredClone(items);
        } finally { state.completed++; }
      };
    })();` });
  });
  await page.goto('/?featured=0#/home');
  await expect.poll(() => ids(page)).toEqual(['movie-tide', 'movie-blue']);
}
const tick = async (page: Page) => {
  await page.clock.fastForward(60_001);
  // The poll starts demo item/catalogue reads with 90 ms timers. Advance
  // those new timers too: a jump alone can strand their fake deadlines while
  // the next assertion waits on real time under parallel browser load.
  await page.clock.runFor(300);
};
const state = (page: Page, changes: Record<string, unknown>) => page.evaluate(changes => Object.assign((window as any).__members, changes), changes);
const settled = (page: Page) => expect.poll(() => page.evaluate(() => (window as any).__members.calls === (window as any).__members.completed)).toBe(true);

test('unchanged settings still refresh collection membership and rank without churning unchanged rows or losing focus', async ({ page }) => {
  await setup(page);
  const blue = row(page).locator('[data-item-id="movie-blue"]'); await blue.focus();
  await blue.evaluate(node => { (window as any).__originalCard = node; });
  const calls = await page.evaluate(() => (window as any).__members.calls);
  await tick(page);
  await expect.poll(() => page.evaluate(() => (window as any).__members.calls)).toBeGreaterThan(calls);
  await settled(page);
  expect(await blue.evaluate(node => node === (window as any).__originalCard)).toBe(true);
  await expect(blue).toBeFocused();
  await state(page, { ids: ['movie-higher', 'movie-blue', 'movie-tide'] }); await tick(page);
  await expect.poll(() => ids(page)).toEqual(['movie-higher', 'movie-blue', 'movie-tide']);
  await expect(blue).toBeFocused();
  await expect(row(page).locator('.tvl-home-row-card').first()).toHaveAttribute('aria-label', 'Rank 1: Higher Ground');
  await state(page, { fail: true, ids: [] }); await tick(page);
  await settled(page);
  await expect.poll(() => ids(page)).toEqual(['movie-higher', 'movie-blue', 'movie-tide']);
  await expect(blue).toBeFocused(); await expect(row(page).getByText('could not be loaded', { exact: false })).toHaveCount(0);
  await state(page, { fail: false }); await tick(page);
  await expect(row(page)).toContainText('This collection is empty.');
  await expect(row(page).getByRole('tab', { name: 'Movies', exact: true })).toBeFocused();
});

test('a tab change during refresh wins and stale account responses never repaint Home', async ({ page }) => {
  await setup(page); await state(page, { hold: true, ids: ['movie-higher'] }); await tick(page);
  await expect.poll(() => page.evaluate(() => typeof (window as any).__members.finish)).toBe('function');
  const shows = row(page).getByRole('tab', { name: 'Shows', exact: true }); await shows.click();
  await expect.poll(() => ids(page)).toEqual(['series-north', 'movie-higher', 'movie-wild']);
  await page.evaluate(() => (window as any).__members.finish());
  await expect(shows).toBeFocused(); await expect(shows).toHaveAttribute('aria-selected', 'true');
  await row(page).getByRole('tab', { name: 'Movies', exact: true }).click();
  await expect.poll(() => ids(page)).toEqual(['movie-higher']);
  await state(page, { hold: true, ids: ['movie-tide'] }); await tick(page);
  await state(page, { current: false }); await page.evaluate(() => (window as any).__members.finish());
  // A following focus event provides an event-loop turn after the old response.
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => ids(page)).toEqual(['movie-higher']);
});

test('a failed collection list reload retries changed members automatically on the next unchanged poll', async ({ page }) => {
  await setup(page); await settled(page);
  const blue = row(page).locator('[data-item-id="movie-blue"]'); await blue.focus();
  await page.evaluate(() => {
    const context = window as any, api = context.TvItemLayoutDemo.api, original = api.getCollectionList;
    context.__members.failList = true;
    api.getCollectionList = async () => {
      if (context.__members.failList) { context.__members.failList = false; throw Error('temporary collection catalogue failure'); }
      return original();
    };
  });
  await state(page, { ids: ['movie-higher', 'movie-blue'] }); await tick(page);
  await expect(page.getByText('Your Home rows could not be loaded.', { exact: true })).toBeVisible();
  await expect.poll(() => ids(page)).toEqual(['movie-tide', 'movie-blue']);
  await expect(blue).toBeFocused();
  await settled(page); await tick(page);
  await expect.poll(() => ids(page)).toEqual(['movie-higher', 'movie-blue']);
  await expect(blue).toBeFocused();
  await expect(page.getByText('Your Home rows could not be loaded.', { exact: true })).toHaveCount(0);
});

test('removing the final item from a single-source row moves focus to the next Home row', async ({ page }) => {
  await setup(page); await settled(page);
  await page.evaluate(() => {
    const state = (window as any).__members;
    delete state.settings.rows[0].tabs;
    state.ids = ['movie-tide'];
  });
  await tick(page);
  await expect(row(page).getByRole('tab')).toHaveCount(0);
  await expect.poll(() => ids(page)).toEqual(['movie-tide']);
  await row(page).locator('[data-item-id="movie-tide"]').focus();
  await state(page, { ids: [] }); await tick(page);
  await expect(row(page)).toContainText('This collection is empty.');
  await expect(page.locator('#homeTab [aria-label="My Media"] .focuscontainer-x').locator('button,a[href],[tabindex="0"]').first()).toBeFocused();
});
