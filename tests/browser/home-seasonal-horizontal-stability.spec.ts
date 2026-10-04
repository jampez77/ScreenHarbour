import { expect, test, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

// Exercise Jellyfin's own queued focus handler and JavaScript scroll animation.
// CSS scroll-behavior and the browser's focus defaults alone cannot reproduce it.
// Audited Jellyfin web v12.0: 0e83c6a724b31f3e9b5a499244331a288c060a4a.
const source = process.env.TVL_JELLYFIN_WEB_SOURCE || '/tmp/tvl-jellyfin-web-12-audit';
const entry = resolve(source, 'src/components/scrollManager.js');
const sourceUrl = 'https://raw.githubusercontent.com/jellyfin/jellyfin-web/0e83c6a724b31f3e9b5a499244331a288c060a4a/src/components/scrollManager.js';
const sourceSha256 = 'c89e5d68b4f68883d982549e39adcf4c4c735b8f24f641fd370a2e1f91b175a9';
let native = '';
test.beforeAll(async () => {
  let sourceText: string;
  if (existsSync(entry)) sourceText = readFileSync(entry, 'utf8');
  else {
    const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Cannot load audited Jellyfin scrollManager (${response.status}). Set TVL_JELLYFIN_WEB_SOURCE to a local checkout.`);
    sourceText = await response.text();
  }
  expect(createHash('sha256').update(sourceText).digest('hex'), 'Jellyfin scrollManager must match the audited source').toBe(sourceSha256);
  native = (await build({ stdin: { contents: `${sourceText}\nwindow.__nativeScrollManager={isEnabled,scrollTo,scrollToElement};`, resolveDir: source },
    bundle: true, format: 'iife', target: 'chrome79', write: false, logLevel: 'silent', plugins: [{ name: 'native-scroll-adapters', setup(build) {
      build.onResolve({ filter: /.*/ }, args => ({ path: args.path, namespace: 'fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'js', contents: args.path === '../utils/dom'
        ? 'export default {addEventListener:(node,event,fn,options)=>node.addEventListener(event,fn,options)};'
        : args.path === 'scripts/settings/appSettings' ? 'export default {enableSmoothScroll:()=>true};' : 'export default {tv:true};' }));
    } }] })).outputFiles[0].text;
});

type Expansion = 'none' | 'large' | 'fullscreen';
type Scrolling = 'document' | 'nested';
async function fixture(page: Page, expansion: Expansion, scrolling: Scrolling, legacyFocus: boolean, background = 'parallax', second = false) {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript({ content: native });
  if (legacyFocus) await page.addInitScript(() => {
    const focus = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function () { focus.call(this); };
  });
  const base = { kind: 'items', title: 'Other films', collectionIds: ['collection-coast'], ranked: true,
    placement: 'start', itemSort: 'collection', itemOrder: [] };
  const appearance = { theme: 'halloween', background, backgroundStyle: 'nightmare', frame: true,
    frameStyle: 'nightmare', reveal: 'doors', coverStyle: 'nightmare', expansion };
  const settings = { version: 1, rows: [{ ...base, id: 'before' }, { ...base, id: 'seasons', kind: 'seasonal',
    title: '', collectionIds: [], children: [
      { ...base, id: 'immersive', title: 'Spooky Season', season: { start: '01-01', end: '12-31' }, appearance },
      ...(second ? [{ ...base, id: 'second', title: 'Halloween Nights', season: { start: '01-01', end: '12-31' }, appearance }] : [])
    ] }, { ...base, id: 'after' }] };
  await page.route('**/dist/demo.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\n(()=>{
      const api=window.TvItemLayoutDemo.api,members=api.getCollectionItems,image=api.image;
      api.getCollectionItems=async id=>{const found=await members(id);return id==='collection-coast'?Array.from({length:30},(_,i)=>({...found[i%found.length],Id:'motion-film-'+i})):found;};
      api.image=(item,kind)=>image(item.Id.startsWith('motion-film-')?{...item,Id:Number(item.Id.slice(12))%2?'movie-blue':'movie-tide'}:item,kind);
      api.homeCollections={isCurrent:()=>true,load:async()=>({Revision:'horizontal-stability',Settings:${JSON.stringify(settings)}}),save:async()=>{throw new Error('Unexpected write')}};
    })();` });
  });
  await page.goto('/?featured=0&layout=tv#/home', { waitUntil: 'domcontentloaded' });
  const row = page.locator('#homeTab [data-home-row="immersive"]');
  await expect(row.locator('.tvl-home-row-card')).toHaveCount(30);
  await expect(page.locator('#homeTab')).not.toHaveClass(/tvl-home-initial-loading/);
  await page.addStyleTag({ content: scrolling === 'document'
    ? 'html { scroll-behavior:smooth !important; }'
    : `html,body { overflow:hidden;height:100%; }
       .demo-native-home-page { position:fixed;inset:0;margin:0;height:100vh;box-sizing:border-box;overflow-y:auto;scroll-behavior:smooth !important; }` });
  await page.evaluate(() => document.fonts.ready);
  await row.locator('.tvl-home-row-card').first().focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(700);
  return row;
}

