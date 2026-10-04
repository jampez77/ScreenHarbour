import { expect, test, type Locator, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

// Use the actual Jellyfin v12 queued focus handler and 270 ms scroll animation.
// A focused-card assertion alone misses the LG case: the selected card is right,
// but the old native scroll animation subsequently takes it off-screen.
const source = process.env.TVL_JELLYFIN_WEB_SOURCE || '/tmp/tvl-jellyfin-web-12-audit';
const entry = resolve(source, 'src/components/scrollManager.js');
const sourceUrl = 'https://raw.githubusercontent.com/jellyfin/jellyfin-web/0e83c6a724b31f3e9b5a499244331a288c060a4a/src/components/scrollManager.js';
let native = '';
test.beforeAll(async () => {
  const sourceText = existsSync(entry) ? readFileSync(entry, 'utf8') : await (async () => {
    const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Cannot load audited Jellyfin scrollManager (${response.status})`);
    return response.text();
  })();
  expect(createHash('sha256').update(sourceText).digest('hex')).toBe('c89e5d68b4f68883d982549e39adcf4c4c735b8f24f641fd370a2e1f91b175a9');
  // The real animation starts its 270ms clock at its first RAF, not when focus
  // is restored. Delay only that first frame on demand to model a busy TV while
  // retaining Jellyfin's actual scrolling and elapsed-time animation logic.
  const firstFrame = '    scrollTimer = requestAnimationFrame(scrollAnim);\n}';
  expect(sourceText.split(firstFrame)).toHaveLength(2);
  const instrumented = sourceText.replace(firstFrame, `    scrollTimer = requestAnimationFrame(timestamp => {
        if (!window.__delayNativeScroll) { scrollAnim(timestamp); return; }
        window.__delayNativeScroll = false;
        const pending = scrollTimer;
        setTimeout(() => {
            if (scrollTimer === pending) scrollTimer = requestAnimationFrame(scrollAnim);
        }, 400);
    });\n}`);
  native = (await build({ stdin: { contents: instrumented, resolveDir: source }, bundle: true,
    format: 'iife', target: 'chrome79', write: false, logLevel: 'silent', plugins: [{ name: 'native-scroll-adapters', setup(build) {
      build.onResolve({ filter: /.*/ }, args => ({ path: args.path, namespace: 'fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'js', contents: args.path === '../utils/dom'
        ? 'export default {addEventListener:(node,event,fn,options)=>node.addEventListener(event,fn,options)};'
        : args.path === 'scripts/settings/appSettings' ? 'export default {enableSmoothScroll:()=>true};' : 'export default {tv:true};' }));
    } }] })).outputFiles[0].text;
});

type Expansion = 'none' | 'large' | 'fullscreen';
type Scrolling = 'document' | 'nested';
const row = (page: Page, id = 'immersive') => page.locator(`#homeTab [data-home-row="${id}"]`);
const cards = (page: Page, id = 'immersive') => row(page, id).locator('.tvl-home-row-card');
const selected = (page: Page, id = 'immersive') => row(page, id).locator('.tvl-home-row-card[data-item-id="return-film-13"]');

async function fixture(page: Page, expansion: Expansion, scrolling: Scrolling, legacyFocus = false) {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript({ content: native });
  await page.addInitScript(({ legacyFocus }) => {
    const focus = HTMLElement.prototype.focus;
    (window as any).__itemReturn = { queueNative: false, queuedNative: 0, hold: false, pending: [] };
    HTMLElement.prototype.focus = function (options?: FocusOptions) {
      const state = (window as any).__itemReturn;
      if (state.queueNative && location.hash === '#/home' && this.matches('.tvl-home-row-card')) {
        state.queueNative = false;
        const first = document.querySelector<HTMLElement>('#homeTab [aria-label="My Media"] button')!;
        // Native viewManager restores/falls back to a cached native control
        // before Home restores the custom card. Its queued scroll callback
        // still runs after focus has already moved back to the correct card.
        focus.call(first, { preventScroll: true });
        state.queuedNative++;
      }
      if (legacyFocus) focus.call(this); else focus.call(this, options);
    };
  }, { legacyFocus });
  const base = { kind: 'items', collectionIds: ['collection-coast'], ranked: true, shuffle: true,
    placement: 'end', itemSort: 'collection', itemOrder: [] };
  const settings = { version: 1, rows: [
    { ...base, id: 'before', title: 'Other films' },
    { ...base, id: 'seasons', kind: 'seasonal', title: '', collectionIds: [], children: [
      { ...base, id: 'immersive', title: 'Spooky Season', season: { start: '01-01', end: '12-31' },
        tabs: [{ id: 'movies', label: 'Movies', collectionId: 'collection-coast', itemSort: 'collection', itemOrder: [] },
          { id: 'shows', label: 'Shows', collectionId: 'collection-wilderness', itemSort: 'collection', itemOrder: [] }],
        appearance: { theme: 'halloween', background: expansion === 'none' ? 'static' : 'parallax', backgroundStyle: 'nightmare', frame: true,
          frameStyle: 'nightmare', reveal: expansion === 'none' ? 'none' : 'doors', coverStyle: 'nightmare', expansion } }
    ] },
    { ...base, id: 'after', title: 'More films' }
  ] };
  await page.route('**/dist/demo.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\n(()=>{
      const api=window.TvItemLayoutDemo.api,members=api.getCollectionItems,getItem=api.getItem,image=api.image;
      const state=window.__itemReturn;Math.random=()=>.01;
      api.homeCollections={isCurrent:()=>true,load:async()=>({Revision:'item-return',Settings:${JSON.stringify(settings)}}),save:async()=>{throw Error('Unexpected write')}};
      const film=async id=>({...await getItem('movie-tide'),Id:id,Name:'Return film '+(Number(id.slice(12))+1)});
      api.getCollectionItems=async id=>{
        if(!['collection-coast','collection-wilderness'].includes(id))return members(id);
        if(state.hold)await new Promise(resolve=>state.pending.push(resolve));
        return Promise.all(Array.from({length:30},(_,i)=>film('return-film-'+i)));
      };
      api.getItem=async id=>id.startsWith('return-film-')?film(id):getItem(id);
      api.image=(item,kind)=>image(item.Id.startsWith('return-film-')?{...item,Id:'movie-tide'}:item,kind);
    })();` });
  });
  await page.goto('/?featured=0&layout=tv#/home');
  await expect(cards(page)).toHaveCount(30);
  await expect(page.locator('#homeTab')).not.toHaveClass(/tvl-home-initial-loading/);
  await page.addStyleTag({ content: scrolling === 'document'
    ? 'html { scroll-behavior:smooth !important; }'
    : `html,body { overflow:hidden;height:100%; }
       .demo-native-home-page { position:fixed;inset:0;margin:0;height:100vh;box-sizing:border-box;overflow-y:auto;scroll-behavior:smooth !important; }` });
  await page.evaluate(() => document.fonts.ready);
  await row(page).getByRole('tab', { name: 'Shows', exact: true }).click();
  await expect(cards(page)).toHaveCount(30);
  await selected(page).focus();
  await page.waitForTimeout(650);
  await assertPosition(page, selected(page), expansion);
}

async function assertPosition(page: Page, card: Locator, expansion: Expansion) {
  await expect(card).toBeFocused();
  const geometry = await card.evaluate(node => ({
    card: node.getBoundingClientRect().toJSON(), row: node.closest('[data-home-row]')!.getBoundingClientRect().toJSON(),
    header: document.querySelector('.skinHeader:not(.osdHeader)')?.getBoundingClientRect().toJSON(), scroll: document.scrollingElement!.scrollTop
  }));
  await expect.poll(() => card.evaluate((node, expansion) => {
    const card = node.getBoundingClientRect();
    const strip = node.closest('.tvl-home-row-cards')!.getBoundingClientRect();
    const scene = node.closest('[data-home-row]')!.getBoundingClientRect();
    const header = document.querySelector('.skinHeader:not(.osdHeader)')?.getBoundingClientRect();
    const clearance = Math.max(80, header && header.bottom < innerHeight / 2 ? header.bottom + 12 : 0);
    return { horizontal: card.left >= strip.left - 2 && card.right <= strip.right + 2,
      vertical: card.top >= clearance - 2 && card.bottom <= innerHeight + 2,
      aligned: expansion !== 'fullscreen' || Math.abs(scene.top - clearance) < 2 };
  }, expansion), { message: JSON.stringify(geometry) }).toEqual({ horizontal: true, vertical: true, aligned: true });
  await expect(page.getByRole('status', { name: 'Loading Home', exact: true })).toHaveCount(0);
}

async function leave(page: Page) {
  const order = await cards(page).evaluateAll(nodes => nodes.map(node => (node as HTMLElement).dataset.itemId));
  await page.evaluate(() => { (window as any).__itemReturn.hold = true; });
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Return film 14 details', exact: true })).toBeVisible();
  await page.evaluate(() => { (window as any).__itemReturn.queueNative = true; });
  return order;
}

for (const expansion of ['none', 'large', 'fullscreen'] as const) for (const scrolling of ['document', 'nested'] as const) {
  test(`Back restores the visible exact tab item after queued native scrolling: ${expansion}, ${scrolling}`, async ({ page }) => {
    await fixture(page, expansion, scrolling);
    const before = await leave(page);
    await page.goBack();
    await expect(selected(page)).toBeFocused();
    await expect.poll(() => page.evaluate(() => (window as any).__itemReturn.queuedNative)).toBe(1);
    // Wait past the real native 270 ms RAF animation, not just initial focus.
    await page.waitForTimeout(650);
    await assertPosition(page, selected(page), expansion);
    await expect(row(page).getByRole('tab', { name: 'Shows', exact: true })).toHaveAttribute('aria-selected', 'true');
    expect(await cards(page).evaluateAll(nodes => nodes.map(node => (node as HTMLElement).dataset.itemId))).toEqual(before);
    await expect(selected(page, 'before')).not.toBeFocused();
  });
}

test('Back preserves the exact viewport when the native scroll animation starts after a busy TV frame', async ({ page }) => {
  await fixture(page, 'none', 'nested');
  const snapshot = () => selected(page).evaluate(node => ({
    top: node.getBoundingClientRect().top, left: node.getBoundingClientRect().left,
    scroll: document.querySelector('.demo-native-home-page')!.scrollTop
  }));
  const before = await snapshot();
  await leave(page);
  await page.evaluate(() => { (window as any).__delayNativeScroll = true; });
  await page.goBack();
  await expect(selected(page)).toBeFocused();
  await expect.poll(() => page.evaluate(() => (window as any).__itemReturn.queuedNative)).toBe(1);
  await page.waitForTimeout(1000);
  const after = await snapshot();
  expect(Math.abs(after.top - before.top), JSON.stringify({ before, after })).toBeLessThan(2);
  expect(Math.abs(after.left - before.left), JSON.stringify({ before, after })).toBeLessThan(2);
  expect(Math.abs(after.scroll - before.scroll), JSON.stringify({ before, after })).toBeLessThan(2);
});

for (const scrolling of ['document', 'nested'] as const) test(`repeated fullscreen Back remains visible without preventScroll support in ${scrolling}`, async ({ page }) => {
  await fixture(page, 'fullscreen', scrolling, true);
  for (let visit = 1; visit <= 2; visit++) {
    await leave(page); await page.goBack();
    await expect(selected(page)).toBeFocused();
    await page.waitForTimeout(650);
    await assertPosition(page, selected(page), 'fullscreen');
    expect(await page.evaluate(() => (window as any).__itemReturn.queuedNative)).toBe(visit);
  }
});

test('a fresh remote selection wins over the pending item-return scroll correction', async ({ page }) => {
  await fixture(page, 'fullscreen', 'document');
  await leave(page); await page.goBack();
  await expect(selected(page)).toBeFocused();
  await page.keyboard.press('ArrowRight');
  const nextId = await page.evaluate(() => (document.activeElement as HTMLElement).dataset.focusId);
  expect(nextId).not.toBe(await selected(page).getAttribute('data-focus-id'));
  // Keep the actual selected node: the same movie also exists in other rows.
  await page.evaluate(() => { (window as any).__itemReturn.userTarget = document.activeElement; });
  await page.waitForTimeout(650);
  expect(await page.evaluate(() => document.activeElement === (window as any).__itemReturn.userTarget)).toBe(true);
  await assertPosition(page, page.locator(`#homeTab [data-focus-id="${nextId}"]`), 'fullscreen');
});

test('deferred native Home rendering restores the item only when its row is revealed', async ({ page }) => {
  await fixture(page, 'fullscreen', 'nested');
  await leave(page);
  await page.evaluate(() => {
    const state = (window as any).__itemReturn;
    const host = document.querySelector('#homeTab')!;
    state.nativeRows = Array.from(host.querySelectorAll<HTMLElement>('.verticalSection')).filter(node => !node.matches('.tvl-home-collection-row,.tvl-home-provider-row'));
    state.nativeRows.forEach((node: HTMLElement) => { node.hidden = true; });
    state.nativeBusy = host.querySelector('.sections .itemsContainer');
    state.nativeBusy.setAttribute('aria-busy', 'true');
  });
  await page.goBack();
  await expect(row(page)).toBeHidden();
  await page.evaluate(() => {
    const state = (window as any).__itemReturn;
    // Complete the async native page before viewManager's focus/viewshow step.
    state.nativeRows.forEach((node: HTMLElement) => { node.hidden = false; });
    state.nativeBusy.removeAttribute('aria-busy');
    const home = document.querySelector<HTMLElement>('#indexPage')!;
    home.querySelector<HTMLElement>('[aria-label="My Media"] button')!.focus({ preventScroll: true });
    home.dispatchEvent(new CustomEvent('viewshow', { bubbles: true }));
  });
  await expect(selected(page)).toBeFocused();
  await page.waitForTimeout(650);
  await assertPosition(page, selected(page), 'fullscreen');
});

test('a wheel scroll after Back is not undone by the saved-position settlement', async ({ page }) => {
  await fixture(page, 'fullscreen', 'document');
  await leave(page);
  // Isolate user-wheel priority from the competing native animation covered
  // above: the pending Home settlement alone must not undo the new scroll.
  await page.evaluate(() => { (window as any).__itemReturn.queueNative = false; });
  await page.goBack(); await expect(selected(page)).toBeFocused();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const before = await page.evaluate(() => document.scrollingElement!.scrollTop);
  await page.mouse.move(640, 500);
  await page.mouse.wheel(0, 100);
  await expect.poll(() => page.evaluate(() => document.scrollingElement!.scrollTop)).toBeGreaterThan(before + 20);
  const afterWheel = await page.evaluate(() => document.scrollingElement!.scrollTop);
  await page.waitForTimeout(650);
  expect(Math.abs(await page.evaluate(() => document.scrollingElement!.scrollTop) - afterWheel)).toBeLessThan(2);
  await expect(selected(page)).toBeFocused();
});
