import { expect, test, type Page } from '@playwright/test';

const row = (page: Page) => page.locator('#homeTab [data-home-row="large-picks"]');
const cards = (page: Page) => row(page).locator('.tvl-home-row-card');

async function fixture(page: Page) {
  await page.addInitScript(() => localStorage.setItem(`jellyfin-cinema.home-collections.v1:${encodeURIComponent(location.origin)}:demo`, JSON.stringify({
    version: 1, rows: [{ id: 'large-picks', kind: 'items', title: 'Large picks', collectionIds: ['collection-coast'], ranked: false, placement: 'end' }]
  })));
  await page.route('**/dist/demo.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\n(() => {
      const api=window.TvItemLayoutDemo.api, members=api.getCollectionItems, item=api.getItem;
      api.getCollectionItems=async id=>{
        const found=await members(id); if(id!=='collection-coast')return found;
        return Array.from({length:61},(_,i)=>({...found[i%found.length],Id:'hotpath-film-'+i,Name:'Hotpath film '+(i+1)}));
      };
      api.getItem=async id=>id.startsWith('hotpath-film-')?{...await item('movie-tide'),Id:id,Name:'Hotpath film '+(Number(id.slice(13))+1)}:item(id);
    })();` });
  });
  await page.goto('/?featured=0&layout=tv#/home');
  await expect(cards(page)).toHaveCount(60);
  await expect(page.locator('#homeTab')).not.toHaveClass(/tvl-home-initial-loading/);
  await cards(page).first().focus();
  await page.evaluate(async () => {
    for (let i = 0; i < 4; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  });
}

for (const input of ['keyboard', 'command']) test(`${input} repeats measure adjacent controls and coalesce saved-position work`, async ({ page }) => {
  await fixture(page);
  const measured = await page.evaluate(async input => {
    const host = document.querySelector<HTMLElement>('#homeTab')!;
    const strip = host.querySelector<HTMLElement>('[data-home-row="large-picks"] .tvl-home-row-cards')!;
    const count = { cardVisibilityReads: 0, ancestorStyleReads: 0, positionCaptures: 0 };
    const rects = Element.prototype.getClientRects, style = window.getComputedStyle;
    Element.prototype.getClientRects = function () {
      if (this.classList.contains('tvl-home-row-card') && strip.contains(this)) count.cardVisibilityReads++;
      return rects.call(this);
    };
    window.getComputedStyle = function (element, pseudo) {
      if (element === host || element.contains(host)) count.ancestorStyleReads++;
      return style.call(window, element, pseudo);
    };
    const native = host.querySelector<HTMLElement>('[aria-label="Latest in Movies"] .itemsContainer')! as HTMLElement & { getScrollPosition(): number };
    native.getScrollPosition = () => { count.positionCaptures++; return 0; };
    // A held remote can deliver several repeats before the next paint. Focus
    // and native/custom scroll events must share one pending position capture.
    for (let i = 0; i < 12; i++) {
      if (input === 'keyboard') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));
      else window.dispatchEvent(new CustomEvent('command', { detail: { command: 'right' }, cancelable: true }));
      strip.dispatchEvent(new Event('scroll'));
    }
    const focus = (document.activeElement as HTMLElement).dataset.itemId;
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    Element.prototype.getClientRects = rects; window.getComputedStyle = style;
    return { ...count, focus };
  }, input);
  await test.info().attach('home-navigation-hotpath-work', { body: JSON.stringify(measured), contentType: 'application/json' });
  expect(measured.focus).toBe('hotpath-film-12');
  expect(measured.cardVisibilityReads).toBeLessThanOrEqual(12);
  expect(measured.positionCaptures).toBeLessThanOrEqual(2);
  expect(measured.ancestorStyleReads).toBeLessThanOrEqual(2);
  expect(await row(page).locator('.tvl-home-row-cards').evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
});

test('horizontal movement uses current membership and skips hidden, disabled and CSS-hidden neighbours', async ({ page }) => {
  await fixture(page);
  await cards(page).evaluateAll(nodes => {
    (nodes[1] as HTMLElement).hidden = true;
    (nodes[2] as HTMLButtonElement).disabled = true;
    (nodes[3] as HTMLElement).style.display = 'none';
    nodes[4].classList.add('hide');
    (nodes[5] as HTMLElement).style.visibility = 'hidden';
  });
  await page.keyboard.press('ArrowRight'); await expect(cards(page).nth(6)).toBeFocused();
  await page.keyboard.press('ArrowLeft'); await expect(cards(page).first()).toBeFocused();
  await cards(page).first().evaluate(node => {
    const wrapper = document.createElement('span'), button = document.createElement('button');
    button.textContent = 'Inserted choice'; wrapper.append(button); node.after(wrapper);
  });
  await page.keyboard.press('ArrowRight'); await expect(row(page).getByRole('button', { name: 'Inserted choice', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowRight'); await expect(cards(page).nth(6)).toBeFocused();
  await row(page).getByRole('button', { name: 'View full collection', exact: true }).focus();
  await page.keyboard.press('ArrowRight'); await expect(row(page).getByRole('button', { name: 'View full collection', exact: true })).toBeFocused();
});

test('vertical entry and exit at the start of a long row do not measure its offscreen posters', async ({ page }) => {
  await fixture(page);
  const measured = await page.evaluate(() => {
    const strip = document.querySelector<HTMLElement>('#homeTab [data-home-row="large-picks"] .tvl-home-row-cards')!;
    let visibilityReads = 0;
    const rects = Element.prototype.getClientRects;
    Element.prototype.getClientRects = function () {
      if (this.classList.contains('tvl-home-row-card') && strip.contains(this)) visibilityReads++;
      return rects.call(this);
    };
    for (let i = 0; i < 6; i++) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', cancelable: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true }));
    }
    Element.prototype.getClientRects = rects;
    return { visibilityReads, focus: (document.activeElement as HTMLElement).dataset.itemId };
  });
  await test.info().attach('vertical-home-navigation-work', { body: JSON.stringify(measured), contentType: 'application/json' });
  expect(measured.focus).toBe('hotpath-film-0');
  expect(measured.visibilityReads).toBeLessThanOrEqual(36);
});

test('immediate activation flushes the last repeated move before leaving and restores its scroll position', async ({ page }) => {
  await fixture(page);
  const saved = await page.evaluate(() => {
    for (let i = 0; i < 12; i++) window.dispatchEvent(new CustomEvent('command', { detail: { command: 'right' }, cancelable: true }));
    const strip = document.querySelector<HTMLElement>('#homeTab [data-home-row="large-picks"] .tvl-home-row-cards')!;
    const saved = { left: strip.scrollLeft, top: document.scrollingElement!.scrollTop };
    // No animation frame occurs between the final move and activating it.
    window.dispatchEvent(new CustomEvent('command', { detail: { command: 'select' }, cancelable: true }));
    return saved;
  });
  await expect(page.getByRole('dialog', { name: 'Hotpath film 13 details', exact: true })).toBeVisible();
  expect(saved.left).toBeGreaterThan(0);
  await page.goBack();
  await expect(cards(page).nth(12)).toBeFocused();
  await expect.poll(() => row(page).locator('.tvl-home-row-cards').evaluate(node => node.scrollLeft)).toBe(saved.left);
  await expect.poll(() => page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(saved.top);
});

test('temporary smooth-scroll overrides do not reconcile Home while real placement styles still do', async ({ page }) => {
  await fixture(page);
  const measured = await page.evaluate(async () => {
    const host = document.querySelector<HTMLElement>('#homeTab')!;
    const scroller = host.querySelector<HTMLElement>('.homeSectionsContainer')!;
    scroller.style.setProperty('scroll-behavior', 'smooth', 'important');
    scroller.style.setProperty('overflow-y', 'auto');
    scroller.style.setProperty('height', '300px');
    scroller.style.setProperty('--observer-marker', '"semi;colon"');
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    let reconciliations = 0;
    const query = Element.prototype.querySelectorAll;
    Element.prototype.querySelectorAll = function (selector: string) {
      if (this === host && selector === '.verticalSection') reconciliations++;
      return query.call(this, selector);
    };
    for (let i = 0; i < 12; i++) {
      // Reproduce the native-scroll override/restore pair around focus. Both
      // mutation records arrive after the original declaration is restored.
      scroller.style.setProperty('scroll-behavior', 'auto', 'important');
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));
      scroller.style.setProperty('scroll-behavior', 'smooth', 'important');
    }
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const temporary = reconciliations;
    scroller.style.setProperty('scroll-behavior', 'auto', 'important');
    scroller.style.setProperty('order', '2');
    scroller.style.setProperty('scroll-behavior', 'smooth', 'important');
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const order = reconciliations;
    scroller.style.setProperty('display', 'none');
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const display = reconciliations;
    Element.prototype.querySelectorAll = query;
    return { temporary, order, display, behavior: scroller.style.getPropertyValue('scroll-behavior'),
      priority: scroller.style.getPropertyPriority('scroll-behavior'), marker: scroller.style.getPropertyValue('--observer-marker') };
  });
  expect(measured.temporary).toBe(0);
  expect(measured.order).toBeGreaterThan(0);
  expect(measured.display).toBeGreaterThan(measured.order);
  expect(measured.behavior).toBe('smooth'); expect(measured.priority).toBe('important');
  expect(measured.marker).toBe('"semi;colon"');
});