for (const expansion of ['none', 'large', 'fullscreen'] as const) for (const scrolling of ['document', 'nested'] as const) {
  for (const legacyFocus of expansion === 'fullscreen' ? [false, true] : [false]) {
    test(`${expansion} row stays vertically still during horizontal navigation in ${scrolling}${legacyFocus ? ' without preventScroll support' : ''}`, async ({ page }) => {
      const row = await fixture(page, expansion, scrolling, legacyFocus);
      const samples = await row.evaluate(async section => {
        const values: number[] = [section.getBoundingClientRect().top];
        const cards = Array.from(section.querySelectorAll('.tvl-home-row-card'));
        const indices: number[] = [];
        for (const key of [...Array(14).fill('ArrowRight'), ...Array(14).fill('ArrowLeft')]) {
          window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
          indices.push(cards.indexOf(document.activeElement!));
          values.push(section.getBoundingClientRect().top);
          for (let frame = 0; frame < 4; frame++) {
            await new Promise(resolve => requestAnimationFrame(resolve));
            values.push(section.getBoundingClientRect().top);
          }
        }
        return { values, indices, range: Math.max(...values) - Math.min(...values) };
      });
      expect(samples.range, JSON.stringify(samples.values)).toBeLessThan(2);
      expect(Math.max(...samples.indices)).toBe(15);
      expect(samples.indices[samples.indices.length - 1]).toBe(1);
    });
  }
}

for (const scrolling of ['document', 'nested'] as const) for (const delay of [0, 50]) test(`rapid entry into full-screen scene in ${scrolling} settles after native scrolling was queued ${delay}ms earlier`, async ({ page }) => {
  const row = await fixture(page, 'fullscreen', scrolling, false);
  await page.evaluate(async delay => {
    document.querySelector<HTMLElement>('#homeTab [data-home-row="before"] .tvl-home-row-card')!.focus({ preventScroll: true });
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
  }, delay);
  await expect(row.locator('.tvl-home-row-card').first()).toBeFocused();
  await page.waitForTimeout(600);
  const settled = await row.evaluate(section => {
    const header = document.querySelector('.skinHeader:not(.osdHeader)')?.getBoundingClientRect();
    const clearance = Math.max(80, header && header.bottom < innerHeight / 2 ? header.bottom + 12 : 0);
    return Math.abs(section.getBoundingClientRect().top - clearance);
  });
  expect(settled).toBeLessThan(2);
});

for (const scrolling of ['document', 'nested'] as const) test(`static full-screen scenery remains still while Jellyfin handles horizontal focus in ${scrolling}`, async ({ page }) => {
  const row = await fixture(page, 'fullscreen', scrolling, false, 'static');
  const range = await row.evaluate(async section => {
    const values: number[] = [section.getBoundingClientRect().top];
    for (let repeat = 0; repeat < 12; repeat++) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: repeat % 2 ? 'ArrowLeft' : 'ArrowRight', bubbles: true, cancelable: true }));
      values.push(section.getBoundingClientRect().top);
      for (let frame = 0; frame < 4; frame++) {
        await new Promise(resolve => requestAnimationFrame(resolve));
        values.push(section.getBoundingClientRect().top);
      }
    }
    return Math.max(...values) - Math.min(...values);
  });
  expect(range).toBeLessThan(2);
});

