import { expect, test, type Locator, type Page } from '@playwright/test';
import { openCollectionRowsFromSettings } from './collection-rows-fixture';
import { defaultSeasonalAppearance, rankImage, type HomeCollectionRow, type HomeSeasonalAppearance, type HomeSeasonalArtStyle } from '../../src/home-collection-settings';
import { useDesktopLayout } from './layout-fixture';

const editor = (page: Page) => page.getByRole('dialog', { name: 'Customize Home rows', exact: true });
const preview = (page: Page) => editor(page).getByRole('complementary', { name: 'Home row preview', exact: true });
const rankStyle = (page: Page) => editor(page).getByRole('combobox', { name: 'Rank number style', exact: true });
const homeRow = (page: Page, id: string) => page.locator(`#homeTab [data-home-row="${id}"]`);
const base = (id: string, extra: Partial<HomeCollectionRow> = {}): HomeCollectionRow => ({ id, kind: 'items', title: id,
  collectionIds: ['collection-coast'], ranked: true, placement: 'start', itemSort: 'collection', itemOrder: [], ...extra });

async function fixture(page: Page, appearance: Partial<HomeSeasonalAppearance> = {}) {
  const settings = { version: 1, rows: [base('Regular'), base('seasonal', { kind: 'seasonal', title: '', collectionIds: [], ranked: false, children: [
    base('Seasonal', { season: { start: '01-01', end: '12-31' }, appearance: { ...defaultSeasonalAppearance('halloween'), expansion: 'none', background: 'none', reveal: 'none', ...appearance } }),
    base('Collection choices', { kind: 'collections', ranked: false, season: { start: '01-01', end: '12-31' }, appearance: defaultSeasonalAppearance('halloween') }),
  ] })] };
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(settings => {
    const key = `jellyfin-cinema.home-collections.v1:${encodeURIComponent(location.origin)}:demo`;
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(settings));
  }, settings);
  await page.route('**/dist/demo.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\n(()=>{
      const api=window.TvItemLayoutDemo.api,members=api.getCollectionItems;
      api.getCollectionItems=async id=>{const found=await members(id);return id==='collection-coast'?Array.from({length:12},(_,i)=>({...found[i%found.length],Id:'rank-film-'+i,Name:'Rank film '+(i+1)})):found;};
    })();` });
  });
  await page.goto('/?featured=0&layout=tv#/home');
  await expect(homeRow(page, 'Seasonal').locator('.tvl-home-row-card')).toHaveCount(12);
  await expect(page.locator('#homeTab')).not.toHaveClass(/tvl-home-initial-loading/);
}

async function openEditor(page: Page, title = 'Seasonal') {
  await useDesktopLayout(page);
  await openCollectionRowsFromSettings(page);
  await expect(editor(page).getByRole('button', { name: 'Save rows', exact: true })).toBeEnabled();
  await editor(page).locator('[data-editor-row="seasonal"]').click();
  await editor(page).getByRole('button', { name: `Edit ${title}`, exact: true }).click();
  await editor(page).getByRole('button', { name: 'Appearance', exact: true }).click();
}
async function savedAppearance(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem(`jellyfin-cinema.home-collections.v1:${encodeURIComponent(location.origin)}:demo`)!).rows[1].children[0].appearance);
}

test('rank artwork follows frames by default, supports independent choices, and survives Save and reload', async ({ page }) => {
  await fixture(page); await openEditor(page);
  await expect(rankStyle(page)).toHaveValue('match');
  const firstNumber = preview(page).locator('.tvl-home-rank').first();
  const illustrated = await firstNumber.getAttribute('src');
  await editor(page).getByRole('combobox', { name: 'Frame style', exact: true }).selectOption('storybook');
  await expect(firstNumber).not.toHaveAttribute('src', illustrated!);
  const family = await firstNumber.getAttribute('src');
  await rankStyle(page).selectOption('standard');
  await expect(firstNumber).toHaveAttribute('src', rankImage(1));
  await rankStyle(page).selectOption('photoreal');
  const textured = await firstNumber.getAttribute('src');
  expect(textured).not.toBe(family);
  await editor(page).getByRole('combobox', { name: 'Frame style', exact: true }).selectOption('nightmare');
  await expect(firstNumber).toHaveAttribute('src', textured!);
  await editor(page).getByRole('button', { name: 'Save rows', exact: true }).click();
  expect(await savedAppearance(page)).toMatchObject({ rankStyle: 'photoreal', frameStyle: 'nightmare' });
  await page.reload(); await openEditor(page);
  await expect(rankStyle(page)).toHaveValue('photoreal');
  await expect(firstNumber).toHaveAttribute('src', textured!);
  await rankStyle(page).selectOption('match');
  await expect(firstNumber).not.toHaveAttribute('src', textured!);
  await editor(page).getByRole('button', { name: 'Save rows', exact: true }).click();
  expect(await savedAppearance(page)).not.toHaveProperty('rankStyle');
});

test('rank choices survive turning ranks off, Christmas clears Nightmare, and Normal restores standard artwork', async ({ page }) => {
  await fixture(page, { rankStyle: 'nightmare' }); await openEditor(page);
  await expect(rankStyle(page)).toHaveValue('nightmare');
  await editor(page).getByRole('button', { name: 'Content', exact: true }).click();
  await editor(page).getByRole('button', { name: 'Ranked artwork', exact: true }).click();
  await editor(page).getByRole('button', { name: 'Appearance', exact: true }).click();
  await expect(rankStyle(page)).toHaveCount(0);
  await expect(editor(page)).toContainText('Enable Ranked artwork in Content');
  await expect(preview(page).locator('.tvl-home-rank')).toHaveCount(0);
  await editor(page).getByRole('button', { name: 'Content', exact: true }).click();
  await editor(page).getByRole('button', { name: 'Ranked artwork', exact: true }).click();
  await editor(page).getByRole('button', { name: 'Appearance', exact: true }).click();
  await expect(rankStyle(page)).toHaveValue('nightmare');
  await editor(page).getByRole('button', { name: 'Christmas', exact: true }).click();
  await expect(rankStyle(page)).toHaveValue('match');
  await expect(rankStyle(page).locator('option[value="nightmare"]')).toHaveCount(0);
  await expect(preview(page).locator('.tvl-home-rank').first()).not.toHaveAttribute('src', rankImage(1));
  await rankStyle(page).selectOption('storybook');
  await editor(page).getByRole('button', { name: 'Normal', exact: true }).click();
  await expect(rankStyle(page)).toHaveCount(0);
  await expect(preview(page).locator('.tvl-home-rank').first()).toHaveAttribute('src', rankImage(1));
  await editor(page).getByRole('button', { name: 'Save rows', exact: true }).click();
  expect(await savedAppearance(page)).toBeUndefined();
});

test('rank controls are absent from seasonal collections and ordinary ranked rows', async ({ page }) => {
  await fixture(page); await openEditor(page, 'Collection choices');
  await expect(rankStyle(page)).toHaveCount(0);
  await expect(editor(page).getByText('Enable Ranked artwork in Content to theme the rank numbers.', { exact: true })).toHaveCount(0);
  await editor(page).locator('[data-editor-row]').filter({ hasText: 'Regular' }).click();
  await expect(editor(page).getByRole('button', { name: 'Appearance', exact: true })).toHaveCount(0);
  await expect(preview(page).locator('.tvl-home-rank').first()).toHaveAttribute('src', rankImage(1));
});

async function visibleNumber(number: Locator) {
  return number.evaluate(async node => {
    const image = node as HTMLImageElement; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const halves = [0, 0]; let coloured = 0;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4;
      if (pixels[i + 3] < 128) continue;
      halves[x < canvas.width / 2 ? 0 : 1]++;
      if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) - Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) > 30) coloured++;
    }
    return { width: canvas.width, height: canvas.height, halves, coloured };
  });
}

for (const theme of ['halloween', 'christmas'] as const) {
  const styles: HomeSeasonalArtStyle[] = theme === 'halloween' ? ['classic', 'storybook', 'photoreal', 'nightmare'] : ['classic', 'storybook', 'photoreal'];
  for (const style of styles) test(`${theme} ${style} ranks render beside cards, match the editor, and preserve TV focus geometry`, async ({ page }) => {
    await fixture(page, { theme, rankStyle: style, frame: false });
    const cards = homeRow(page, 'Seasonal').locator('.tvl-home-row-card');
    const regularCards = homeRow(page, 'Regular').locator('.tvl-home-row-card');
    const rankTen = cards.nth(9).locator('.tvl-home-rank');
    const source = await rankTen.getAttribute('src');
    expect(source).not.toBe(rankImage(10));
    await expect(rankTen).toHaveAttribute('aria-hidden', 'true');
    await expect(cards.nth(9)).toHaveAttribute('aria-label', 'Rank 10: Rank film 10');
    const ink = await visibleNumber(rankTen);
    expect(ink.width).toBeGreaterThan(ink.height);
    expect(ink.halves[0]).toBeGreaterThan(100);
    expect(ink.halves[1]).toBeGreaterThan(100);
    expect(ink.coloured).toBeGreaterThan(100);
    const dimensions = async (card: Locator) => card.evaluate(node => {
      const art = node.querySelector('.tvl-home-row-art')!.getBoundingClientRect(), rank = node.querySelector('.tvl-home-rank')!.getBoundingClientRect();
      return { cardWidth: node.getBoundingClientRect().width, artWidth: art.width, artHeight: art.height, rankWidth: rank.width, rankHeight: rank.height };
    });
    const before = await dimensions(cards.nth(9));
    expect(before).toEqual(await dimensions(regularCards.nth(9)));
    await cards.nth(9).focus();
    await expect(cards.nth(9)).toBeFocused();
    expect(await dimensions(cards.nth(9))).toEqual(before);
    await expect(cards.nth(9).locator('.tvl-home-row-art')).toHaveCSS('outline-width', '2px');
    await expect(cards.nth(9)).toHaveCSS('outline-style', 'none');
    await page.keyboard.press('ArrowRight'); await expect(cards.nth(10)).toBeFocused();
    await page.keyboard.press('ArrowLeft'); await expect(cards.nth(9)).toBeFocused();
    await openEditor(page);
    await expect(preview(page).locator('.tvl-home-rank').nth(9)).toHaveAttribute('src', source!);
    await page.setViewportSize({ width: 390, height: 900 });
    const draftNumber = preview(page).locator('.tvl-home-rank').nth(9);
    await expect(draftNumber).toHaveAttribute('src', source!);
    expect((await visibleNumber(draftNumber)).halves).toEqual(ink.halves);
    expect(await editor(page).evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  });
}
