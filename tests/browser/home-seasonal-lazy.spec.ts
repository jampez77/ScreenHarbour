import { expect, test, type Page } from '@playwright/test';

const seasonalRow = (page: Page) => page.locator('#homeTab [data-home-row="lazy-season"]');
const backdrop = (page: Page) => seasonalRow(page).locator('.tvl-seasonal-scene');
type ObserverMode = 'real' | 'held' | 'missing' | 'broken';

async function fixture(page: Page, mode: ObserverMode = 'real', layout = 'tv', holdNative = false) {
  const settings = { version: 1, rows: [{ id: 'seasonal-group', kind: 'seasonal', title: '', collectionIds: [], ranked: false,
    placement: 'end', itemSort: 'collection', itemOrder: [], children: [{ id: 'lazy-season', kind: 'items', title: 'Scenery test',
      collectionIds: ['collection-coast'], ranked: false, placement: 'end', itemSort: 'collection', itemOrder: [],
      season: { start: '01-01', end: '12-31' }, appearance: { theme: 'halloween', background: 'static', backgroundStyle: 'photoreal',
        expansion: 'none', frame: false, reveal: 'none', frameStyle: 'classic', coverStyle: 'classic' } }] }] };
  const requests: string[] = [], errors: string[] = [];
  page.on('request', request => { if (/\/assets\/seasonal\/halloween-photoreal(?:-tv)?\.webp/.test(request.url())) requests.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ mode, settings, holdNative }) => {
    localStorage.setItem(`jellyfin-cinema.home-collections.v1:${encodeURIComponent(location.origin)}:demo`, JSON.stringify(settings));
    if (holdNative) {
      (window as any).__preparedSeasonalRows = [];
      (window as any).__preparedSeasonalResizeListeners = [];
      let preparing: Element | undefined;
      const add = window.addEventListener;
      window.addEventListener = function (type, listener, options) {
        if (type === 'resize' && preparing && !preparing.isConnected) (window as any).__preparedSeasonalResizeListeners.push(listener);
        return add.call(this, type, listener, options);
      } as typeof window.addEventListener;
      const prepend = Element.prototype.prepend;
      Element.prototype.prepend = function (...nodes) {
        if (nodes.some(node => node instanceof Element && node.classList.contains('tvl-seasonal-backdrop'))) {
          (window as any).__preparedSeasonalRows.push(this);
          preparing = this;
          queueMicrotask(() => { preparing = undefined; });
        }
        prepend.apply(this, nodes);
      };
    }
    if (mode === 'missing') (window as any).IntersectionObserver = undefined;
    if (mode === 'broken') (window as any).IntersectionObserver = class { constructor() { throw new Error('Observer unavailable'); } };
    if (mode === 'held') {
      (window as any).__sceneryObservers = [];
      (window as any).IntersectionObserver = class {
        entry: any;
        constructor(callback: IntersectionObserverCallback) {
          this.entry = { callback, target: null, disconnected: false };
          (window as any).__sceneryObservers.push(this.entry);
        }
        observe(target: Element) { this.entry.target = target; }
        disconnect() { this.entry.disconnected = true; }
      };
    }
  }, { mode, settings, holdNative });
  await page.route('**/dist/demo.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nwindow.TvItemLayoutDemo.api.homeCollections={isCurrent:()=>true,load:async()=>({Revision:'lazy',Settings:${JSON.stringify(settings)}}),save:async()=>{throw new Error('Unexpected write')}};
      ${holdNative ? "const nativeHost=document.querySelector('#homeTab .sections');nativeHost.replaceChildren();nativeHost.classList.remove('homeSectionsContainer');" : ''}` });
  });
  await page.goto(`/?featured=0&layout=${layout}#/home`);
  if (holdNative) await expect.poll(() => page.evaluate(() => (window as any).__preparedSeasonalRows.length)).toBeGreaterThan(0);
  else {
    await expect(seasonalRow(page).locator('.tvl-home-row-card')).toHaveCount(2);
    await expect(page.locator('#homeTab')).not.toHaveClass(/tvl-home-initial-loading/);
  }
  return { requests, errors };
}

test('offscreen scenery stays unrequested until near the viewport without changing row geometry', async ({ page }) => {
  const state = await fixture(page);
  const row = seasonalRow(page);
  const before = await row.boundingBox();
  expect(before!.y).toBeGreaterThan(1200);
  await expect(backdrop(page)).toHaveCSS('background-image', 'none');
  expect(state.requests).toEqual([]);
  // Stop below the visible edge, inside the prefetch margin. The background is
  // ready before the user reaches this row, without holding up the Home items.
  await row.evaluate(node => window.scrollBy(0, node.getBoundingClientRect().top - window.innerHeight - 150));
  await expect.poll(() => state.requests.length).toBe(1);
  expect((await row.boundingBox())!.y).toBeGreaterThan(900);
  await expect(backdrop(page)).not.toHaveCSS('background-image', 'none');
  const after = await row.boundingBox();
  expect(after!.width).toBe(before!.width); expect(after!.height).toBe(before!.height);
  await row.scrollIntoViewIfNeeded();
  await page.locator('.skinHeader .emby-tab-button[data-index="0"]').focus();
  await row.scrollIntoViewIfNeeded();
  expect(state.requests).toHaveLength(1);
  expect(state.errors).toEqual([]);
});

