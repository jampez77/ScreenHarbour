import { expect, test, type Page } from '@playwright/test';

const row = (page: Page, id = 'immersive') => page.locator(`#homeTab [data-home-row="${id}"]`);
const cards = (page: Page, id = 'immersive') => row(page, id).locator('.tvl-home-row-card');

type Scrolling = 'document' | 'nested';
async function fixture(page: Page, scrolling: Scrolling, title = 'Spooky Season', count = 2, secondExpansion = 'fullscreen') {
  await page.setViewportSize({ width: 1280, height: 720 });
  const base = { kind: 'items', title: 'Other films', collectionIds: ['collection-coast'], ranked: false,
    placement: 'start', itemSort: 'collection', itemOrder: [] };
  const appearance = { theme: 'halloween', background: 'parallax', backgroundStyle: 'nightmare', frame: true,
    frameStyle: 'nightmare', reveal: 'doors', coverStyle: 'nightmare', expansion: 'fullscreen' };
  const settings = { version: 1, rows: [{ ...base, id: 'before' }, { ...base, id: 'seasons', kind: 'seasonal',
    title: '', collectionIds: [], children: [
      { ...base, id: 'immersive', title, season: { start: '01-01', end: '12-31' }, appearance },
      { ...base, id: 'second', title: 'Halloween Nights', season: { start: '01-01', end: '12-31' }, appearance: { ...appearance, expansion: secondExpansion } }
    ] }, { ...base, id: 'after' }] };
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/dist/demo.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\n(()=>{
      const api=window.TvItemLayoutDemo.api;
      if (${count} > 2) {
        const members=api.getCollectionItems,image=api.image;
        api.getCollectionItems=async id=>{const found=await members(id);return id==='collection-coast'?Array.from({length:${count}},(_,i)=>({...found[i%found.length],Id:'motion-film-'+i})):found;};
        api.image=(item,kind)=>image(item.Id.startsWith('motion-film-')?{...item,Id:Number(item.Id.slice(12))%2?'movie-blue':'movie-tide'}:item,kind);
      }
      api.homeCollections={isCurrent:()=>true,load:async()=>({Revision:'settlement',Settings:${JSON.stringify(settings)}}),save:async()=>{throw new Error('Unexpected write')}};
    })();` });
  });
  await page.goto('/?featured=0&layout=tv#/home', { waitUntil: 'domcontentloaded' });
  await expect(cards(page)).toHaveCount(count);
  await expect(page.locator('#homeTab')).not.toHaveClass(/tvl-home-initial-loading/);
  // Native Jellyfin/theme CSS can request smooth scrolling. Assigning scrollTop
  // or passing behavior:auto then starts another animation instead of snapping.
  await page.addStyleTag({ content: scrolling === 'document'
    ? 'html { scroll-behavior:smooth !important; }'
    : `html,body { overflow:hidden;height:100%; }
       .demo-native-home-page { position:fixed;inset:0;margin:0;height:100vh;box-sizing:border-box;overflow-y:auto;scroll-behavior:smooth !important; }` });
  return { errors };
}

async function expectSettled(page: Page, id = 'immersive') {
  await expect(row(page, id)).toHaveClass(/tvl-seasonal-expanded/);
  // A card fitting onscreen alone is insufficient: the entire scene and title
  // must align without the user providing a second Left/Right keypress.
  await expect.poll(() => row(page, id).evaluate(section => {
    const rect = section.getBoundingClientRect();
    const header = document.querySelector('.skinHeader:not(.osdHeader)')?.getBoundingClientRect();
    const clearance = Math.max(80, header && header.bottom < innerHeight / 2 ? header.bottom + 12 : 0);
    return Math.max(Math.abs(rect.top - clearance), Math.abs(rect.bottom - (innerHeight - 16)));
  })).toBeLessThan(2);
  const before = await row(page, id).boundingBox();
  // Catch a queued native smooth scroll undoing an apparently correct frame.
  await page.waitForTimeout(500);
  const after = await row(page, id).boundingBox();
  expect(after!.y).toBeCloseTo(before!.y, 0);
  await expect(cards(page, id).first()).toBeFocused();
  await expect(cards(page, id).first()).toHaveClass(/tvl-seasonal-item-open/);
}

for (const scrolling of ['document', 'nested'] as const) {
  for (const direction of ['above', 'below'] as const) {
    test(`initial full-screen focus settles from ${direction} with ${scrolling} smooth scrolling`, async ({ page }) => {
      const audit = await fixture(page, scrolling);
      const startingRow = direction === 'above' ? 'before' : 'after';
      await cards(page, startingRow).first().focus();
      await page.waitForTimeout(700);
      await cards(page).first().focus();
      await expectSettled(page);
      expect(audit.errors).toEqual([]);
    });
  }

  test(`adjacent full-screen rows settle while the previous scene closes in a ${scrolling} scroller`, async ({ page }) => {
    const audit = await fixture(page, scrolling);
    await cards(page).first().focus();
    // Move again while the first row is still expanding, as a held TV key does.
    await page.waitForTimeout(80);
    await page.keyboard.press('ArrowDown');
    await expect(cards(page, 'second').first()).toBeFocused();
    await expectSettled(page, 'second');
    await page.keyboard.press('ArrowUp');
    await expectSettled(page);
    await expect(row(page, 'second')).not.toHaveClass(/tvl-seasonal-expanded/);
    expect(audit.errors).toEqual([]);
  });
}

test('interrupted expansion retargets visible posters and scenery without a position jump', async ({ page }) => {
  const audit = await fixture(page, 'document');
  await page.evaluate(() => document.fonts.ready);
  await cards(page).first().focus();
  const samples = await page.evaluate(async () => {
    const collect = () => Array.from(document.querySelectorAll<HTMLElement>(
      '#homeTab .tvl-seasonal-row .tvl-home-row-title,#homeTab .tvl-seasonal-row .tvl-home-row-cards,#homeTab .tvl-seasonal-backdrop'
    )).map(node => ({ node, rect: node.getBoundingClientRect() }));
    const results: { key: string; visible: number; largestJump: number; hasMotion: boolean }[] = [];
    for (const key of ['ArrowDown', 'ArrowUp', 'ArrowDown', 'ArrowUp']) {
      await new Promise(resolve => setTimeout(resolve, 70));
      const before = collect();
      window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      const visible = before.filter(({ rect }) => rect.bottom > 0 && rect.top < innerHeight);
      results.push({ key, visible: visible.length, largestJump: Math.max(...visible.map(({ node, rect }) => {
        const next = node.getBoundingClientRect();
        return Math.max(Math.abs(next.top - rect.top), Math.abs(next.height - rect.height));
      })), hasMotion: document.getAnimations().some(animation => animation.playState === 'running') });
    }
    return results;
  });
  expect(samples.every(sample => sample.visible > 0 && sample.hasMotion)).toBe(true);
  for (const sample of samples) expect(sample.largestJump, sample.key).toBeLessThan(2);
  await expectSettled(page);
  await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
  expect(audit.errors).toEqual([]);
});

test('resizing during expansion releases old motion and settles the new viewport', async ({ page }) => {
  const audit = await fixture(page, 'nested');
  await cards(page).first().focus();
  await page.waitForTimeout(60);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expectSettled(page);
  await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
  await page.keyboard.press('ArrowDown');
  await expectSettled(page, 'second');
  expect(audit.errors).toEqual([]);
});

test('leaving Home during expansion cancels the retained visual animations', async ({ page }) => {
  await page.addInitScript(() => {
    const animate = Element.prototype.animate;
    (window as any).__seasonalMotionAudit = [];
    Element.prototype.animate = function (...args: Parameters<typeof animate>) {
      const animation = animate.apply(this, args);
      if (this.closest('#homeTab')) (window as any).__seasonalMotionAudit.push(animation);
      return animation;
    };
  });
  const audit = await fixture(page, 'document');
  await cards(page).first().focus();
  await expect.poll(() => page.evaluate(() => (window as any).__seasonalMotionAudit.length)).toBeGreaterThan(0);
  await page.evaluate(() => { location.hash = '/list?parentId=library-collections'; });
  await expect(page.getByRole('dialog', { name: 'Collections', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).__seasonalMotionAudit.every((animation: Animation) => animation.playState === 'idle'))).toBe(true);
  await page.waitForTimeout(400);
  await expect(page.getByRole('dialog', { name: 'Collections', exact: true })).toBeVisible();
  expect(audit.errors).toEqual([]);
});

test('fullscreen remains navigable if the legacy client has no Web Animations API', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: undefined }); });
  const audit = await fixture(page, 'document');
  await cards(page).first().focus();
  await expectSettled(page);
  await page.keyboard.press('ArrowDown');
  await expectSettled(page, 'second');
  await page.keyboard.press('ArrowUp');
  await expectSettled(page);
  expect(audit.errors).toEqual([]);
});

test('expansion commits its size once while visual layers animate without stretching posters', async ({ page }) => {
  const audit = await fixture(page, 'document');
  await page.evaluate(() => document.fonts.ready);
  const samples = await cards(page).first().evaluate(async first => {
    const section = first.closest<HTMLElement>('.tvl-seasonal-row')!;
    const art = first.querySelector<HTMLElement>('.tvl-home-row-art')!;
    const posterHeight = art.getBoundingClientRect().height;
    first.focus({ preventScroll: true });
    const values: { height: number; paddingTop: string; paddingBottom: string; posterHeight: number; posterTop: number; moving: boolean }[] = [];
    for (let frame = 0; frame < 12; frame++) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      const css = getComputedStyle(section), box = art.getBoundingClientRect();
      values.push({ height: section.getBoundingClientRect().height, paddingTop: css.paddingTop, paddingBottom: css.paddingBottom,
        posterHeight: box.height, posterTop: box.top, moving: document.getAnimations().some(animation => {
          const target = (animation.effect as KeyframeEffect | null)?.target;
          return animation.playState === 'running' && target instanceof Element && target.matches('.tvl-home-row-cards,.tvl-seasonal-backdrop');
        }) });
    }
    return { posterHeight, values };
  });
  expect(new Set(samples.values.map(value => `${value.height}/${value.paddingTop}/${value.paddingBottom}`)).size).toBeLessThanOrEqual(2);
  expect(samples.values.some(value => value.moving)).toBe(true);
  expect(new Set(samples.values.map(value => Math.round(value.posterTop))).size).toBeGreaterThan(2);
  for (const value of samples.values) expect(value.posterHeight).toBeCloseTo(samples.posterHeight, 1);
  await expectSettled(page);
  expect(audit.errors).toEqual([]);
});

test('a late themed font settles the focused scene without requiring another remote key', async ({ page }) => {
  let release!: () => void, requests = 0;
  const fontGate = new Promise<void>(resolve => { release = resolve; });
  await page.route(/\/assets\/seasonal-fonts\/[^/]+\.woff2(?:\?|$)/, async route => {
    requests++;
    const response = await route.fetch();
    await fontGate;
    await route.fulfill({ response });
  });
  const audit = await fixture(page, 'document', 'Halloween favourites and spooky surprises for a wonderfully magical family night');
  await cards(page).first().focus();
  await expect.poll(() => requests).toBeGreaterThan(0);
  await page.waitForTimeout(400);
  release();
  await page.evaluate(() => document.fonts.ready);
  await expectSettled(page);
  await expect.poll(() => row(page).locator('.tvl-seasonal-title-themed').evaluate(node => node.getBoundingClientRect().top)).toBeGreaterThanOrEqual(79);
  await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
  expect(audit.errors).toEqual([]);
});

test('Right reveals the next poster immediately while its seasonal row is moving after a neighbour collapses', async ({ page }) => {
  const audit = await fixture(page, 'document', 'Spooky Season', 18, 'none');
  await page.evaluate(() => document.fonts.ready);
  await cards(page).first().focus();
  await expectSettled(page);
  const result = await page.evaluate(async () => {
    const section = document.querySelector<HTMLElement>('#homeTab [data-home-row="second"]')!;
    const strip = section.querySelector<HTMLElement>('.tvl-home-row-cards')!;
    const key = (key: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    key('ArrowDown');
    // The previous row closes on the next frame. Capture that actual animation,
    // rather than sleeping until it may already have finished on a fast client.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const moving = document.getAnimations().some(animation => (animation.effect as KeyframeEffect | null)?.target === section && animation.playState === 'running');
    let newlyOffscreen = false;
    for (let step = 0; step < 14; step++) {
      const active = document.activeElement as HTMLElement;
      const items = Array.from(strip.querySelectorAll<HTMLElement>('.tvl-home-row-card'));
      const next = items[items.indexOf(active) + 1];
      if (!next?.classList.contains('tvl-home-row-card')) break;
      const nextRect = next.getBoundingClientRect(), stripRect = strip.getBoundingClientRect();
      newlyOffscreen = nextRect.right > stripRect.right - 8;
      key('ArrowRight');
      if (newlyOffscreen) break;
    }
    const rect = (document.activeElement as HTMLElement).getBoundingClientRect(), bounds = strip.getBoundingClientRect();
    return { moving, newlyOffscreen, scrollLeft: strip.scrollLeft, left: rect.left - bounds.left, right: bounds.right - rect.right,
      activeRow: (document.activeElement as HTMLElement).closest<HTMLElement>('[data-home-row]')?.dataset.homeRow };
  });
  expect(result.moving).toBe(true);
  expect(result.newlyOffscreen).toBe(true);
  expect(result.activeRow).toBe('second');
  expect(result.scrollLeft).toBeGreaterThan(0);
  expect(result.left).toBeGreaterThanOrEqual(5);
  expect(result.right).toBeGreaterThanOrEqual(7);
  expect(audit.errors).toEqual([]);
});

test('first fullscreen focus remeasures the space released when the original header scrolls away', async ({ page }) => {
  const audit = await fixture(page, 'document', 'Spooky Season', 18, 'none');
  await page.evaluate(() => document.fonts.ready);
  // Keep focus at the top of Home until the font is cached. There will be no
  // later font callback or preceding row focus to incidentally repair sizing.
  const initialHeaderBottom = await page.locator('.skinHeader').evaluate(node => node.getBoundingClientRect().bottom);
  expect(initialHeaderBottom).toBeGreaterThan(100);
  await cards(page).first().focus();
  await expect.poll(() => page.locator('.skinHeader').evaluate(node => node.getBoundingClientRect().bottom)).toBeLessThan(0);
  await expectSettled(page);
  expect(audit.errors).toEqual([]);
});

test('Back followed immediately by Down follows row order while restored expansion is still moving', async ({ page }) => {
  await page.addInitScript(() => {
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args: Parameters<typeof animate>) {
      const animation = animate.apply(this, args);
      // Freeze the real expansion partway through. A fast desktop otherwise
      // finishes before Back restoration and the next remote event are tested.
      if (this.closest('#homeTab')) { animation.pause(); animation.currentTime = 80; }
      return animation;
    };
  });
  const audit = await fixture(page, 'document');
  await cards(page).nth(1).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'A Kind of Blue details', exact: true })).toBeVisible();
  await page.goBack();
  await expect(cards(page).nth(1)).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter(animation => {
    const target = (animation.effect as KeyframeEffect | null)?.target;
    return animation.playState === 'paused' && target instanceof Element && !!target.closest('#homeTab');
  }).length)).toBeGreaterThan(0);
  await page.keyboard.press('ArrowDown');
  await expect(cards(page, 'second').nth(1)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(cards(page, 'after').nth(1)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(cards(page, 'second').nth(1)).toBeFocused();
  expect(audit.errors).toEqual([]);
});
