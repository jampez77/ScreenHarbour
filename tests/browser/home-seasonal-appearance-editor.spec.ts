import { expect, test, type Page } from '@playwright/test';
import { useDesktopLayout } from './layout-fixture';

const editor = (page: Page) => page.getByRole('dialog', { name: 'Customize Home rows', exact: true });
const preview = (page: Page) => editor(page).getByRole('complementary', { name: 'Home row preview', exact: true });

async function openEditor(page: Page) {
  await useDesktopLayout(page);
  await page.evaluate(() => { location.hash = '/list?parentId=library-collections'; });
  await page.getByRole('button', { name: 'Customize Home rows', exact: true }).click();
  await expect(editor(page).getByRole('button', { name: 'Save rows', exact: true })).toBeEnabled();
}
async function addSeason(page: Page) {
  await editor(page).getByRole('button', { name: 'Add seasonal group', exact: true }).click();
  await expect(editor(page).getByRole('button', { name: 'Appearance', exact: true })).toHaveCount(0);
  await editor(page).getByRole('button', { name: 'Add seasonal collection items row', exact: true }).click();
  await editor(page).getByLabel('Row title', { exact: true }).fill('A seasonal cinema');
  await editor(page).getByRole('button', { name: 'Coastal Stories', exact: true }).click();
  await expect(preview(page).locator('.tvl-home-row-card')).toHaveCount(2);
  await editor(page).getByRole('button', { name: 'Appearance', exact: true }).click();
}
async function saved(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem(`jellyfin-cinema.home-collections.v1:${encodeURIComponent(location.origin)}:demo`)!));
}

