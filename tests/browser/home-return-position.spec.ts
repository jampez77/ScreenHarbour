import { expect, test, type Page } from '@playwright/test';

const row = (page: Page) => page.locator('#homeTab [data-home-row="return-position"]');
const card = (page: Page) => row(page).locator('.tvl-home-row-card[data-item-id="position-film-13"]');

async function fixture(page: Page, seasonal = false) {
  await page.setViewportSize({ width: 1280, height: 720 });
  const common = { kind: 'items', collectionIds: ['collection-coast'], ranked: false,
    placement: 'end', itemSort: 'collection', itemOrder: [] };
  const selected = { ...common, id: 'return-position', title: 'Return to these films' };
  const settings = { version: 1, rows: seasonal ? [{ ...common, id: 'seasons', kind: 'seasonal', children: [
    { ...selected, season: { start: '01-01', end: '12-31' },
      appearance: { theme: 'halloween', background: 'static', expansion: 'fullscreen', frame: false, reveal: 'none' } }
  ] }] : [selected] };
  await page.route('**/dist/demo.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\n(() => {
      const api = window.TvItemLayoutDemo.api, members = api.getCollectionItems, getItem = api.getItem, image = api.image;
      api.homeCollections = { isCurrent: () => true, load: async () => ({ Revision: 'position', Settings: ${JSON.stringify(settings)} }), save: async () => { throw Error('Unexpected write'); } };
      const film = async id => ({ ...await getItem('movie-tide'), Id: id, Name: 'Position film ' + id.slice(14) });
      api.getCollectionItems = async id => id === 'collection-coast'
        ? Promise.all(Array.from({ length: 30 }, (_, index) => film('position-film-' + index))) : members(id);
      api.getItem = async id => id.startsWith('position-film-') ? film(id) : getItem(id);
      api.image = (item, kind) => image(item.Id.startsWith('position-film-') ? { ...item, Id: 'movie-tide' } : item, kind);
    })();` });
  });
  await page.goto('/?featured=0&layout=tv#/home');
  await expect(row(page).locator('.tvl-home-row-card')).toHaveCount(30);
  await expect(page.locator('#homeTab')).not.toHaveClass(/tvl-home-initial-loading/);
  await page.addStyleTag({ content: `
    html,body { overflow:hidden;height:100%; }
    .position-home-scroller { position:fixed;inset:0;overflow-y:auto; }
    .demo-native-home-page { margin:0; }
  ` });
  await page.evaluate(() => {
    const home = document.querySelector('#indexPage')!;
    const scroller = document.createElement('div'); scroller.className = 'position-home-scroller';
    home.parentElement!.insertBefore(scroller, home); scroller.append(home);
    const tail = document.createElement('div'); tail.style.height = '800px'; scroller.append(tail);
  });
  await card(page).focus();
  await card(page).evaluate(node => node.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }));
  await page.waitForTimeout(650);
}

async function position(page: Page) {
  return card(page).evaluate(node => ({
    top: node.getBoundingClientRect().top,
    left: node.getBoundingClientRect().left,
    scroll: document.querySelector('.position-home-scroller')!.scrollTop
  }));
}

async function leave(page: Page) {
  const before = await position(page);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Position film 13 details', exact: true })).toBeVisible();
  return before;
}

test('item Back rebinds a replaced nested Home scroll owner while retaining the exact card', async ({ page }) => {
  await fixture(page);
  const before = await leave(page);
  expect(before.scroll).toBeGreaterThan(300);
  await page.evaluate(() => {
    const old = document.querySelector('.position-home-scroller')!;
    const replacement = old.cloneNode(false); replacement.append(...Array.from(old.childNodes)); old.replaceWith(replacement);
  });
  await page.goBack(); await expect(card(page)).toBeFocused();
  await page.waitForTimeout(650);
  const after = await position(page);
  expect(Math.abs(after.top - before.top), JSON.stringify({ before, after })).toBeLessThan(2);
  expect(Math.abs(after.left - before.left), JSON.stringify({ before, after })).toBeLessThan(2);
});

test('item Back keeps its screen position when native rows above refresh after restoration', async ({ page }) => {
  await fixture(page);
  // Older TV engines do not reliably compensate for late content growth.
  // Explicitly disable Chromium's automatic anchoring to cover that case.
  await page.addStyleTag({ content: '.position-home-scroller { overflow-anchor:none; }' });
  const before = await leave(page);
  await page.goBack(); await expect(card(page)).toBeFocused();
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const native = document.querySelector('#homeTab .verticalSection:not(.tvl-home-collection-row)')!;
    const added = document.createElement('div'); added.style.height = '220px'; native.append(added);
  });
  await page.waitForTimeout(300);
  const after = await position(page);
  expect(Math.abs(after.top - before.top), JSON.stringify({ before, after })).toBeLessThan(2);
  expect(Math.abs(after.left - before.left), JSON.stringify({ before, after })).toBeLessThan(2);
});

test('item Back keeps a manually positioned fullscreen scene instead of reframing it', async ({ page }) => {
  await fixture(page, true);
  await page.evaluate(() => { document.querySelector('.position-home-scroller')!.scrollTop += 35; });
  await page.waitForTimeout(100);
  const before = await leave(page);
  await page.goBack(); await expect(card(page)).toBeFocused();
  await page.waitForTimeout(650);
  const after = await position(page);
  expect(Math.abs(after.top - before.top), JSON.stringify({ before, after })).toBeLessThan(2);
});
