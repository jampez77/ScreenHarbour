import { expect, test, type Browser, type Page } from '@playwright/test';
import { openCollectionRowsFromSettings } from './collection-rows-fixture';
import { useDesktopLayout } from './layout-fixture';
import { parseHomeCollections, homeCollectionKey } from '../../src/home-collection-settings';

const original = () => parseHomeCollections({ version: 1, rows: [{ id: 'platform', kind: 'items', title: 'Weekend picks', collectionIds: ['collection-coast'], ranked: true, placement: 'start',
  tabs: [{ id: 'movies', label: 'Movies', collectionId: 'collection-coast', itemSort: 'custom', itemOrder: ['movie-blue', 'movie-tide'] },
    { id: 'shows', label: 'Shows', collectionId: 'collection-wilderness', itemSort: 'collection', itemOrder: [] }] }] });
type Snapshot = { Revision: string | null; Settings: ReturnType<typeof original> | null };
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; };
class RowServer {
  copies = new Map<string, Snapshot>();
  calls: { method: string; scope: string; body?: unknown }[] = [];
  serial = 0; failGet = false; failPut = false;
  holdGet?: ReturnType<typeof deferred>; holdPut?: ReturnType<typeof deferred>;
  snapshot(user = 'family', server = 'cinema-server'): Snapshot { return structuredClone(this.copies.get(`${server}:${user}`) || { Revision: null, Settings: null }); }
  put(settings = original(), user = 'family', server = 'cinema-server') { this.copies.set(`${server}:${user}`, { Revision: String(++this.serial), Settings: structuredClone(settings) }); }
}