test('seasonal appearance choices survive Save and reload; Normal restores the unchanged row', async ({ page }) => {
  await page.goto('/?featured=0&layout=desktop#/home'); await openEditor(page); await addSeason(page);
  await expect(editor(page).getByRole('button', { name: 'Normal', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(preview(page).locator('.tvl-home-row-card').first()).not.toHaveAttribute('tabindex');
  await editor(page).getByRole('button', { name: 'Halloween', exact: true }).click();
  await editor(page).getByRole('combobox', { name: 'Background', exact: true }).selectOption('parallax');
  await editor(page).getByRole('combobox', { name: 'Height when focused', exact: true }).selectOption('large');
  await editor(page).getByLabel('Themed item frames', { exact: true }).uncheck();
  await editor(page).getByRole('combobox', { name: 'Item reveal', exact: true }).selectOption('curtains');
  await editor(page).getByRole('button', { name: 'Save rows', exact: true }).click();
  const original = (await saved(page)).rows[0].children[0];
  expect(original.appearance).toEqual({ theme: 'halloween', background: 'parallax', expansion: 'large', frame: false, reveal: 'curtains' });
  await page.reload(); await openEditor(page);
  await editor(page).getByRole('button', { name: 'Edit A seasonal cinema', exact: true }).click();
  await editor(page).getByRole('button', { name: 'Appearance', exact: true }).click();
  await expect(editor(page).getByRole('button', { name: 'Halloween', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(editor(page).getByRole('combobox', { name: 'Background', exact: true })).toHaveValue('parallax');
  await expect(editor(page).getByRole('combobox', { name: 'Height when focused', exact: true })).toHaveValue('large');
  await expect(editor(page).getByLabel('Themed item frames', { exact: true })).not.toBeChecked();
  await expect(editor(page).getByRole('combobox', { name: 'Item reveal', exact: true })).toHaveValue('curtains');
  await editor(page).getByRole('button', { name: 'Christmas', exact: true }).click();
  await expect(editor(page).getByRole('combobox', { name: 'Background', exact: true })).toHaveValue('parallax');
  await editor(page).getByRole('button', { name: 'Normal', exact: true }).click();
  await expect(editor(page).getByRole('combobox', { name: 'Background', exact: true })).toHaveCount(0);
  await expect(preview(page).getByRole('button', { name: 'Focus preview', exact: true })).toHaveCount(0);
  await expect(preview(page).locator('.tvl-home-row-card').first()).not.toHaveAttribute('tabindex');
  await editor(page).getByRole('button', { name: 'Save rows', exact: true }).click();
  const { appearance: _appearance, ...unchanged } = original;
  expect((await saved(page)).rows[0].children[0]).toEqual(unchanged);
});

test('background, focus expansion, frame and reveal can all be independently disabled and cancelled', async ({ page }) => {
  await page.goto('/?featured=0&layout=desktop#/home'); await openEditor(page); await addSeason(page);
  await editor(page).getByRole('button', { name: 'Christmas', exact: true }).click();
  await editor(page).getByRole('combobox', { name: 'Background', exact: true }).selectOption('none');
  await editor(page).getByRole('combobox', { name: 'Height when focused', exact: true }).selectOption('none');
  await editor(page).getByLabel('Themed item frames', { exact: true }).uncheck();
  await editor(page).getByRole('combobox', { name: 'Item reveal', exact: true }).selectOption('none');
  await editor(page).getByRole('button', { name: 'Save rows', exact: true }).click();
  const before = await saved(page);
  expect(before.rows[0].children[0].appearance).toEqual({ theme: 'christmas', background: 'none', expansion: 'none', frame: false, reveal: 'none' });
  await openEditor(page);
  await editor(page).getByRole('button', { name: 'Edit A seasonal cinema', exact: true }).click();
  await editor(page).getByRole('button', { name: 'Appearance', exact: true }).click();
  await editor(page).getByRole('combobox', { name: 'Background', exact: true }).selectOption('static');
  await editor(page).getByRole('combobox', { name: 'Item reveal', exact: true }).selectOption('doors');
  await editor(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await saved(page)).toEqual(before);
});

test('full-screen focus height previews and survives save and reload without changing collection content', async ({ page }) => {
  await page.goto('/?featured=0&layout=desktop#/home'); await openEditor(page); await addSeason(page);
  await editor(page).getByRole('button', { name: 'Halloween', exact: true }).click();
  await editor(page).getByRole('combobox', { name: 'Scenery style', exact: true }).selectOption('nightmare');
  await editor(page).getByRole('combobox', { name: 'Height when focused', exact: true }).selectOption('fullscreen');
  await expect(preview(page).locator('.tvl-home-collection-row')).toHaveAttribute('data-seasonal-expansion', 'fullscreen');
  await expect(editor(page).getByText(/Full screen fills the available screen space and enlarges the title/)).toBeVisible();
  await editor(page).getByRole('button', { name: 'Save rows', exact: true }).click();
  const original = (await saved(page)).rows[0].children[0];
  expect(original.appearance).toMatchObject({ theme: 'halloween', expansion: 'fullscreen', backgroundStyle: 'nightmare' });
  expect(original.collectionIds).toEqual(['collection-coast']);
  await page.reload(); await openEditor(page);
  await editor(page).getByRole('button', { name: 'Edit A seasonal cinema', exact: true }).click();
  await editor(page).getByRole('button', { name: 'Appearance', exact: true }).click();
  await expect(editor(page).getByRole('combobox', { name: 'Height when focused', exact: true })).toHaveValue('fullscreen');
  await expect(preview(page).locator('.tvl-home-collection-row')).toHaveAttribute('data-seasonal-expansion', 'fullscreen');
  await editor(page).getByRole('button', { name: 'Save rows', exact: true }).click();
  expect((await saved(page)).rows[0].children[0]).toEqual(original);
});

test('appearance editor keeps regular rows unchanged and its controls usable at narrow widths', async ({ page }) => {
  await page.goto('/?featured=0&layout=desktop#/home'); await openEditor(page);
  await editor(page).getByRole('button', { name: 'Add collection items row', exact: true }).click();
  await expect(editor(page).getByRole('button', { name: 'Appearance', exact: true })).toHaveCount(0);
  await editor(page).getByRole('button', { name: 'Coastal Stories', exact: true }).click();
  await addSeason(page);
  await editor(page).getByRole('button', { name: 'Christmas', exact: true }).click();
  for (const width of [1440, 800, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await editor(page).evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    const bounds = await preview(page).boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await editor(page).getByRole('combobox', { name: 'Item reveal', exact: true }).selectOption('doors');
    await expect(editor(page).getByRole('combobox', { name: 'Item reveal', exact: true })).toHaveValue('doors');
  }
  await editor(page).locator('[data-editor-row]').filter({ hasText: 'Coastal Stories' }).first().click();
  await expect(editor(page).getByRole('button', { name: 'Appearance', exact: true })).toHaveCount(0);
  await expect(editor(page).getByLabel('Row title', { exact: true })).toBeVisible();
  await expect(preview(page).locator('.tvl-home-row-card').first()).not.toHaveAttribute('tabindex');
});

test('live preview uses real row focus, opening and closing items without navigating away', async ({ page }) => {
  await page.goto('/?featured=0&layout=desktop#/home'); await openEditor(page); await addSeason(page);
  await editor(page).getByRole('button', { name: 'Christmas', exact: true }).click();
  await editor(page).getByRole('combobox', { name: 'Height when focused', exact: true }).selectOption('large');
  for (const reveal of ['doors', 'shutters', 'curtains']) {
    await editor(page).getByRole('combobox', { name: 'Item reveal', exact: true }).selectOption(reveal);
    const row = preview(page).locator('.tvl-home-collection-row');
    const cards = preview(page).locator('.tvl-home-row-card');
    await expect(row).not.toHaveClass(/tvl-seasonal-expanded/);
    await expect(cards.first().locator('.tvl-home-row-caption')).toHaveCSS('opacity', '0');
    const restingHeight = (await row.boundingBox())!.height;
    await preview(page).getByRole('button', { name: 'Focus preview', exact: true }).click();
    await expect(cards.first()).toBeFocused();
    await expect(row).toHaveClass(/tvl-seasonal-expanded/);
    await expect.poll(async () => (await row.boundingBox())!.height).toBeGreaterThan(restingHeight + 30);
    await expect(cards.first().locator('.tvl-home-row-caption')).toHaveCSS('opacity', '1');
    await cards.nth(1).focus();
    await expect(cards.first().locator('.tvl-home-row-caption')).toHaveCSS('opacity', '0');
    await expect(cards.nth(1).locator('.tvl-home-row-caption')).toHaveCSS('opacity', '1');
    await editor(page).getByRole('combobox', { name: 'Height when focused', exact: true }).focus();
    await expect(row).not.toHaveClass(/tvl-seasonal-expanded/);
    await expect.poll(async () => Math.abs((await row.boundingBox())!.height - restingHeight)).toBeLessThan(1);
    await expect(cards.nth(1).locator('.tvl-home-row-caption')).toHaveCSS('opacity', '0');
  }
  await expect(editor(page)).toBeVisible();
  await expect(page).toHaveURL(/#\/list\?parentId=library-collections/);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await editor(page).getByRole('combobox', { name: 'Item reveal', exact: true }).selectOption('doors');
  await editor(page).evaluate(node => { node.scrollTop = 0; });
  await page.screenshot({ path: '/tmp/screenharbour-seasonal-appearance-editor.png' });
});

test('scenery, frame and cover artwork are independent, persist, and never carry Nightmare into Christmas', async ({ page }) => {
  await page.goto('/?featured=0&layout=desktop#/home'); await openEditor(page); await addSeason(page);
  await editor(page).getByRole('button', { name: 'Halloween', exact: true }).click();
  const style = (name: string) => editor(page).getByRole('combobox', { name, exact: true });
  await expect(style('Scenery style')).toHaveValue('classic');
  await expect(style('Frame style')).toHaveValue('classic');
  await expect(style('Door or shutter style')).toHaveCount(0);
  const illustratedBackground = await preview(page).locator('.tvl-seasonal-backdrop').getAttribute('style');
  const illustratedFrame = await preview(page).locator('.tvl-seasonal-frame').first().getAttribute('src');
  await style('Scenery style').selectOption('nightmare');
  await style('Frame style').selectOption('photoreal');
  expect(await preview(page).locator('.tvl-seasonal-backdrop').getAttribute('style')).not.toBe(illustratedBackground);
  expect(await preview(page).locator('.tvl-seasonal-frame').first().getAttribute('src')).not.toBe(illustratedFrame);
  await expect(editor(page).getByText('Nightmare is designed for adult horror collections.', { exact: true })).toHaveCount(1);
  await editor(page).getByRole('combobox', { name: 'Item reveal', exact: true }).selectOption('shutters');
  await style('Door or shutter style').selectOption('storybook');
  await expect(preview(page).locator('.tvl-home-row-card').first()).toHaveAttribute('data-seasonal-reveal', 'shutters');
  await expect.poll(() => preview(page).locator('.tvl-seasonal-frame').first().evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await preview(page).screenshot({ path: '/tmp/screenharbour-seasonal-nightmare-preview.png' });
  await editor(page).getByRole('button', { name: 'Save rows', exact: true }).click();
  expect((await saved(page)).rows[0].children[0].appearance).toMatchObject({
    theme: 'halloween', backgroundStyle: 'nightmare', frameStyle: 'photoreal', coverStyle: 'storybook', reveal: 'shutters',
  });
  await page.reload(); await openEditor(page);
  await editor(page).getByRole('button', { name: 'Edit A seasonal cinema', exact: true }).click();
  await editor(page).getByRole('button', { name: 'Appearance', exact: true }).click();
  await expect(style('Scenery style')).toHaveValue('nightmare');
  await expect(style('Frame style')).toHaveValue('photoreal');
  await expect(style('Door or shutter style')).toHaveValue('storybook');
  await editor(page).getByRole('button', { name: 'Christmas', exact: true }).click();
  await expect(style('Scenery style')).toHaveValue('classic');
  await expect(style('Frame style')).toHaveValue('photoreal');
  await expect(style('Door or shutter style')).toHaveValue('storybook');
  await expect(editor(page).getByText('Nightmare is designed for adult horror collections.', { exact: true })).toHaveCount(0);
  for (const name of ['Scenery style', 'Frame style', 'Door or shutter style']) {
    await expect(style(name).locator('option[value="nightmare"]')).toHaveCount(0);
  }
  await editor(page).getByRole('combobox', { name: 'Background', exact: true }).selectOption('none');
  await expect(style('Scenery style')).toHaveCount(0);
  await editor(page).getByLabel('Themed item frames', { exact: true }).uncheck();
  await expect(style('Frame style')).toHaveCount(0);
  await editor(page).getByRole('combobox', { name: 'Item reveal', exact: true }).selectOption('curtains');
  await expect(style('Door or shutter style')).toHaveCount(0);
  await editor(page).getByRole('button', { name: 'Save rows', exact: true }).click();
  expect((await saved(page)).rows[0].children[0].appearance).not.toHaveProperty('backgroundStyle');
  await openEditor(page);
  await editor(page).getByRole('button', { name: 'Edit A seasonal cinema', exact: true }).click();
  await editor(page).getByRole('button', { name: 'Appearance', exact: true }).click();
  await editor(page).getByRole('combobox', { name: 'Background', exact: true }).selectOption('static');
  await style('Scenery style').selectOption('photoreal');
  await editor(page).getByLabel('Themed item frames', { exact: true }).check();
  await editor(page).getByRole('combobox', { name: 'Item reveal', exact: true }).selectOption('doors');
  await style('Door or shutter style').selectOption('photoreal');
  await expect.poll(() => preview(page).locator('.tvl-seasonal-door-art').first().evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await preview(page).screenshot({ path: '/tmp/screenharbour-seasonal-christmas-photo-preview.png' });
});
