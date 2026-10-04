import { expect, test, type Page } from '@playwright/test';

const settings = { version: 1, rows: [{ id: 'retained', kind: 'items', title: 'Retained picks',
  collectionIds: ['collection-coast'], ranked: true, placement: 'start' }] };
const row = (page: Page) => page.locator('#homeTab [data-home-row="retained"]');

async function fixture(page: Page) {
  await page.route('**/dist/demo.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\n(() => {
      const api=window.TvItemLayoutDemo.api;
      const state=window.__retainedHome={settings:${JSON.stringify(settings)},current:true,reads:0};
      api.homeCollections={isCurrent:()=>state.current,load:async()=>{state.reads++;return {Revision:'rows',Settings:state.settings};},save:async()=>{throw Error('Unexpected save');}};
    })();` });
  });
  await page.goto('/?featured=0&layout=tv#/home');
  await expect(row(page).locator('.tvl-home-row-card')).toHaveCount(2);
  await expect(page.locator('#homeTab')).not.toHaveClass(/tvl-home-initial-loading/);
  await row(page).locator('.tvl-home-row-card').first().focus();
  await page.evaluate(() => {
    const state = (window as any).__retainedHome;
    state.row = document.querySelector('[data-home-row="retained"]');
    state.card = document.activeElement;
    state.poster = state.card.querySelector('.tvl-home-row-art img');
  });
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'After the Tide details', exact: true })).toBeVisible();
}

test('detail Back resumes the existing Home controls and poster, including a second visit', async ({ page }) => {
  await fixture(page);
  for (let visit = 0; visit < 2; visit++) {
    await page.goBack();
    await expect(row(page).locator('.tvl-home-row-card').first()).toBeFocused();
    expect(await page.evaluate(() => {
      const state = (window as any).__retainedHome;
      return state.row === document.querySelector('[data-home-row="retained"]')
        && state.card === document.activeElement && state.poster === state.card.querySelector('.tvl-home-row-art img');
    })).toBe(true);
    await page.keyboard.press('ArrowRight');
    await expect(row(page).locator('.tvl-home-row-card').nth(1)).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'After the Tide details', exact: true })).toBeVisible();
  }
});

for (const exit of ['account', 'signout', 'login', 'selectserver', 'mobile', 'destroy'] as const) {
  test(`${exit} discards Home retained behind a detail page`, async ({ page }) => {
    await fixture(page);
    await page.evaluate(exit => {
      if (exit === 'account') window.TvItemLayoutDemo!.api.userId = 'another-account';
      else if (exit === 'signout') delete window.TvItemLayoutDemo;
      else if (exit === 'login' || exit === 'selectserver') location.hash = '/' + exit;
      else if (exit === 'mobile') {
        for (const node of [document.documentElement, document.body]) node.classList.remove('layout-tv', 'layout-desktop');
        document.body.classList.add('layout-mobile');
      } else window.TvItemLayout!.destroy();
      window.TvItemLayout!.refresh();
    }, exit);
    await expect(row(page)).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).__retainedHome.row.isConnected)).toBe(false);
  });
}

test('replacement authentication for the same account creates a fresh Home adapter', async ({ page }) => {
  await fixture(page);
  await page.evaluate(() => {
    const state = (window as any).__retainedHome;
    state.current = false;
    const api = window.TvItemLayoutDemo!.api;
    window.TvItemLayoutDemo!.api = { ...api, homeCollections: {
      isCurrent: () => true,
      load: async () => ({ Revision: 'fresh-session', Settings: state.settings }),
      save: async () => { throw Error('Unexpected save'); }
    } };
  });
  await page.goBack();
  await expect(row(page)).toBeVisible();
  await expect(row(page).locator('.tvl-home-row-card')).toHaveCount(2);
  expect(await page.evaluate(() => (window as any).__retainedHome.row === document.querySelector('[data-home-row="retained"]'))).toBe(false);
  await row(page).locator('.tvl-home-row-card').first().press('Enter');
  await expect(page.getByRole('dialog', { name: 'After the Tide details', exact: true })).toBeVisible();
});

test('a held collection-tab response defers card construction until Home resumes', async ({ page }) => {
  const tabbed = { version: 1, rows: [{ ...settings.rows[0], tabs: [
    { id: 'movies', label: 'Movies', collectionId: 'collection-coast' },
    { id: 'shows', label: 'Shows', collectionId: 'collection-wilderness' }
  ] }] };
  await page.addInitScript(value => localStorage.setItem(`jellyfin-cinema.home-collections.v1:${encodeURIComponent(location.origin)}:demo`, JSON.stringify(value)), tabbed);
  await page.route('**/dist/demo.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\n(() => {
      const api=window.TvItemLayoutDemo.api, members=api.getCollectionItems;
      const state=window.__deferredHomeTab={completed:false,changes:0};
      api.getCollectionItems=async id=>{
        const items=await members(id);
        if(id==='collection-wilderness')await new Promise(resolve=>state.release=resolve);
        state.completed=id==='collection-wilderness';return items;
      };
    })();` });
  });
  await page.goto('/?featured=0&layout=tv#/home');
  await expect(row(page).locator('.tvl-home-row-card')).toHaveCount(2);
  await row(page).getByRole('tab', { name: 'Shows', exact: true }).click();
  await expect.poll(() => page.evaluate(() => typeof (window as any).__deferredHomeTab.release)).toBe('function');
  await page.locator('#homeTab [aria-label="Latest in Movies"] button').first().click();
  await expect(page.getByRole('dialog', { name: / details$/ })).toBeVisible();
  await page.evaluate(() => {
    const state = (window as any).__deferredHomeTab;
    state.observer = new MutationObserver(records => { state.changes += records.length; });
    state.observer.observe(document.querySelector('[data-home-row="retained"]'), { childList: true, subtree: true });
    state.release();
  });
  await expect.poll(() => page.evaluate(() => (window as any).__deferredHomeTab.completed)).toBe(true);
  await page.evaluate(async () => {
    for (let frame = 0; frame < 3; frame++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  });
  expect(await page.evaluate(() => (window as any).__deferredHomeTab.changes)).toBe(0);
  await page.evaluate(() => (window as any).__deferredHomeTab.observer.disconnect());
  await page.goBack();
  await expect(row(page).getByRole('tab', { name: 'Shows', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(row(page).locator('.tvl-home-row-card')).toHaveCount(3);
});
