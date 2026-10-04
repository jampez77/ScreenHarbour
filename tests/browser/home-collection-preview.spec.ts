import { expect, test, type Page } from '@playwright/test';
import { collectionRowsSettingsLink, openCollectionRowsFromSettings } from './collection-rows-fixture';
import { useDesktopLayout } from './layout-fixture';

const editor = (page: Page) => page.getByRole('dialog', { name: 'Customize Home rows', exact: true });
const preview = (page: Page) => editor(page).getByRole('complementary', { name: 'Home row preview', exact: true });
const cards = (page: Page) => preview(page).locator('.tvl-home-row-card');

test('missing collection and item thumbnails stay contained and do not cover editor controls', async ({ page }) => {
  await page.goto('/?featured=0#/mypreferencesmenu');
  await useDesktopLayout(page);
  await expect(collectionRowsSettingsLink(page)).toBeVisible();
  await page.evaluate(() => { window.TvItemLayoutDemo!.api.image = () => null; });
  await openCollectionRowsFromSettings(page);
  await editor(page).getByRole('button', { name: 'Add collection items row', exact: true }).click();
  const contained = (selector: string) => editor(page).locator(selector).evaluateAll(nodes => nodes.every(node => {
    const fallback = getComputedStyle(node, '::before'), bounds = node.getBoundingClientRect();
    return parseFloat(fallback.width) <= bounds.width + 1 && parseFloat(fallback.height) <= bounds.height + 1;
  }));
  await expect(editor(page).locator('.tvl-home-choice-art.tvl-no-art')).toHaveCount(14);
  expect(await contained('.tvl-home-choice-art')).toBe(true);
  await editor(page).getByLabel('Row title', { exact: true }).fill('Visible editor');
  await editor(page).getByRole('button', { name: 'Coastal Stories', exact: true }).click();
  await editor(page).getByRole('button', { name: 'Item order', exact: true }).click();
  await expect(editor(page).locator('.tvl-home-order-art.tvl-no-art')).toHaveCount(2);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await contained('.tvl-home-order-art')).toBe(true);
    await editor(page).getByRole('button', { name: 'Title A–Z', exact: true }).click();
    await expect(editor(page).getByRole('button', { name: 'Title A–Z', exact: true })).toHaveAttribute('aria-pressed', 'true');
  }
  await editor(page).getByRole('button', { name: 'Save rows', exact: true }).click();
  await expect(editor(page)).toHaveCount(0);
});

async function openEditor(page: Page, visitHome = true) {
  await page.goto(visitHome ? '/?featured=0#/home' : '/?featured=0#/mypreferencesmenu');
  await useDesktopLayout(page);
  if (visitHome) {
    await expect(page.locator('#homeTab')).toBeVisible();
  } else {
    // The demo eagerly renders Home even for a direct Settings URL. Model
    // Jellyfin's first visit, where those native sections have not mounted yet.
    await page.evaluate(() => {
      document.querySelector('#homeTab')?.remove();
      localStorage.removeItem(`jellyfin-cinema.home-collections.v1:${encodeURIComponent(location.origin)}:demo:positions`);
    });
  }
  await openCollectionRowsFromSettings(page);
  await expect(editor(page).getByRole('button', { name: 'Save rows', exact: true })).toBeEnabled();
}
async function addItemRow(page: Page) {
  await editor(page).getByRole('button', { name: 'Add collection items row', exact: true }).click();
  await editor(page).getByRole('button', { name: 'Coastal Stories', exact: true }).click();
}
async function ids(page: Page) { return cards(page).evaluateAll(nodes => nodes.map(node => node.getAttribute('data-item-id'))); }

test('new row preview follows the draft title, actual artwork and ranks without saving or navigating', async ({ page }) => {
  await openEditor(page);
  await editor(page).getByRole('button', { name: 'Add collection items row', exact: true }).click();
  await expect(preview(page)).toContainText('Choose a collection to preview its items.');
  await editor(page).getByRole('button', { name: 'Coastal Stories', exact: true }).click();
  await expect(cards(page)).toHaveCount(2);
  await expect(preview(page).locator('.tvl-home-row-title')).toHaveText('Coastal Stories');
  await expect(cards(page).first().locator('.tvl-home-row-art img')).toHaveAttribute('src', /.+/);
  await editor(page).getByLabel('Row title', { exact: true }).fill('Trending tonight');
  await expect(preview(page).locator('.tvl-home-row-title')).toHaveText('Trending tonight');
  await expect(editor(page).getByLabel('Row title', { exact: true })).toBeFocused();
  await editor(page).getByRole('button', { name: 'Ranked artwork', exact: true }).click();
  await expect(cards(page).first()).toHaveAttribute('aria-label', 'Rank 1: After the Tide');
  await expect(preview(page).locator('.tvl-home-rank')).toHaveCount(2);
  await expect(preview(page).locator('.tvl-home-rank').first()).toHaveAttribute('src', /^data:image\/svg\+xml,/);
  expect(await page.evaluate(() => localStorage.getItem(`jellyfin-cinema.home-collections.v1:${encodeURIComponent(location.origin)}:demo`))).toBeNull();
  await cards(page).first().click();
  await expect(editor(page)).toBeVisible(); await expect(page).toHaveURL(/#\/mypreferencesmenu\?cinemaCollections=1$/);
  await expect(cards(page).first()).not.toHaveAttribute('tabindex');
  await editor(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem(`jellyfin-cinema.home-collections.v1:${encodeURIComponent(location.origin)}:demo`))).toBeNull();
});

