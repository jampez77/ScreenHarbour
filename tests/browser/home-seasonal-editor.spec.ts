import { expect, test, type Page } from '@playwright/test';
import { openCollectionRowsFromSettings } from './collection-rows-fixture';
import { useDesktopLayout } from './layout-fixture';

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Customize Home rows', exact: true });
const preview = (page: Page) => dialog(page).getByRole('complementary', { name: 'Home row preview' });
async function openEditor(page: Page) {
  await useDesktopLayout(page);
  await openCollectionRowsFromSettings(page);
  await expect(dialog(page).getByRole('button', { name: 'Save rows', exact: true })).toBeEnabled();
}
async function dates(page: Page, start: string, end: string) {
  for (const [label, date] of [['Start', start], ['End', end]]) {
    await dialog(page).getByLabel(`${label} month`, { exact: true }).selectOption(String(Number(date.slice(0, 2))));
    await dialog(page).getByLabel(`${label} day`, { exact: true }).selectOption(String(Number(date.slice(3))));
  }
}
async function saved(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem(`jellyfin-cinema.home-collections.v1:${encodeURIComponent(location.origin)}:demo`)!));
}

test('seasonal collection items keep dates, tabs, ranks, shuffle and shared Home position after reload', async ({ page }) => {
  await page.goto('/?featured=0#/home'); await openEditor(page);
  await dialog(page).getByRole('button', { name: 'Add seasonal group', exact: true }).click();
  await expect(dialog(page).getByLabel('Row title', { exact: true })).toHaveCount(0);
  await dialog(page).getByRole('button', { name: 'Home position', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Move to top', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Seasonal rows', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Add seasonal collection items row', exact: true }).click();
  await expect(dialog(page).getByRole('button', { name: 'Home position', exact: true })).toHaveCount(0);
  await dialog(page).getByLabel('Row title', { exact: true }).fill('Halloween'); await dates(page, '10-01', '10-31');
  await dialog(page).getByRole('button', { name: 'Coastal Stories', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Ranked artwork', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Add collection tabs', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Save rows', exact: true }).click();
  await expect(dialog(page).getByRole('status')).toContainText('each tab');
  await dialog(page).getByRole('button', { name: 'Into the Wilderness', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Item order', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Title A–Z', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Shuffle on load', exact: true }).click();
  await expect(preview(page).locator('.tvl-home-rank')).toHaveCount(3);
  await expect(preview(page)).toContainText('1 October – 31 October every year');
  await expect(preview(page)).toContainText('Sample shuffled order');
  await dialog(page).evaluate(node => { node.scrollTop = 0; });
  await page.screenshot({ path: '/tmp/screenharbour-seasonal-editor.png' });
  await dialog(page).getByRole('button', { name: 'Save rows', exact: true }).click();
  const settings = await saved(page), group = settings.rows[0], child = group.children[0];
  expect(group).toMatchObject({ kind: 'seasonal', title: '', placement: 'start' });
  expect(child).toMatchObject({ kind: 'items', title: 'Halloween', ranked: true, shuffle: true, season: { start: '10-01', end: '10-31' } });
  expect(child.tabs.map((tab: any) => [tab.collectionId, tab.itemSort])).toEqual([['collection-coast', 'collection'], ['collection-wilderness', 'title']]);
  await page.reload(); await openEditor(page);
  await page.screenshot({ path: '/tmp/screenharbour-seasonal-group.png' });
  await dialog(page).getByRole('button', { name: 'Edit Halloween', exact: true }).click();
  await expect(dialog(page).getByLabel('Start month', { exact: true })).toHaveValue('10');
  await expect(dialog(page).getByLabel('End day', { exact: true })).toHaveValue('31');
  await dialog(page).getByRole('button', { name: 'Item order', exact: true }).click();
  await expect(dialog(page).getByRole('button', { name: 'Shuffle on load', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('seasonal collections and Watchlist rows can be arranged or removed while an empty group remains editable', async ({ page }) => {
  await page.goto('/?featured=0#/home'); await openEditor(page);
  await dialog(page).getByRole('button', { name: 'Add seasonal group', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Add seasonal collections row', exact: true }).click();
  await dialog(page).getByLabel('Row title', { exact: true }).fill('Christmas'); await dates(page, '12-01', '01-06');
  await dialog(page).getByRole('button', { name: 'Coastal Stories', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Into the Wilderness', exact: true }).click();
  await expect(preview(page).locator('.tvl-home-row-card')).toHaveCount(2);
  await dialog(page).getByRole('button', { name: 'Item order', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Move Coastal Stories later', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Shuffle on load', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Back to seasonal group', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Add seasonal Watchlist row', exact: true }).click();
  await dialog(page).getByLabel('Row title', { exact: true }).fill('Summer picks'); await dates(page, '06-01', '08-31');
  await dialog(page).getByRole('button', { name: 'Back to seasonal group', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Move Summer picks up', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Save rows', exact: true }).click();
  const group = (await saved(page)).rows[0];
  expect(group.children.map((row: any) => row.title)).toEqual(['Summer picks', 'Christmas']);
  expect(group.children[1]).toMatchObject({ collectionIds: ['collection-wilderness', 'collection-coast'], season: { start: '12-01', end: '01-06' }, shuffle: true });
  await openEditor(page);
  await dialog(page).getByRole('button', { name: 'Remove Summer picks', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Remove Christmas', exact: true }).click();
  await expect(dialog(page)).toContainText('Add a row for Halloween');
  await dialog(page).getByRole('button', { name: 'Save rows', exact: true }).click();
  expect((await saved(page)).rows[0].children).toEqual([]);
});

test('seasonal date controls clamp impossible days and child preview remains usable at narrow widths', async ({ page }) => {
  await page.goto('/?featured=0#/home'); await openEditor(page);
  await dialog(page).getByRole('button', { name: 'Add seasonal group', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Add seasonal collection items row', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Coastal Stories', exact: true }).click();
  await dates(page, '01-31', '12-31');
  await dialog(page).getByLabel('Start month', { exact: true }).selectOption('2');
  await expect(dialog(page).getByLabel('Start day', { exact: true })).toHaveValue('29');
  await expect(preview(page)).toContainText('29 February – 31 December every year');
  for (const width of [1440, 800, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await dialog(page).evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    const box = await preview(page).boundingBox(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width);
  }
});

test('ordinary rows also expose shuffle without changing their saved item order', async ({ page }) => {
  await page.goto('/?featured=0#/home'); await openEditor(page);
  await dialog(page).getByRole('button', { name: 'Add collection items row', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Coastal Stories', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Item order', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Move After the Tide later', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Shuffle on load', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Save rows', exact: true }).click();
  expect((await saved(page)).rows[0]).toMatchObject({ itemSort: 'custom', itemOrder: ['movie-blue', 'movie-tide'], shuffle: true });
});
