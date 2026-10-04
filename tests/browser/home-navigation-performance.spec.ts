import { expect, test, type Page } from '@playwright/test';

const settings = { version: 1, rows: [
  { id: 'seasonal', kind: 'seasonal', title: '', collectionIds: [], ranked: false, placement: 'end', children: [
    { id: 'spooky', kind: 'items', title: 'Spooky season', collectionIds: ['collection-coast'], ranked: false,
      season: { start: '01-01', end: '12-31' }, appearance: { theme: 'halloween', background: 'parallax',
        backgroundStyle: 'nightmare', expansion: 'none', frame: true, reveal: 'doors', coverStyle: 'nightmare', frameStyle: 'nightmare' } }
  ] },
  ...Array.from({ length: 5 }, (_, index) => ({ id: `following-${index}`, kind: 'items', title: `Following ${index}`,
    collectionIds: ['collection-coast'], placement: 'end', ranked: false }))
] };
const row = (page: Page) => page.locator('#homeTab [data-home-row="spooky"]');
const cards = (page: Page) => row(page).locator('.tvl-home-row-card');

async function fixture(page: Page) {
  await page.addInitScript(settings => {
    localStorage.setItem(`jellyfin-cinema.home-collections.v1:${encodeURIComponent(location.origin)}:demo`, JSON.stringify(settings));
    const counts = (window as any).__homeNavigationWork = { nativeScans: 0, navigationScans: 0, attachScans: 0 };
    const query = Element.prototype.querySelectorAll;
    Element.prototype.querySelectorAll = function (selector: string) {
      if (this.id === 'homeTab') {
        if (selector === '.verticalSection, .ec-root') counts.nativeScans++;
        if (selector === '.focuscontainer-x, .ec-root') counts.navigationScans++;
        if (selector === '.verticalSection') counts.attachScans++;
      }
      return query.call(this, selector);
    };
  }, settings);
  await page.route('**/dist/demo.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\n(() => {
      const api=window.TvItemLayoutDemo.api, members=api.getCollectionItems;
      api.getCollectionItems=async id=>{
        const found=await members(id); if(id!=='collection-coast')return found;
        return Array.from({length:60},(_,i)=>({...found[i%found.length],Id:'navigation-film-'+i,Name:'Navigation film '+(i+1)}));
      };
      const item=api.getItem;
      api.getItem=async id=>id.startsWith('navigation-film-')?{...await item('movie-tide'),Id:id,Name:'Navigation film '+(Number(id.slice(16))+1)}:item(id);
    })();` });
  });
  await page.goto('/?featured=0&layout=tv#/home');
  await expect(cards(page)).toHaveCount(60);
  await expect(page.locator('#homeTab [data-home-row="following-4"] .tvl-home-row-card')).toHaveCount(60);
  await expect(page.locator('#homeTab')).not.toHaveClass(/tvl-home-initial-loading/);
  await cards(page).first().focus();
  await frames(page, 4);
}

async function frames(page: Page, count = 2) {
  await page.evaluate(async count => {
    for (let i = 0; i < count; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  }, count);
}
async function resetWork(page: Page) {
  await frames(page);
  await page.evaluate(() => Object.keys((window as any).__homeNavigationWork).forEach(key => { (window as any).__homeNavigationWork[key] = 0; }));
}
async function work(page: Page) {
  await frames(page);
  return page.evaluate(() => (window as any).__homeNavigationWork as { nativeScans: number; navigationScans: number; attachScans: number });
}

for (const input of ['keyboard', 'command']) test(`${input} repeats open seasonal doors without rediscovering all Home rows`, async ({ page }) => {
  await fixture(page); await resetWork(page);
  for (let i = 0; i < 12; i++) {
    if (input === 'keyboard') await page.keyboard.press('ArrowRight');
    else await page.evaluate(() => window.dispatchEvent(new CustomEvent('command', { detail: { command: 'right' }, cancelable: true })));
    await expect(cards(page).nth(i + 1)).toBeFocused();
    await frames(page);
  }
  await expect(cards(page).nth(12)).toHaveClass(/tvl-seasonal-item-open/);
  await expect(cards(page).first()).not.toHaveClass(/tvl-seasonal-item-open/);
  const measured = await work(page);
  await test.info().attach('home-navigation-work', { body: JSON.stringify(measured), contentType: 'application/json' });
  expect(measured).toEqual({ nativeScans: 0, navigationScans: 0, attachScans: 0 });
  expect(await row(page).locator('.tvl-home-row-cards').evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
});

test('seasonal presentation changes are ignored but mixed visibility, structure and busy changes still reconcile Home', async ({ page }) => {
  await fixture(page); await resetWork(page);
  await cards(page).first().evaluate(node => {
    node.classList.add('tvl-seasonal-item-open', 'tvl-seasonal-reveal-active');
    node.classList.remove('tvl-seasonal-item-open', 'tvl-seasonal-reveal-active');
  });
  expect((await work(page)).attachScans).toBe(0);
  // Focus classes can share one native mutation batch with an important class.
  await cards(page).first().evaluate(node => node.classList.add('tvl-seasonal-item-open', 'hide'));
  expect((await work(page)).attachScans).toBeGreaterThan(0);
  await cards(page).first().evaluate(node => node.classList.remove('hide'));
  await resetWork(page);
  await row(page).locator('.tvl-home-row-cards').evaluate(node => node.setAttribute('aria-busy', 'true'));
  expect((await work(page)).attachScans).toBeGreaterThan(0);
  await row(page).locator('.tvl-home-row-cards').evaluate(node => node.removeAttribute('aria-busy'));
  await resetWork(page);
  await row(page).locator('.tvl-home-row-cards').evaluate(node => node.append(document.createElement('span')));
  expect((await work(page)).attachScans).toBeGreaterThan(0);
});

test('replacing a native scroller invalidates saved references before leaving and returning Home', async ({ page }) => {
  await fixture(page);
  await cards(page).nth(7).focus(); await frames(page);
  await page.evaluate(() => {
    const original = document.querySelector('#homeTab [aria-label="Latest in Movies"] .itemsContainer')!;
    const replacement = original.cloneNode(true) as HTMLElement & { getScrollPosition(): number; scrollToPosition(position: number): void };
    replacement.dataset.savedPosition = '315';
    replacement.getScrollPosition = () => Number(replacement.dataset.savedPosition);
    replacement.scrollToPosition = position => { replacement.dataset.savedPosition = String(position); };
    original.replaceWith(replacement);
  });
  await frames(page);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Navigation film 8 details', exact: true })).toBeVisible();
  await page.evaluate(() => {
    (document.querySelector('#homeTab [aria-label="Latest in Movies"] .itemsContainer') as HTMLElement).dataset.savedPosition = '0';
  });
  await page.goBack();
  await expect(cards(page).nth(7)).toBeFocused();
  await expect(page.locator('#homeTab [aria-label="Latest in Movies"] .itemsContainer')).toHaveAttribute('data-saved-position', '315');
});