test('preview matches sorted and manual Home order, ranked artwork, and chosen native position after Save', async ({ page }) => {
  await openEditor(page); await addItemRow(page);
  await editor(page).getByRole('button', { name: 'Ranked artwork', exact: true }).click();
  await editor(page).getByRole('button', { name: 'Item order', exact: true }).click();
  await editor(page).getByRole('button', { name: 'Title A–Z', exact: true }).click();
  await expect.poll(() => ids(page)).toEqual(['movie-blue', 'movie-tide']);
  await editor(page).getByRole('button', { name: 'Move After the Tide earlier', exact: true }).click();
  await expect.poll(() => ids(page)).toEqual(['movie-tide', 'movie-blue']);
  await expect(cards(page).first()).toHaveAttribute('aria-label', 'Rank 1: After the Tide');
  await editor(page).getByRole('button', { name: 'Home position', exact: true }).click();
  await editor(page).getByRole('button', { name: 'Move to top', exact: true }).click();
  await expect(preview(page)).toContainText('Top of Home'); await expect(preview(page)).toContainText('Before My Media');
  await editor(page).getByRole('button', { name: 'Move row down', exact: true }).click();
  await expect(preview(page)).toContainText('After My Media'); await expect(preview(page)).toContainText('Before Continue watching');
  const appearance = await cards(page).evaluateAll(nodes => nodes.map(node => ({ id: node.getAttribute('data-item-id'), label: node.getAttribute('aria-label'), art: node.querySelector('.tvl-home-row-art img')?.getAttribute('src'), rank: node.querySelector('.tvl-home-rank')?.getAttribute('src') })));
  await editor(page).getByRole('button', { name: 'Save rows', exact: true }).click();
  await page.evaluate(() => { location.hash = '/home'; });
  const savedCards = page.locator('#homeTab .tvl-home-row-card'); await expect(savedCards).toHaveCount(2);
  expect(await savedCards.evaluateAll(nodes => nodes.map(node => ({ id: node.getAttribute('data-item-id'), label: node.getAttribute('aria-label'), art: node.querySelector('.tvl-home-row-art img')?.getAttribute('src'), rank: node.querySelector('.tvl-home-rank')?.getAttribute('src') })))).toEqual(appearance);
  expect(await page.locator('#homeTab .verticalSection, #homeTab .tvl-home-collection-row').evaluateAll(nodes => nodes.filter(node => !node.closest('.hide,[hidden]')).map(node => node.getAttribute('aria-label')).slice(0, 4))).toEqual(['Streaming services', 'My Media', 'Coastal Stories', 'Continue watching']);
});

test('collection-card preview follows selection and manual order, with honest uncached Home context', async ({ page }) => {
  await openEditor(page, false);
  await editor(page).getByRole('button', { name: 'Add Collections row', exact: true }).click();
  await expect(preview(page)).toContainText('After existing Home rows');
  await expect(preview(page)).toContainText('Visit Home once to see neighbouring rows.');
  await editor(page).getByRole('button', { name: 'Coastal Stories', exact: true }).click();
  await editor(page).getByRole('button', { name: 'Into the Wilderness', exact: true }).click();
  await expect.poll(() => ids(page)).toEqual(['collection-coast', 'collection-wilderness']);
  await expect(preview(page).locator('.tvl-home-rank')).toHaveCount(0);
  await editor(page).getByRole('button', { name: 'Item order', exact: true }).click();
  await editor(page).getByRole('button', { name: 'Move Into the Wilderness earlier', exact: true }).click();
  await expect.poll(() => ids(page)).toEqual(['collection-wilderness', 'collection-coast']);
});

