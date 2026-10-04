import { expect, test, type Page } from '@playwright/test';
import { openCollectionRowsFromSettings } from './collection-rows-fixture';
import { defaultSeasonalAppearance, type HomeCollectionRow, type HomeSeasonalArtStyle } from '../../src/home-collection-settings';
import { useDesktopLayout } from './layout-fixture';

test.use({ timezoneId: 'Europe/London' });
const editor = (page: Page) => page.getByRole('dialog', { name: 'Customize Home rows', exact: true });
const preview = (page: Page) => editor(page).getByRole('complementary', { name: 'Home row preview', exact: true });
const homeCards = (page: Page) => page.locator('#homeTab [data-home-row="advent"] .tvl-home-row-card');
const appearanceSelect = (page: Page, name: string) => editor(page).getByRole('combobox', { name, exact: true });
const adventRow = (extra: Partial<HomeCollectionRow> = {}): HomeCollectionRow => ({
  id: 'advent', kind: 'items', title: 'A film every day', collectionIds: ['collection-coast'], ranked: false,
  placement: 'start', itemSort: 'collection', itemOrder: [], season: { start: '12-01', end: '12-31' },
  appearance: { ...defaultSeasonalAppearance('christmas'), background: 'none', expansion: 'none', frame: false, reveal: 'advent', adventUnlock: 'daily' }, ...extra,
});
const settingsFor = (row: HomeCollectionRow) => ({ version: 1, rows: [{
  id: 'seasonal', kind: 'seasonal', title: '', collectionIds: [], ranked: false, placement: 'start', itemSort: 'collection', itemOrder: [], children: [row],
}] });

async function homeFixture(page: Page, row = adventRow(), date = '2026-12-01T12:00:00Z', layout = 'tv') {
  const settings = settingsFor(row);
  await page.clock.install({ time: new Date(date) });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(settings => {
    localStorage.setItem(`jellyfin-cinema.home-collections.v1:${encodeURIComponent(location.origin)}:demo`, JSON.stringify(settings));
  }, settings);
  await page.route('**/dist/demo.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\n(()=>{
      const api=window.TvItemLayoutDemo.api,members=api.getCollectionItems,item=api.getItem;
      api.homeCollections={isCurrent:()=>true,load:async()=>({Revision:'advent-test',Settings:${JSON.stringify(settings)}}),save:async()=>{throw new Error('Unexpected write')}};
      api.getCollectionItems=async id=>{const found=await members(id);return id==='collection-coast'?Array.from({length:25},(_,i)=>({...found[i%found.length],Id:'advent-film-'+i,Name:'December film '+(i+1)})):found;};
      api.getItem=async id=>id.startsWith('advent-film-')?{...await item('movie-tide'),Id:id,Name:'December film '+(Number(id.slice(12))+1)}:item(id);
    })();` });
  });
  await page.goto(`/?featured=0&layout=${layout}#/home`);
  await expect(homeCards(page)).toHaveCount(25);
  await expect(page.locator('#homeTab')).not.toHaveClass(/tvl-home-initial-loading/);
}

async function openEditor(page: Page) {
  await useDesktopLayout(page);
  await openCollectionRowsFromSettings(page);
  await expect(editor(page).getByRole('button', { name: 'Save rows', exact: true })).toBeEnabled();
}

async function savedChild(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem(`jellyfin-cinema.home-collections.v1:${encodeURIComponent(location.origin)}:demo`)!).rows[0].children[0]);
}

test('daily advent doors conceal future films and block activation while allowing the available film', async ({ page }) => {
  await homeFixture(page);
  const cards = homeCards(page), first = cards.first(), tomorrow = cards.nth(1);
  await expect(first).toHaveAttribute('data-advent-day', '1');
  await expect(first).toHaveAttribute('data-advent-locked', 'false');
  await expect(tomorrow).toHaveAttribute('data-advent-locked', 'true');
  await expect(cards.locator('.tvl-home-rank')).toHaveCount(0);
  await expect(cards.locator('.tvl-seasonal-advent-number')).toHaveCount(25);
  await expect(first).toHaveAccessibleName(/Advent door 1/);
  await expect(tomorrow).toHaveAttribute('aria-disabled', 'true');
  await tomorrow.focus(); await page.keyboard.press('Enter');
  await expect(tomorrow).toBeFocused();
  await expect(tomorrow).not.toHaveClass(/tvl-seasonal-item-open/);
  await expect(tomorrow.locator('.tvl-home-row-caption')).toHaveText(/Opens/);
  await expect(tomorrow.locator('.tvl-home-row-caption')).not.toContainText('December film');
  await expect(page).toHaveURL(/#\/home$/);
  await expect(page.getByRole('dialog', { name: /details$/ })).toHaveCount(0);
  await first.focus();
  await expect(first).toHaveClass(/tvl-seasonal-item-open/);
  await expect(first.locator('.tvl-home-row-caption')).toHaveCSS('opacity', '1');
  await expect(first).toHaveAccessibleName(/December film 1/);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'December film 1 details', exact: true })).toBeVisible();
});