test('leaving seasonal scenery retains Jellyfin scrolling for an ordinary row', async ({ page }) => {
  const row = await fixture(page, 'fullscreen', 'document', false);
  await page.keyboard.press('ArrowDown');
  const ordinary = page.locator('#homeTab [data-home-row="after"] .tvl-home-row-card').nth(1);
  await expect(ordinary).toBeFocused();
  await page.waitForTimeout(600);
  await expect(row).not.toHaveClass(/tvl-seasonal-expanded/);
  const result = await ordinary.evaluate(node => {
    const rect = node.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, viewport: innerHeight };
  });
  expect(result.top, JSON.stringify(result)).toBeGreaterThanOrEqual(79);
  expect(result.bottom, JSON.stringify(result)).toBeLessThanOrEqual(result.viewport - 15);
});

test('rapid native to seasonal to seasonal navigation settles the final selected scene', async ({ page }) => {
  await fixture(page, 'fullscreen', 'document', false, 'parallax', true);
  await page.evaluate(async () => {
    document.querySelector<HTMLElement>('#homeTab [data-home-row="before"] .tvl-home-row-card')!.focus({ preventScroll: true });
    for (let step = 0; step < 2; step++) {
      await new Promise(resolve => setTimeout(resolve, 50));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    }
  });
  const row = page.locator('#homeTab [data-home-row="second"]');
  await expect(row.locator('.tvl-home-row-card').first()).toBeFocused();
  await page.waitForTimeout(600);
  const distance = await row.evaluate(section => {
    const header = document.querySelector('.skinHeader:not(.osdHeader)')?.getBoundingClientRect();
    const clearance = Math.max(80, header && header.bottom < innerHeight / 2 ? header.bottom + 12 : 0);
    return Math.abs(section.getBoundingClientRect().top - clearance);
  });
  expect(distance).toBeLessThan(2);
});

test('leaving Home while native focus handoff is pending does not reposition the destination page', async ({ page }) => {
  await fixture(page, 'fullscreen', 'document', false);
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('#homeTab [data-home-row="before"] .tvl-home-row-card')!.focus({ preventScroll: true });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    location.hash = '/list?parentId=library-collections';
  });
  const dialog = page.getByRole('dialog', { name: 'Collections', exact: true });
  await expect(dialog).toBeVisible();
  const position = await dialog.evaluate(node => ({ top: node.getBoundingClientRect().top, scroll: node.scrollTop }));
  await page.waitForTimeout(600);
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(node => ({ top: node.getBoundingClientRect().top, scroll: node.scrollTop }))).toEqual(position);
});

test('Left and Right preserve the current vertical position while revealing horizontal posters', async ({ page }) => {
  const row = await fixture(page, 'fullscreen', 'document', false);
  const result = await row.evaluate(async section => {
    const owner = document.scrollingElement!;
    const behaviour = document.documentElement.style.getPropertyValue('scroll-behavior');
    const priority = document.documentElement.style.getPropertyPriority('scroll-behavior');
    document.documentElement.style.setProperty('scroll-behavior', 'auto', 'important');
    owner.scrollTop += 24;
    if (behaviour) document.documentElement.style.setProperty('scroll-behavior', behaviour, priority);
    else document.documentElement.style.removeProperty('scroll-behavior');
    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')!;
    let verticalWrites = 0;
    Object.defineProperty(Element.prototype, 'scrollTop', { ...descriptor, set(this: Element, value: number) {
      if (this === owner || this === document.body) verticalWrites++;
      descriptor.set!.call(this, value);
    } });
    const before = section.getBoundingClientRect().top;
    const values: number[] = [before];
    let maxHorizontalScroll = 0;
    try {
      for (const key of [...Array(10).fill('ArrowRight'), ...Array(10).fill('ArrowLeft')]) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
        values.push(section.getBoundingClientRect().top);
        maxHorizontalScroll = Math.max(maxHorizontalScroll, section.querySelector('.tvl-home-row-cards')!.scrollLeft);
        await new Promise(resolve => requestAnimationFrame(resolve));
        values.push(section.getBoundingClientRect().top);
      }
      return { verticalWrites, maxHorizontalScroll, range: Math.max(...values) - Math.min(...values), selected: document.activeElement?.closest('[data-home-row]')?.getAttribute('data-home-row') };
    } finally { Object.defineProperty(Element.prototype, 'scrollTop', descriptor); }
  });
  expect(result.selected).toBe('immersive');
  expect(result.verticalWrites).toBe(0);
  expect(result.maxHorizontalScroll).toBeGreaterThan(0);
  expect(result.range).toBeLessThan(2);
});