test('direct TV focus loads scenery immediately even before any intersection callback', async ({ page }) => {
  const state = await fixture(page, 'held');
  await expect(backdrop(page)).toHaveCSS('background-image', 'none');
  const loaded = await seasonalRow(page).locator('.tvl-home-row-card').first().evaluate(node => {
    node.focus({ preventScroll: true });
    return (node.closest('.tvl-seasonal-row')!.querySelector('.tvl-seasonal-scene') as HTMLElement).style.backgroundImage;
  });
  expect(loaded).toContain('halloween-photoreal');
  await expect.poll(() => state.requests.length).toBe(1);
  expect(await page.evaluate(() => (window as any).__sceneryObservers.every((observer: any) => observer.disconnected))).toBe(true);
  expect(state.errors).toEqual([]);
});

for (const mode of ['missing', 'broken'] as const) test(`scenery remains available when IntersectionObserver is ${mode}`, async ({ page }) => {
  const state = await fixture(page, mode);
  await expect(backdrop(page)).not.toHaveCSS('background-image', 'none');
  await expect.poll(() => state.requests.length).toBe(1);
  expect(state.errors).toEqual([]);
});

test('leaving Home disconnects pending scenery and ignores a queued callback', async ({ page }) => {
  const state = await fixture(page, 'held');
  await expect(backdrop(page)).toHaveCSS('background-image', 'none');
  await page.evaluate(() => { location.hash = '/list?parentId=library-collections'; });
  await expect(page.getByRole('dialog', { name: 'Collections', exact: true })).toBeVisible();
  const result = await page.evaluate(() => (window as any).__sceneryObservers.map((observer: any) => {
    observer.callback([{ target: observer.target, isIntersecting: true, intersectionRatio: 1 }]);
    return { disconnected: observer.disconnected, image: observer.target.querySelector('.tvl-seasonal-scene').style.backgroundImage };
  }));
  expect(result.length).toBeGreaterThan(0);
  expect(result.every((entry: any) => entry.disconnected && !entry.image)).toBe(true);
  expect(state.requests).toEqual([]);
  expect(state.errors).toEqual([]);
});

test('leaving Home before native rows are ready never registers global listeners or observers for abandoned prepared rows', async ({ page }) => {
  const state = await fixture(page, 'held', 'tv', true);
  await expect(seasonalRow(page)).toHaveCount(0);
  const prepared = await page.evaluate(() => (window as any).__preparedSeasonalRows.map((row: HTMLElement) => ({
    connected: row.isConnected, cards: row.querySelectorAll('.tvl-home-row-card').length,
    image: (row.querySelector('.tvl-seasonal-scene') as HTMLElement).style.backgroundImage,
  })));
  expect(prepared.every((row: any) => !row.connected && row.cards === 2 && !row.image)).toBe(true);
  expect(await page.evaluate(() => (window as any).__sceneryObservers.length)).toBe(0);
  expect(await page.evaluate(() => (window as any).__preparedSeasonalResizeListeners.length)).toBe(0);
  await page.evaluate(() => { location.hash = '/list?parentId=library-collections'; });
  await expect(page.getByRole('dialog', { name: 'Collections', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__sceneryObservers.length)).toBe(0);
  expect(await page.evaluate(() => (window as any).__preparedSeasonalResizeListeners.length)).toBe(0);
  expect(state.requests).toEqual([]);
  expect(state.errors).toEqual([]);
});

test('the seasonal editor preview loads without waiting for Home visibility', async ({ page }) => {
  const state = await fixture(page, 'held', 'desktop');
  await expect(backdrop(page)).toHaveCSS('background-image', 'none');
  await page.evaluate(() => { location.hash = '/list?parentId=library-collections'; });
  await page.getByRole('button', { name: 'Customize Home rows', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Customize Home rows', exact: true });
  await editor.getByRole('button', { name: 'Edit Scenery test', exact: true }).click();
  await expect(editor.locator('.tvl-home-preview .tvl-seasonal-scene')).not.toHaveCSS('background-image', 'none');
  await expect.poll(() => state.requests.length).toBe(1);
  expect(state.errors).toEqual([]);
});