test('daily advent keeps films at their saved door positions across reload even when shuffle is saved', async ({ page }) => {
  await homeFixture(page, adventRow({ shuffle: true, itemSort: 'custom', itemOrder: ['advent-film-2', 'advent-film-0', 'advent-film-1'] }));
  const order = () => homeCards(page).evaluateAll(cards => cards.map(card => (card as HTMLElement).dataset.itemId));
  const before = await order();
  expect(before.slice(0, 3)).toEqual(['advent-film-2', 'advent-film-0', 'advent-film-1']);
  await page.reload(); await expect(homeCards(page)).toHaveCount(25);
  expect(await order()).toEqual(before);
  await expect(homeCards(page).first()).toHaveAttribute('data-advent-day', '1');
  await expect(homeCards(page).last()).toHaveAttribute('data-advent-day', '25');
  await expect(homeCards(page).last()).toHaveAccessibleName(/Advent door 25/);
});

test('a focused future door unlocks at local midnight without losing focus or rebuilding the row', async ({ page }) => {
  await homeFixture(page, adventRow(), '2026-12-01T23:59:00Z');
  const tomorrow = homeCards(page).nth(1), original = await tomorrow.elementHandle();
  await tomorrow.focus();
  await expect(tomorrow).toHaveAttribute('data-advent-locked', 'true');
  await page.clock.fastForward(61_000);
  await expect(tomorrow).toHaveAttribute('data-advent-locked', 'false');
  await expect(tomorrow).toBeFocused();
  await expect(tomorrow).toHaveClass(/tvl-seasonal-item-open/);
  await expect(tomorrow).not.toHaveAttribute('aria-disabled');
  expect(await original!.evaluate(node => node.isConnected)).toBe(true);
  await expect(tomorrow.locator('.tvl-home-row-caption')).toHaveText('December film 2');
});

