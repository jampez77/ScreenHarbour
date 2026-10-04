import { expect, test, type Page } from '@playwright/test';
import { parseHomeCollections, type HomeCollectionRow } from '../../src/home-collection-settings';

test.use({ timezoneId: 'Europe/London' });
const base = (id: string, extra: Partial<HomeCollectionRow> = {}): HomeCollectionRow => ({ id, kind: 'items', title: id,
  collectionIds: ['collection-coast'], ranked: false, placement: 'end', itemSort: 'collection', itemOrder: [], ...extra });
const seasonal = (children: HomeCollectionRow[], placement = 'start') => base('seasonal-group', {
  kind: 'seasonal', title: '', collectionIds: [], children, placement
});
const halloween = () => base('Halloween', { season: { start: '10-01', end: '10-31' }, ranked: true });
const christmas = () => base('Christmas', { season: { start: '12-01', end: '01-06' }, collectionIds: ['collection-wilderness'] });
const row = (page: Page, id: string) => page.locator(`#homeTab [data-home-row="${id}"]`);
const ids = (page: Page, id: string) => row(page, id).locator('.tvl-home-row-card').evaluateAll(nodes => nodes.map(node => (node as HTMLElement).dataset.itemId));

async function fixture(page: Page, rows: HomeCollectionRow[], date = '2026-10-15T12:00:00+01:00', count = 0) {
  const settings = parseHomeCollections({ version: 1, rows });
  await page.clock.install({ time: new Date(date) });
  await page.addInitScript(settings => {
    const key = `jellyfin-cinema.home-collections.v1:${encodeURIComponent(location.origin)}:demo`;
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(settings));
  }, settings);
  await page.route('**/dist/demo.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\n(() => {
      const api=window.TvItemLayoutDemo.api, members=api.getCollectionItems, list=api.getCollectionList, item=api.getItem;
      const state=window.__seasonal={settings:${JSON.stringify(settings)},reads:[],lists:0,loads:0,extra:false,count:${count},holdSource:'',pendingMembers:[],
        releaseMembers(){this.holdSource='';this.pendingMembers.splice(0).forEach(resolve=>resolve());}};
      api.homeCollections={isCurrent:()=>true,load:async()=>{state.loads++;return {Revision:'seasonal',Settings:state.settings};},save:async()=>{throw new Error('Unexpected write');}};
      api.getCollectionList=async()=>{state.lists++;return list();};
      api.getCollectionItems=async id=>{
        state.reads.push(id);if(state.holdSource===id)await new Promise(resolve=>state.pendingMembers.push(resolve));
        const found=await members(id),items=state.count && id==='collection-coast'
          ? Array.from({length:state.count},(_,i)=>({...found[i%found.length],Id:'season-film-'+i,Name:'Seasonal film '+(i+1)})):found;
        return state.extra?[...items,{...items[0],Id:'new-film',Name:'A newly added film'}]:items;
      };
      api.getItem=async id=>id.startsWith('season-film-')?{...await item('movie-tide'),Id:id,Name:'Seasonal film '+(Number(id.slice(12))+1)}:item(id);
      Math.random=()=>Number(localStorage.getItem('seasonal-test-random') || '0.01');
    })();` });
  });
  await page.goto('/?featured=0&layout=tv#/home');
  await expect(page.locator('#homeTab')).not.toHaveClass(/tvl-home-initial-loading/);
  await expect.poll(() => page.evaluate(() => (window as any).__seasonal.loads)).toBeGreaterThan(0);
}
async function setDate(page: Page, date: string) {
  await page.clock.setSystemTime(new Date(date));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
}

test('only active named sub-rows render at their shared position, with normal ranks, tabs and TV navigation', async ({ page }) => {
  await fixture(page, [base('Before', { placement: 'start' }), seasonal([
    halloween(), base('Autumn collections', { kind: 'collections', collectionIds: ['collection-coast', 'collection-wilderness'], season: { start: '09-01', end: '11-30' } }),
    base('Autumn tabs', { tabs: [
      {id:'films',label:'Films',collectionId:'collection-coast',itemSort:'title',itemOrder:[]},
      {id:'shows',label:'Shows',collectionId:'collection-wilderness',itemSort:'collection',itemOrder:[]}
    ], season: {start:'10-01',end:'10-31'} }), christmas()
  ]), base('After', { placement: 'start' })]);
  await expect(row(page, 'Halloween').locator('.tvl-home-rank')).toHaveCount(2);
  await expect(row(page, 'Autumn collections').locator('.tvl-home-row-card')).toHaveCount(2);
  await expect(row(page, 'seasonal-group')).toHaveCount(0); await expect(row(page, 'Christmas')).toHaveCount(0);
  expect(await page.locator('#homeTab .tvl-home-collection-row[data-home-row]').evaluateAll(nodes => nodes.map(node => (node as HTMLElement).dataset.homeRow)))
    .toEqual(['Before', 'Halloween', 'Autumn collections', 'Autumn tabs', 'After']);
  const reads = await page.evaluate(() => (window as any).__seasonal.reads as string[]);
  expect(reads).not.toContain('collection-wilderness');
  await row(page, 'Halloween').locator('.tvl-home-row-card').first().focus();
  await page.keyboard.press('ArrowDown'); await expect(row(page, 'Autumn collections').locator('.tvl-home-row-card').first()).toBeFocused();
  await page.keyboard.press('ArrowUp'); await expect(row(page, 'Halloween').locator('.tvl-home-row-card').first()).toBeFocused();
  await row(page, 'Autumn tabs').getByRole('tab', {name:'Shows',exact:true}).click();
  await expect(row(page, 'Autumn tabs').locator('.tvl-home-row-card')).toHaveCount(3);
});

test('out-of-season groups create no row, status or content request and wake correctly across New Year', async ({ page }) => {
  await fixture(page, [seasonal([halloween(), christmas()])], '2026-07-15T12:00:00+01:00');
  await expect(page.locator('#homeTab .tvl-home-collection-row')).toHaveCount(0);
  await expect(page.locator('#homeTab .tvl-home-row-status')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__seasonal.reads)).toEqual([]);
  expect(await page.evaluate(() => (window as any).__seasonal.lists)).toBe(0);
  await setDate(page, '2026-12-01T00:00:00Z'); await expect(row(page, 'Christmas').locator('.tvl-home-row-card')).toHaveCount(3);
  await setDate(page, '2027-01-06T23:59:00Z'); await expect(row(page, 'Christmas')).toBeVisible();
  await setDate(page, '2027-01-07T00:00:00Z'); await expect(page.locator('#homeTab .tvl-home-collection-row')).toHaveCount(0);
  await expect(row(page, 'seasonal-group')).toHaveCount(0);
});

test('season changes automatically at local midnight and expired cached content stays absent on return', async ({ page }) => {
  await fixture(page, [seasonal([halloween(), christmas()])], '2026-10-31T23:58:00Z');
  await expect(row(page, 'Halloween')).toBeVisible();
  await page.clock.fastForward(121_000);
  await expect(row(page, 'Halloween')).toHaveCount(0);
  await page.evaluate(() => { location.hash = '/list?parentId=library-collections'; });
  await expect(page.getByRole('dialog', { name: 'Collections', exact: true })).toBeVisible();
  await page.goBack(); await expect(page.locator('#homeTab')).toBeVisible();
  await expect(page.locator('#homeTab .tvl-home-collection-row')).toHaveCount(0);
});

test('expired seasonal rows disappear immediately while the next season waits for its collection', async ({ page }) => {
  await fixture(page, [seasonal([halloween(), base('November', {
    season: { start: '11-01', end: '11-30' }, collectionIds: ['collection-wilderness']
  })]), base('Always available')], '2026-10-31T23:59:00Z');
  await expect(row(page, 'Halloween').locator('.tvl-home-row-card')).toHaveCount(2);
  await expect(row(page, 'Always available').locator('.tvl-home-row-card')).toHaveCount(2);
  await row(page, 'Halloween').locator('.tvl-home-row-card').first().focus();
  await page.evaluate(() => { (window as any).__seasonal.holdSource = 'collection-wilderness'; });
  await setDate(page, '2026-11-01T00:00:00Z');
  await expect.poll(() => page.evaluate(() => (window as any).__seasonal.pendingMembers.length)).toBeGreaterThan(0);
  await expect(row(page, 'Halloween')).toHaveCount(0);
  await expect(row(page, 'November')).toHaveCount(0);
  await expect(row(page, 'seasonal-group')).toHaveCount(0);
  await expect(row(page, 'Always available')).toBeVisible();
  expect(await page.evaluate(() => document.activeElement !== document.body && document.activeElement?.isConnected)).toBe(true);
  // The old row is gone before the outstanding request can complete; other Home rows remain usable.
  expect(await page.evaluate(() => (window as any).__seasonal.pendingMembers.length)).toBeGreaterThan(0);
  await page.evaluate(() => (window as any).__seasonal.releaseMembers());
  await expect(row(page, 'November').locator('.tvl-home-row-card')).toHaveCount(3);
  await expect(row(page, 'Halloween')).toHaveCount(0);
  await expect(row(page, 'Always available')).toBeVisible();
});

test('shuffle covers collection tiles and child items, refreshes only on a new Home visit, and never changes saved order', async ({ page }) => {
  const collections = base('Shuffled collections', {kind:'collections',collectionIds:['collection-coast','collection-wilderness'],shuffle:true});
  await fixture(page, [collections, base('Fixed'), seasonal([base('Shuffle season', {
    collectionIds:['collection-wilderness'],season:{start:'10-01',end:'10-31'},shuffle:true,ranked:true
  })])]);
  await expect(row(page, 'Shuffle season').locator('.tvl-home-row-card')).toHaveCount(3);
  const original = await page.evaluate(() => localStorage.getItem(`jellyfin-cinema.home-collections.v1:${encodeURIComponent(location.origin)}:demo`));
  const first = await ids(page, 'Shuffle season');
  expect(first).toEqual(['movie-higher','movie-wild','series-north']);
  expect(await ids(page, 'Shuffled collections')).toEqual(['collection-wilderness','collection-coast']);
  expect(await ids(page, 'Fixed')).toEqual(['movie-tide','movie-blue']);
  await page.evaluate(() => { (window as any).__seasonal.extra=true; localStorage.setItem('seasonal-test-random','0.999'); });
  await page.clock.fastForward(60_001);
  await expect(row(page, 'Shuffle season').locator('.tvl-home-row-card')).toHaveCount(4);
  expect((await ids(page, 'Shuffle season')).slice(0,3)).toEqual(first);
  await page.evaluate(() => { location.hash = '/list?parentId=library-collections'; });
  await expect(page.getByRole('dialog', { name: 'Collections', exact: true })).toBeVisible();
  await page.goBack(); await expect(row(page, 'Shuffle season').locator('.tvl-home-row-card')).toHaveCount(4);
  expect(await ids(page, 'Shuffle season')).toEqual(['series-north','movie-higher','movie-wild','new-film']);
  expect(await ids(page, 'Shuffled collections')).toEqual(['collection-coast','collection-wilderness']);
  expect(await page.evaluate(() => localStorage.getItem(`jellyfin-cinema.home-collections.v1:${encodeURIComponent(location.origin)}:demo`))).toBe(original);
});

test('Back keeps the shuffled preview and its last card unchanged, while a fresh visit can reshuffle beyond the first 60', async ({ page }) => {
  await fixture(page, [seasonal([base('Large seasonal collection', {
    season: { start: '10-01', end: '10-31' }, shuffle: true, ranked: true
  })])], '2026-10-15T12:00:00+01:00', 80);
  const cards = row(page, 'Large seasonal collection').locator('.tvl-home-row-card');
  const target = row(page, 'Large seasonal collection').locator('[data-item-id="season-film-60"]');
  await expect(cards).toHaveCount(60);
  const initial = await ids(page, 'Large seasonal collection');
  expect(initial.indexOf('season-film-60')).toBe(59);
  await target.focus(); await target.evaluate(node => node.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Seasonal film 61 details', exact: true })).toBeVisible();
  // Near-one leaves the array in source order, which puts item 60 just beyond the Home preview.
  await page.evaluate(() => localStorage.setItem('seasonal-test-random', '0.999'));
  await page.goBack();
  await expect(cards).toHaveCount(60);
  await expect(target).toBeFocused();
  const returned = await ids(page, 'Large seasonal collection');
  expect(returned).toEqual(initial);
  await expect(target).toHaveAttribute('aria-label', 'Rank 60: Seasonal film 61');
  await expect(row(page, 'Large seasonal collection').getByRole('button', { name: 'View full collection', exact: true })).toBeVisible();
  await expect.poll(() => target.evaluate(node => {
    const card = node.getBoundingClientRect(), strip = node.closest('.tvl-home-row-cards')!.getBoundingClientRect();
    return card.left >= strip.left && card.right <= strip.right;
  })).toBe(true);
  await page.keyboard.press('ArrowLeft'); await expect(cards.nth(58)).toBeFocused();
  await target.focus();
  await page.evaluate(() => { location.hash = '/list?parentId=library-collections'; });
  await expect(page.getByRole('dialog', { name: 'Collections', exact: true })).toBeVisible();
  await page.goBack();
  await expect(target).toBeFocused();
  const fresh = await ids(page, 'Large seasonal collection');
  expect(fresh.slice(0, 59)).toEqual(Array.from({ length: 59 }, (_, index) => `season-film-${index}`));
  expect(fresh[59]).toBe('season-film-60');
});