// The fixture retains the preview's fictional media and native Home, but removes
// its direct MediaApi adapter. Every settings operation therefore passes through
// the shipped createJellyfinApi + authenticated transport, including status errors.
async function device(browser: Browser, server: RowServer, options: { user?: string; layout?: 'tv' | 'desktop'; legacy?: unknown } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const user = options.user || 'family';
  if (options.legacy) await page.addInitScript(({ user, legacy }) => {
    const key = `jellyfin-cinema.home-collections.v1:${encodeURIComponent(location.origin)}:${user}`;
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(legacy));
  }, { user, legacy: options.legacy });
  await page.route('**/sync-fixture/TvItemLayout/HomeCollections', async route => {
    const request = route.request(), headers = request.headers(), scope = `${headers['x-fixture-server']}:${headers['x-fixture-user']}`;
    const method = request.method(); const body = method === 'PUT' ? request.postDataJSON() : undefined;
    server.calls.push({ method, scope, body });
    const held = method === 'PUT' ? server.holdPut : server.holdGet;
    if (held) { if (method === 'PUT') server.holdPut = undefined; else server.holdGet = undefined; await held.promise; }
    if (method === 'PUT' ? server.failPut : server.failGet) return route.fulfill({ status: 503, json: { error: 'Unavailable' } });
    const previous = server.copies.get(scope) || { Revision: null, Settings: null };
    if (method === 'PUT') {
      if (body.Revision !== previous.Revision) return route.fulfill({ status: 409, json: { error: 'Changed elsewhere' } });
      server.copies.set(scope, { Revision: String(++server.serial), Settings: body.Settings });
    }
    await route.fulfill({ status: 200, json: server.copies.get(scope) || previous });
  });
  await page.route('**/dist/demo.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\n(() => {
      const demo = window.TvItemLayoutDemo.api;
      const state = window.__rowSync = { user: ${JSON.stringify(user)}, server: 'cinema-server' };
      const request = async (url, options = {}) => {
        const response = await fetch(url, { ...options, headers: { 'content-type': 'application/json', 'x-fixture-user': state.user, 'x-fixture-server': state.server } });
        if (!response.ok) throw {status: response.status};
        return response.json();
      };
      window.ApiClient = {
        getCurrentUserId: () => state.user, serverId: () => state.server,
        getUser: async id => ({Id: id, Policy: {IsAdministrator: false}}),
        getItem: (_user, id) => demo.getItem(id),
        getItems: async (_user, query) => {
          const items = query.IncludeItemTypes === 'BoxSet' ? await demo.getCollectionList() : await demo.getCollectionItems(query.ParentId);
          return { Items: items.slice(query.StartIndex || 0, (query.StartIndex || 0) + (query.Limit || 200)), TotalRecordCount: items.length };
        },
        getUrl: path => '/sync-fixture/' + path,
        getJSON: url => url.includes('TvItemLayout/HomeCollections') ? request(url) : Promise.resolve({Id: state.user, Policy: {IsAdministrator: false}}),
        ajax: options => request(options.url, {method: options.type, body: options.data}),
        getImageUrl: () => 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="300"%3E%3Crect width="200" height="300" fill="%23465"/%3E%3C/svg%3E'
      };
      delete window.TvItemLayoutDemo;
      document.body.classList.replace('layout-tv', 'layout-${options.layout || 'tv'}');
    })();` });
  });
  return { page, context };
}
const row = (page: Page) => page.locator('#homeTab [data-home-row="platform"]');
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Customize Home rows', exact: true });
async function openEditor(page: Page) {
  await useDesktopLayout(page);
  await openCollectionRowsFromSettings(page);
  await expect(dialog(page).getByRole('button', { name: 'Save rows', exact: true })).toBeEnabled();
  return dialog(page);
}
async function cached(page: Page, user = 'family') {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null'), homeCollectionKey('cinema-server', user));
}

test('blank TV never overwrites desktop migration; ranked tab settings follow the same account on another device', async ({ browser }) => {
  const server = new RowServer(), tv = await device(browser, server), desktop = await device(browser, server, { layout: 'desktop', legacy: original() });
  try {
    await tv.page.clock.install();
    await tv.page.goto('/?featured=0#/home'); await expect.poll(() => server.calls.length).toBe(1);
    expect(server.calls.every(call => call.method === 'GET')).toBe(true);
    await desktop.page.goto('/?featured=0#/home'); await expect(row(desktop.page)).toBeVisible();
    await expect.poll(() => server.snapshot().Settings).toEqual(original());
    expect(server.calls.filter(call => call.method === 'PUT')).toHaveLength(1);
    await tv.page.reload(); await expect(row(tv.page)).toBeVisible();
    await expect(row(tv.page).locator('.tvl-home-row-card').first()).toHaveAttribute('aria-label', 'Rank 1: A Kind of Blue');
    await expect(row(tv.page).getByRole('tab', { name: 'Movies', exact: true })).toHaveAttribute('aria-selected', 'true');
    await row(tv.page).getByRole('tab', { name: 'Shows', exact: true }).click();
    await expect(row(tv.page).getByRole('tab', { name: 'Shows', exact: true })).toHaveAttribute('aria-selected', 'true');
    expect(await cached(tv.page)).toEqual(original());
    await expect(desktop.page.locator('.layout-tv')).toHaveCount(0);
    // An unchanged poll must retain the active tab and focused native control.
    await row(tv.page).getByRole('tab', { name: 'Shows', exact: true }).focus();
    const reads = server.calls.filter(call => call.method === 'GET').length;
    await tv.page.clock.fastForward(60_001);
    await expect.poll(() => server.calls.filter(call => call.method === 'GET').length).toBeGreaterThan(reads);
    await expect(row(tv.page).getByRole('tab', { name: 'Shows', exact: true })).toBeFocused();
    await expect(row(tv.page).getByRole('tab', { name: 'Shows', exact: true })).toHaveAttribute('aria-selected', 'true');
  } finally { await tv.context.close(); await desktop.context.close(); }
});

test('concurrent editor rejects lost updates, preserves draft and reloads only on the explicit recovery action', async ({ browser }) => {
  const server = new RowServer(); server.put();
  const a = await device(browser, server), b = await device(browser, server);
  try {
    await Promise.all([a.page.goto('/?featured=0#/home'), b.page.goto('/?featured=0#/home')]);
    const first = await openEditor(a.page), second = await openEditor(b.page);
    await first.getByLabel('Row title', { exact: true }).fill('Saved on desktop');
    await second.getByLabel('Row title', { exact: true }).fill('Unsaved on second desktop');
    await first.getByRole('button', { name: 'Save rows', exact: true }).click(); await expect(first).toHaveCount(0);
    await second.getByRole('button', { name: 'Save rows', exact: true }).click();
    await expect(second.getByRole('status')).toContainText('changed on another device');
    await expect(second.getByLabel('Row title', { exact: true })).toHaveValue('Unsaved on second desktop');
    await expect(second.getByRole('button', { name: 'Save rows', exact: true })).toBeDisabled();
    expect((await cached(b.page)).rows[0].title).toBe('Weekend picks');
    await second.getByRole('button', { name: 'Into the Wilderness', exact: true }).click();
    await expect(second.getByRole('button', { name: 'Reload saved rows', exact: true })).toBeVisible();
    await expect(second.getByRole('button', { name: 'Save rows', exact: true })).toBeDisabled();
    await second.getByRole('button', { name: 'Reload saved rows', exact: true }).click();
    await expect(second.getByLabel('Row title', { exact: true })).toHaveValue('Saved on desktop');
    await second.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(server.snapshot().Settings!.rows[0].title).toBe('Saved on desktop');
    expect(server.calls.filter(call => call.method === 'PUT')).toHaveLength(2);
  } finally { await a.context.close(); await b.context.close(); }
});

test('a pending or failed server save never dismisses the draft or updates the local cache; retry confirms success', async ({ browser }) => {
  const server = new RowServer(); server.put(); const deviceA = await device(browser, server), page = deviceA.page;
  try {
    await page.goto('/?featured=0#/home'); const editor = await openEditor(page);
    await editor.getByLabel('Row title', { exact: true }).fill('Still my draft');
    const hold = deferred(); server.holdPut = hold; server.failPut = true;
    await editor.getByRole('button', { name: 'Save rows', exact: true }).click();
    await expect(editor.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape'); await expect(editor).toBeVisible();
    expect((await cached(page)).rows[0].title).toBe('Weekend picks');
    hold.resolve(); await expect(editor.getByRole('status')).toContainText('Your changes have not been saved');
    await expect(editor.getByLabel('Row title', { exact: true })).toHaveValue('Still my draft');
    await expect(editor.getByRole('button', { name: 'Save rows', exact: true })).toBeEnabled();
    expect(server.snapshot().Settings!.rows[0].title).toBe('Weekend picks');
    server.failPut = false; await editor.getByRole('button', { name: 'Save rows', exact: true }).click();
    await expect(editor).toHaveCount(0); expect(server.snapshot().Settings!.rows[0].title).toBe('Still my draft');
    expect((await cached(page)).rows[0].title).toBe('Still my draft');
  } finally { await deviceA.context.close(); }
});

test('deleting every row saves an authoritative empty configuration that old devices cannot migrate over', async ({ browser }) => {
  const server = new RowServer(); server.put(); const active = await device(browser, server), stale = await device(browser, server, { legacy: original() });
  try {
    await active.page.goto('/?featured=0#/home'); const editor = await openEditor(active.page);
    await editor.getByRole('button', { name: 'Remove row', exact: true }).click();
    await editor.getByRole('button', { name: 'Save rows', exact: true }).click(); await expect(editor).toHaveCount(0);
    expect(server.snapshot().Settings).toEqual({ version: 1, rows: [] });
    await stale.page.goto('/?featured=0#/home'); await expect.poll(() => cached(stale.page)).toEqual({ version: 1, rows: [] });
    await expect(row(stale.page)).toHaveCount(0); expect(server.calls.filter(call => call.method === 'PUT')).toHaveLength(1);
  } finally { await active.context.close(); await stale.context.close(); }
});

test('offline Home silently keeps cached rows and refreshes automatically without navigating away', async ({ browser }) => {
  const server = new RowServer(); server.put(); const client = await device(browser, server), page = client.page;
  try {
    await page.clock.install();
    await page.goto('/?featured=0#/home'); await expect.poll(() => cached(page)).toEqual(original());
    server.failGet = true;
    const failed = page.waitForResponse(response => response.url().endsWith('/TvItemLayout/HomeCollections') && response.status() === 503);
    await page.reload(); await failed;
    await expect(row(page)).toBeVisible();
    await expect(page.getByText('Collection rows could not sync.', { exact: false })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Retry row sync', exact: true })).toHaveCount(0);
    const next = original(); next.rows[0].title = 'New server title'; server.put(next); server.failGet = false;
    await page.clock.fastForward(60_001);
    await expect(row(page)).toHaveAttribute('aria-label', 'New server title');
    await expect(page.getByRole('button', { name: 'Retry row sync', exact: true })).toHaveCount(0);
    expect(server.calls.filter(call => call.method === 'PUT')).toHaveLength(0);
  } finally { await client.context.close(); }
});

test('a TV with no cached rows stays quiet after sync failure and loads rows when focus returns', async ({ browser }) => {
  const server = new RowServer(); server.failGet = true;
  const client = await device(browser, server), page = client.page;
  try {
    await page.clock.install();
    const failed = page.waitForResponse(response => response.url().endsWith('/TvItemLayout/HomeCollections') && response.status() === 503);
    await page.goto('/?featured=0#/home'); await failed;
    // Let the rejected request settle before asserting the absence of its UI.
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.locator('#homeTab')).toBeVisible();
    await expect(row(page)).toHaveCount(0);
    await expect(page.getByText('Collection rows could not sync.', { exact: false })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Retry row sync', exact: true })).toHaveCount(0);
    expect(await cached(page)).toBeNull();
    expect(server.calls.filter(call => call.method === 'PUT')).toHaveLength(0);
    server.put(); server.failGet = false;
    await page.clock.fastForward(5_001);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(row(page)).toBeVisible();
    expect(await cached(page)).toEqual(original());
  } finally { await client.context.close(); }
});

test('late saved response from the previous account cannot update its cache or leak rows to the next account', async ({ browser }) => {
  const server = new RowServer(); server.put(); const client = await device(browser, server), page = client.page;
  try {
    await page.goto('/?featured=0#/home'); const editor = await openEditor(page);
    await editor.getByLabel('Row title', { exact: true }).fill('Late old account save');
    const hold = deferred(); server.holdPut = hold;
    await editor.getByRole('button', { name: 'Save rows', exact: true }).click();
    await expect.poll(() => server.calls.filter(call => call.method === 'PUT').length).toBe(1);
    await page.evaluate(() => { (window as any).__rowSync.user = 'kids'; location.hash = '/home'; window.TvItemLayout!.refresh(); });
    await expect(editor).toHaveCount(0); await expect.poll(() => server.calls.some(call => call.scope === 'cinema-server:kids')).toBe(true);
    const completed = page.waitForResponse(response => response.url().endsWith('/TvItemLayout/HomeCollections') && response.request().method() === 'PUT');
    hold.resolve(); await completed;
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(server.snapshot().Settings!.rows[0].title).toBe('Late old account save');
    await expect(row(page)).toHaveCount(0);
    expect((await cached(page)).rows[0].title).toBe('Weekend picks'); expect(await cached(page, 'kids')).toBeNull();
    expect(server.snapshot('kids')).toEqual({ Revision: null, Settings: null });
  } finally { await client.context.close(); }
});