for (const style of ['classic', 'storybook', 'photoreal'] as HomeSeasonalArtStyle[]) test(`${style} advent has a numbered single door that opens and closes on desktop`, async ({ page }) => {
  const row = adventRow(); row.appearance = { ...row.appearance!, adventUnlock: 'focus', coverStyle: style };
  await homeFixture(page, row, '2026-12-01T12:00:00Z', 'desktop');
  const cards = homeCards(page), card = cards.nth(11);
  await expect(card).toHaveAttribute('data-advent-day', '12');
  await expect(card).toHaveAttribute('data-advent-locked', 'false');
  await expect(card.locator('.tvl-seasonal-advent-flap')).toHaveCount(1);
  await expect(card.locator('.tvl-seasonal-advent-number')).toHaveCount(1);
  await expect.poll(() => card.locator('.tvl-seasonal-advent-number').evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await card.hover(); await expect(card).toHaveClass(/tvl-seasonal-item-open/);
  await expect(card.locator('.tvl-home-row-caption')).toHaveCSS('opacity', '1');
  await page.mouse.move(5, 5); await expect(card).not.toHaveClass(/tvl-seasonal-item-open/);
  await expect(card.locator('.tvl-home-row-caption')).toHaveCSS('opacity', '0');
});

test('advent choices save and reload, previews open outside the season, and changing reveal or theme removes calendar settings', async ({ page }) => {
  test.setTimeout(40_000);
  await page.clock.install({ time: new Date('2026-07-01T12:00:00Z') });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const row = adventRow({ shuffle: true }); row.appearance!.reveal = 'none'; delete row.appearance!.adventUnlock;
  await page.addInitScript(settings => {
    const key = `jellyfin-cinema.home-collections.v1:${encodeURIComponent(location.origin)}:demo`;
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(settings));
  }, settingsFor(row));
  await page.goto('/?featured=0&layout=desktop#/home'); await openEditor(page);
  await editor(page).getByRole('button', { name: 'Edit A film every day', exact: true }).click();
  await editor(page).getByRole('button', { name: 'Appearance', exact: true }).click();
  await appearanceSelect(page, 'Item reveal').selectOption('advent');
  await expect(appearanceSelect(page, 'Door opening')).toHaveValue('daily');
  await appearanceSelect(page, 'Advent door style').selectOption('photoreal');
  await expect(appearanceSelect(page, 'Advent door style').locator('option[value="photoreal"]')).toHaveText('Gilded winter wood');
  const cards = preview(page).locator('.tvl-home-row-card');
  await expect(cards).toHaveCount(2);
  await cards.nth(1).focus();
  await expect(cards.nth(1)).toHaveClass(/tvl-seasonal-item-open/);
  await expect(cards.nth(1).locator('.tvl-home-row-caption')).toHaveCSS('opacity', '1');
  await editor(page).getByRole('button', { name: 'Item order', exact: true }).click();
  await expect(editor(page).getByRole('button', { name: 'Shuffle on load', exact: true })).toBeDisabled();
  const previewOrder = await cards.evaluateAll(nodes => nodes.map(node => (node as HTMLElement).dataset.itemId));
  expect(previewOrder).toEqual(['movie-tide', 'movie-blue']);
  await editor(page).getByRole('button', { name: 'Save rows', exact: true }).click();
  expect((await savedChild(page)).appearance).toMatchObject({ reveal: 'advent', adventUnlock: 'daily', coverStyle: 'photoreal' });
  expect((await savedChild(page)).shuffle).toBe(true);
  await page.reload(); await openEditor(page);
  await editor(page).getByRole('button', { name: 'Edit A film every day', exact: true }).click();
  await editor(page).getByRole('button', { name: 'Appearance', exact: true }).click();
  await expect(appearanceSelect(page, 'Door opening')).toHaveValue('daily');
  await expect(appearanceSelect(page, 'Advent door style')).toHaveValue('photoreal');
  await appearanceSelect(page, 'Door opening').selectOption('focus');
  await editor(page).getByRole('button', { name: 'Item order', exact: true }).click();
  await expect(editor(page).getByRole('button', { name: 'Shuffle on load', exact: true })).toBeEnabled();
  await editor(page).getByRole('button', { name: 'Appearance', exact: true }).click();
  await appearanceSelect(page, 'Item reveal').selectOption('doors');
  await expect(appearanceSelect(page, 'Door opening')).toHaveCount(0);
  await editor(page).getByRole('button', { name: 'Save rows', exact: true }).click();
  expect((await savedChild(page)).appearance).not.toHaveProperty('adventUnlock');
  await openEditor(page); await editor(page).getByRole('button', { name: 'Edit A film every day', exact: true }).click();
  await editor(page).getByRole('button', { name: 'Appearance', exact: true }).click();
  await appearanceSelect(page, 'Item reveal').selectOption('advent');
  await editor(page).getByRole('button', { name: 'Halloween', exact: true }).click();
  await expect(appearanceSelect(page, 'Item reveal')).toHaveValue('none');
  await expect(appearanceSelect(page, 'Item reveal').locator('option[value="advent"]')).toHaveCount(0);
  await editor(page).getByRole('button', { name: 'Save rows', exact: true }).click();
  expect((await savedChild(page)).appearance).not.toHaveProperty('adventUnlock');
  await openEditor(page); await editor(page).getByRole('button', { name: 'Edit A film every day', exact: true }).click();
  await editor(page).getByRole('button', { name: 'Appearance', exact: true }).click();
  await editor(page).getByRole('button', { name: 'Christmas', exact: true }).click();
  await appearanceSelect(page, 'Item reveal').selectOption('advent');
  await editor(page).getByRole('button', { name: 'Normal', exact: true }).click();
  await editor(page).getByRole('button', { name: 'Save rows', exact: true }).click();
  expect(await savedChild(page)).not.toHaveProperty('appearance');
});