test('late preview results preserve the title input and caret and cannot overwrite a newly chosen collection', async ({ page }) => {
  await openEditor(page);
  await page.evaluate(() => {
    const api = window.TvItemLayoutDemo!.api, original = api.getCollectionItems;
    api.getCollectionItems = async id => {
      const items = await original(id);
      if (id === 'collection-coast') await new Promise<void>(resolve => { (window as any).__finishPreview = resolve; });
      return items;
    };
  });
  await addItemRow(page); await expect(preview(page)).toContainText('Loading preview…');
  const input = editor(page).getByLabel('Row title', { exact: true }); await input.fill('Tonight’s stories');
  await input.evaluate(node => { (window as any).__originalTitleInput = node; (node as HTMLInputElement).setSelectionRange(4, 4); });
  await expect.poll(() => page.evaluate(() => typeof (window as any).__finishPreview)).toBe('function');
  await page.evaluate(() => (window as any).__finishPreview()); await expect(cards(page)).toHaveCount(2);
  await expect(input).toBeFocused(); await expect(input).toHaveValue('Tonight’s stories');
  expect(await input.evaluate(node => node === (window as any).__originalTitleInput && (node as HTMLInputElement).selectionStart === 4)).toBe(true);
  // A second editor has no cached items. Change collection before the old request completes.
  await editor(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.evaluate(() => { delete (window as any).__finishPreview; });
  await openCollectionRowsFromSettings(page); await addItemRow(page);
  await expect(preview(page)).toContainText('Loading preview…');
  await expect.poll(() => page.evaluate(() => typeof (window as any).__finishPreview)).toBe('function');
  await editor(page).getByRole('button', { name: 'Into the Wilderness', exact: true }).click();
  await expect(cards(page)).toHaveCount(3);
  await page.evaluate(() => (window as any).__finishPreview());
  await expect.poll(() => ids(page)).toEqual(['series-north', 'movie-higher', 'movie-wild']);
  await expect(preview(page).locator('.tvl-home-row-title')).toHaveText('Into the Wilderness');
});

test('preview can retry failed data, preserve missing-art captions and explain empty collections', async ({ page }) => {
  await openEditor(page);
  await page.evaluate(() => {
    let failed = false;
    window.TvItemLayoutDemo!.api.getCollectionItems = async id => {
      if (id !== 'collection-coast') return [];
      if (!failed) { failed = true; throw new Error('offline'); }
      return [{ Id: 'no-art', Name: 'A film without artwork', Type: 'Movie' }];
    };
  });
  await addItemRow(page);
  await expect(preview(page)).toContainText('The preview could not load these collection items.');
  await preview(page).getByRole('button', { name: 'Retry preview', exact: true }).click();
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText('A film without artwork');
  await expect(cards(page).first().locator('.tvl-home-row-art')).toHaveClass(/tvl-no-art/);
  expect(await cards(page).first().locator('.tvl-home-row-art').evaluate(node => {
    const placeholder = getComputedStyle(node, '::before'), bounds = node.getBoundingClientRect();
    return parseFloat(placeholder.width) <= bounds.width && parseFloat(placeholder.height) <= bounds.height;
  })).toBe(true);
  await expect(preview(page)).toBeFocused();
  await editor(page).getByRole('button', { name: 'Into the Wilderness', exact: true }).click();
  await expect(preview(page)).toContainText('This collection is empty. Items added to it will appear here.');
});

test('preview scroll controls work without navigation and responsive editor stays within its viewport', async ({ page }) => {
  await openEditor(page);
  await page.evaluate(() => {
    window.TvItemLayoutDemo!.api.getCollectionItems = async () => Array.from({ length: 65 }, (_, i) => ({ Id: `preview-${i}`, Name: `Film ${i + 1}`, Type: 'Movie' }));
  });
  await addItemRow(page); await expect(cards(page)).toHaveCount(60);
  await expect(preview(page)).toContainText('First 60 of 65 items');
  await preview(page).getByRole('button', { name: 'Next preview items', exact: true }).click();
  expect(await preview(page).locator('.tvl-home-row-cards').evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
  await preview(page).getByRole('button', { name: 'Previous preview items', exact: true }).click();
  expect(await preview(page).locator('.tvl-home-row-cards').evaluate(node => node.scrollLeft)).toBe(0);
  for (const width of [1440, 800, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await editor(page).evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    const box = await preview(page).boundingBox(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width);
  }
  await expect(page).toHaveURL(/#\/mypreferencesmenu\?cinemaCollections=1$/);
});

test('retrying the preview from Item order preserves remote focus after the full order editor updates', async ({ page }) => {
  await openEditor(page);
  await page.evaluate(() => {
    let attempt = 0;
    window.TvItemLayoutDemo!.api.getCollectionItems = async () => {
      if (++attempt === 1) throw new Error('offline');
      return [{ Id: 'no-art', Name: 'Recovered item', Type: 'Movie' }];
    };
  });
  await addItemRow(page);
  await editor(page).getByRole('button', { name: 'Item order', exact: true }).click();
  await preview(page).getByRole('button', { name: 'Retry preview', exact: true }).click();
  await expect(cards(page)).toHaveCount(1);
  await expect(editor(page).locator('[data-ordered-item]')).toHaveCount(1);
  await expect(preview(page)).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  expect(await editor(page).evaluate(node => node.contains(document.activeElement))).toBe(true);
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY');
});
