import { expect, test, type Locator, type Page } from '@playwright/test';
import { useDesktopLayout } from './layout-fixture';
import { collectionRowsSettingsLink, openCollectionRowsFromSettings } from './collection-rows-fixture';

const coast = 'collection-coast';
const rowConfig = { version: 1, rows: [
  { id: 'collections', kind: 'collections', title: 'Collections', collectionIds: ['collection-wilderness', coast], ranked: false },
  { id: 'trending', kind: 'items', title: 'Trending Movies', collectionIds: [coast], ranked: true }
] };
const home = (page: Page) => page.locator('#indexPage #homeTab');
const editor = (page: Page) => page.getByRole('dialog', { name: 'Customize Home rows', exact: true });
const row = (page: Page, name: string) => home(page).getByRole('region', { name, exact: true });
const rowItems = (page: Page, name: string) => row(page, name).locator('.tvl-home-row-card');

async function seed(page: Page, config: unknown) {
  await page.addInitScript(config => {
    const key = `jellyfin-cinema.home-collections.v1:${encodeURIComponent(location.origin)}:demo`;
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(config));
  }, config);
}
async function saved(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem(`jellyfin-cinema.home-collections.v1:${encodeURIComponent(location.origin)}:demo`) || 'null'));
}
async function remote(page: Page, command: string) {
  await page.evaluate(command => document.activeElement!.dispatchEvent(new CustomEvent('command', { bubbles: true, cancelable: true, detail: { command } })), command);
}
async function goHome(page: Page) {
  await page.evaluate(() => { location.hash = '/home'; });
  await expect(home(page)).toBeVisible();
}
async function openEditor(page: Page) {
  await useDesktopLayout(page);
  await openCollectionRowsFromSettings(page);
  await expect(editor(page).getByRole('button', { name: 'Save rows', exact: true })).toBeEnabled();
  return editor(page);
}
async function selectRow(dialog: Locator, title: string) {
  await dialog.locator('.tvl-home-row-choice').filter({ hasText: title }).click();
}
async function homeOrder(page: Page) {
  return home(page).locator('.verticalSection, .tvl-home-collection-row').evaluateAll(nodes => nodes.filter(node => !node.closest('.hide,[hidden]')).map(node => node.getAttribute('aria-label')));
}
async function moveBefore(dialog: Locator, nativeLabel: string) {
  const selected = dialog.locator('.tvl-home-position-selected');
  for (let attempt = 0; attempt < 20; attempt++) {
    const next = await selected.evaluate(node => node.nextElementSibling?.querySelector('span')?.textContent || '');
    if (next === nativeLabel) return;
    await dialog.getByRole('button', { name: 'Move row up', exact: true }).click();
  }
  throw new Error(`Could not place selected row before ${nativeLabel}`);
}

test('Settings owns the editor; choose rows, save and restore ranked Home navigation', async ({ page }) => {
  await page.goto('/?featured=0#/home');
  await expect(home(page).getByRole('button', { name: 'Customize Home rows', exact: true })).toHaveCount(0);
  await home(page).getByRole('region', { name: 'My Media', exact: true }).getByRole('button', { name: 'Collections', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Collections', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Customize Home rows', exact: true })).toHaveCount(0);
  const dialog = await openEditor(page);
  await dialog.getByRole('button', { name: 'Add Collections row', exact: true }).click();
  await dialog.getByRole('group', { name: 'Collections row', exact: true }).getByRole('button', { name: 'Coastal Stories', exact: true }).click();
  await dialog.getByRole('button', { name: 'Add collection items row', exact: true }).click();
  await expect(dialog.locator('.tvl-home-editor-row')).toHaveCount(1);
  const members = dialog.getByRole('group', { name: 'Collection items row', exact: true });
  await members.getByLabel('Row title', { exact: true }).fill('Trending Movies');
  await members.getByRole('button', { name: 'Coastal Stories', exact: true }).click();
  await members.getByRole('button', { name: 'Ranked artwork', exact: true }).click();
  await dialog.getByRole('button', { name: 'Save rows', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(collectionRowsSettingsLink(page)).toBeFocused();
  await expect(page).toHaveURL(/#\/mypreferencesmenu$/);
  await goHome(page);
  await expect(rowItems(page, 'Trending Movies')).toHaveCount(2);
  await expect(row(page, 'Trending Movies').locator('.tvl-home-rank')).toHaveCount(2);
  await expect(row(page, 'Trending Movies').locator('.tvl-home-rank').first()).toHaveAttribute('src', /^data:image\/svg\+xml,/);
  await row(page, 'Trending Movies').getByRole('button', { name: 'Rank 1: After the Tide', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(row(page, 'Trending Movies').getByRole('button', { name: 'Rank 2: A Kind of Blue', exact: true })).toBeFocused();
  await page.reload(); await expect(row(page, 'Trending Movies').locator('.tvl-home-rank')).toHaveCount(2);
  const collection = row(page, 'Collections').getByRole('button', { name: 'Coastal Stories', exact: true });
  await collection.click(); await expect(page.getByRole('dialog', { name: 'Coastal Stories collection', exact: true })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(collection).toBeFocused();
});

test('one row editor validates selection, supports remote Select, and Cancel discards changes with focus restored', async ({ page }) => {
  await seed(page, rowConfig); await page.goto('/?featured=0#/home');
  const dialog = await openEditor(page);
  await expect(dialog.locator('.tvl-home-editor-row')).toHaveCount(1);
  await expect(dialog.getByRole('group', { name: 'Collections row', exact: true })).toBeVisible();
  await selectRow(dialog, 'Trending Movies');
  await expect(dialog.locator('.tvl-home-editor-row')).toHaveCount(1);
  await expect(dialog.getByRole('group', { name: 'Collections row', exact: true })).toHaveCount(0);
  const choice = dialog.getByRole('button', { name: 'Into the Wilderness', exact: true });
  await choice.focus(); await remote(page, 'select');
  await expect(choice).toHaveAttribute('aria-pressed', 'true'); await expect(choice).toBeFocused();
  await dialog.getByRole('button', { name: 'Add collection items row', exact: true }).click();
  await dialog.getByRole('button', { name: 'Save rows', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Choose at least one');
  await expect(dialog.getByLabel('Row title', { exact: true })).toBeFocused();
  await remote(page, 'back'); await expect(dialog).toHaveCount(0);
  await expect(collectionRowsSettingsLink(page)).toBeFocused();
  await expect(page).toHaveURL(/#\/mypreferencesmenu$/);
  expect(await saved(page)).toEqual(rowConfig);
  const reopened = await openEditor(page);
  await expect(reopened.locator('.tvl-home-row-choice')).toHaveCount(2);
  await selectRow(reopened, 'Trending Movies');
  await expect(reopened.getByRole('button', { name: 'Coastal Stories', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('manual member order determines numbered artwork after save and reload without changing collection metadata', async ({ page }) => {
  await seed(page, rowConfig); await page.goto('/?featured=0#/home');
  const dialog = await openEditor(page); await selectRow(dialog, 'Trending Movies');
  await dialog.getByRole('button', { name: 'Item order', exact: true }).click();
  await expect(dialog.getByRole('list', { name: 'Items in display order' }).locator('li')).toHaveCount(2);
  for (const [label, first] of [['Title A–Z', 'movie-blue'], ['Title Z–A', 'movie-tide'], ['Newest year first', 'movie-tide'], ['Oldest year first', 'movie-blue'], ['Collection order', 'movie-tide']]) {
    await dialog.getByRole('button', { name: label, exact: true }).click();
    await expect(dialog.locator('[data-ordered-item]').first()).toHaveAttribute('data-ordered-item', first);
  }
  await dialog.getByRole('button', { name: 'Move A Kind of Blue earlier', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Custom order', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByRole('button', { name: 'Move A Kind of Blue later', exact: true })).toBeFocused();
  await dialog.getByRole('button', { name: 'Content', exact: true }).click();
  const selectedCollection = dialog.getByRole('button', { name: 'Coastal Stories', exact: true });
  await expect(selectedCollection).toHaveAttribute('aria-pressed', 'true');
  await selectedCollection.click();
  await dialog.getByRole('button', { name: 'Item order', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Custom order', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.locator('[data-ordered-item]').first()).toHaveAttribute('data-ordered-item', 'movie-blue');
  await dialog.getByRole('button', { name: 'Save rows', exact: true }).click(); await goHome(page);
  await expect(rowItems(page, 'Trending Movies').first()).toHaveAttribute('aria-label', 'Rank 1: A Kind of Blue');
  await expect(rowItems(page, 'Trending Movies').nth(1)).toHaveAttribute('aria-label', 'Rank 2: After the Tide');
  await page.reload(); await expect(rowItems(page, 'Trending Movies').first()).toHaveAttribute('aria-label', 'Rank 1: A Kind of Blue');
  const persisted = (await saved(page)).rows.find((entry: any) => entry.id === 'trending');
  expect(persisted.itemSort).toBe('custom'); expect(persisted.itemOrder).toEqual(['movie-blue', 'movie-tide']);
  expect(await page.evaluate(async () => (await window.TvItemLayoutDemo!.api.getCollectionItems('collection-coast')).map(item => item.Id))).toEqual(['movie-tide', 'movie-blue']);
});

test('position editor discovers cached native rows and places custom rows before Next up and between Latest libraries', async ({ page }) => {
  await seed(page, rowConfig); await page.goto('/?featured=0#/home');
  const dialog = await openEditor(page);
  await expect(page.locator('#indexPage')).toBeHidden();
  await dialog.getByRole('button', { name: 'Home position', exact: true }).click();
  const sequence = dialog.getByRole('list', { name: 'Home row order' });
  await expect(sequence).toContainText('Next up'); await expect(sequence).toContainText('Latest in Movies'); await expect(sequence).toContainText('Latest in TV Shows');
  await moveBefore(dialog, 'Next up');
  await selectRow(dialog, 'Trending Movies'); await moveBefore(dialog, 'Latest in TV Shows');
  await dialog.getByRole('button', { name: 'Save rows', exact: true }).click(); await goHome(page);
  await expect.poll(() => homeOrder(page)).toEqual(['Streaming services', 'My Media', 'Continue watching', 'Continue listening', 'Live TV', 'Collections', 'Next up', 'Latest in Movies', 'Trending Movies', 'Latest in TV Shows', 'Latest in Music']);
  const persisted = (await saved(page)).rows;
  expect(persisted.find((entry: any) => entry.id === 'collections').placement).toBe('native:next up:1');
  expect(persisted.find((entry: any) => entry.id === 'trending').placement).toBe('native:latest in tv shows:1');
  const again = await openEditor(page); await again.getByRole('button', { name: 'Home position', exact: true }).click();
  await again.getByRole('button', { name: 'Move to top', exact: true }).click();
  await expect(sequence.locator('li').first()).toHaveAttribute('data-position-row', 'collections');
  await again.getByRole('button', { name: 'Move to bottom', exact: true }).click();
  await expect(sequence.locator('li').last()).toHaveAttribute('data-position-row', 'collections');
  await again.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await saved(page)).rows).toEqual(persisted);
});

test('inserting and reattaching custom rows preserves native nodes, Featured and their listeners', async ({ page }) => {
  await seed(page, { version: 1, rows: [{ ...rowConfig.rows[0], placement: 'native:next up:1' }] });
  await page.goto('/#/home'); await expect(rowItems(page, 'Collections')).toHaveCount(2);
  await page.evaluate(() => {
    const featured = document.querySelector('#homeTab .ec-root')!;
    const card = document.querySelector('#homeTab [data-home-section="nextup"] .card')!;
    (window as any).__originalHomeNodes = { featured, card };
    (window as any).__nativeClicks = 0;
    card.addEventListener('click', () => { (window as any).__nativeClicks++; });
    const unrelated = document.createElement('div'); document.body.append(unrelated); unrelated.remove();
  });
  expect(await page.evaluate(() => Object.values((window as any).__originalHomeNodes).every((node: any) => node.isConnected))).toBe(true);
  await page.locator('#homeTab .ec-root').getByRole('button', { name: 'Resume', exact: true }).focus(); await page.keyboard.press('ArrowRight');
  await expect(page.locator('#homeTab .ec-root')).toHaveAttribute('data-featured-key', 'ArrowRight');
  await home(page).getByRole('region', { name: 'Next up', exact: true }).locator('.card').first().click();
  expect(await page.evaluate(() => (window as any).__nativeClicks)).toBe(1);
  await expect(page.getByRole('dialog', { name: 'Signal 24 details', exact: true })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(home(page)).toBeVisible();
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('demo-home-settings', { detail: { sections: ['resumeaudio', 'nextup', 'latestmedia'] } })));
  await expect(rowItems(page, 'Collections')).toHaveCount(2);
  await expect(home(page).locator('.ec-root')).toHaveCount(1);
  await expect.poll(() => homeOrder(page)).toEqual(['Streaming services', 'My Media', 'Continue listening', 'Collections', 'Next up', 'Latest in Movies', 'Latest in TV Shows', 'Latest in Music']);
  const native = home(page).getByRole('region', { name: 'Next up', exact: true }).locator('.card').first();
  await native.click(); await expect(page).toHaveURL(/#\/details\?id=episode-signal-1-1/);
  await expect(page.getByRole('dialog', { name: 'Signal 24 details', exact: true })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(native).toBeFocused();
  await page.locator('.skinHeader').getByRole('button', { name: 'Favourites', exact: true }).click(); await expect(row(page, 'Collections')).toBeHidden();
});

test('shared start/native-first and end/missing-anchor positions settle without observer churn', async ({ page }) => {
  const settings = { version: 1, rows: [
    { ...rowConfig.rows[0], id: 'first', title: 'First', placement: 'start' },
    { ...rowConfig.rows[0], id: 'same', title: 'Before media', placement: 'native:my media:1' },
    { ...rowConfig.rows[0], id: 'end', title: 'End', placement: 'end' },
    { ...rowConfig.rows[0], id: 'missing', title: 'Missing anchor', placement: 'native:missing:1' }
  ] };
  await seed(page, settings); await page.goto('/?featured=0&homeSections=smalllibrarytiles,nextup#/home');
  await expect.poll(() => homeOrder(page)).toEqual(['Streaming services', 'First', 'Before media', 'My Media', 'Next up', 'End', 'Missing anchor']);
  const settled = await page.evaluate(async () => {
    let mutations = 0; const host = document.querySelector('#homeTab')!;
    const observer = new MutationObserver(records => { mutations += records.filter(record => record.type === 'childList').length; }); observer.observe(host, { childList: true, subtree: true });
    const marker = document.createElement('span'); document.body.append(marker); marker.remove();
    for (let i = 0; i < 6; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    observer.disconnect(); return mutations;
  });
  expect(settled).toBe(0);
  await page.reload(); await expect.poll(() => homeOrder(page)).toEqual(['Streaming services', 'First', 'Before media', 'My Media', 'Next up', 'End', 'Missing anchor']);
});

test('remote arrows cross native/custom boundaries and skip empty custom rows', async ({ page }) => {
  await seed(page, { version: 1, rows: [
    { ...rowConfig.rows[0], placement: 'native:next up:1' },
    { ...rowConfig.rows[1], id: 'empty', title: 'Empty row', collectionIds: ['missing'], placement: 'native:next up:1' }
  ] });
  await page.goto('/?featured=0&homeSections=resume,nextup#/home');
  const previous = home(page).getByRole('region', { name: 'Continue watching', exact: true }).locator('.card').first();
  const custom = rowItems(page, 'Collections').first();
  const next = home(page).getByRole('region', { name: 'Next up', exact: true }).locator('.card').first();
  await expect(custom).toBeVisible();
  await previous.focus(); await remote(page, 'down'); await expect(custom).toBeFocused();
  await remote(page, 'down'); await expect(next).toBeFocused();
  await page.keyboard.press('ArrowUp'); await expect(custom).toBeFocused();
  await page.keyboard.press('ArrowUp'); await expect(previous).toBeFocused();
  await expect(row(page, 'Empty row')).toContainText('No accessible collections selected');
});

test('moving the 60th item past the displayed boundary retains focus and persists the full order', async ({ page }) => {
  await seed(page, { version: 1, rows: [rowConfig.rows[1]] });
  await page.route('**/dist/demo.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nwindow.TvItemLayoutDemo.api.getCollectionItems=async()=>Array.from({length:62},(_,index)=>({Id:'large-'+(index+1),Type:'Movie',Name:'Film '+String(index+1).padStart(2,'0')}));` });
  });
  await page.goto('/?featured=0#/home');
  const dialog = await openEditor(page); await dialog.getByRole('button', { name: 'Item order', exact: true }).click();
  await expect(dialog.locator('[data-ordered-item]')).toHaveCount(60);
  await dialog.getByRole('button', { name: 'Show more items', exact: true }).click();
  await expect(dialog.locator('[data-ordered-item]')).toHaveCount(62);
  await expect(dialog.getByRole('button', { name: 'Show more items', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Move Film 61 earlier', exact: true })).toBeFocused();
  // Selecting the row again resets the visible page without losing the draft.
  await selectRow(dialog, 'Trending Movies');
  await expect(dialog.locator('[data-ordered-item]')).toHaveCount(60);
  await dialog.getByRole('button', { name: 'Move Film 60 later', exact: true }).click();
  await expect(dialog.locator('[data-ordered-item]')).toHaveCount(61);
  await expect(dialog.locator('[data-ordered-item]').nth(59)).toHaveAttribute('data-ordered-item', 'large-61');
  await expect(dialog.locator('[data-ordered-item]').nth(60)).toHaveAttribute('data-ordered-item', 'large-60');
  await expect(dialog.getByRole('button', { name: 'Move Film 60 later', exact: true })).toBeFocused();
  await dialog.getByRole('button', { name: 'Save rows', exact: true }).click();
  const order = (await saved(page)).rows[0].itemOrder;
  expect(order).toHaveLength(62); expect(order.slice(59, 62)).toEqual(['large-61', 'large-60', 'large-62']);
  await goHome(page); await expect(rowItems(page, 'Trending Movies')).toHaveCount(60);
  await expect(rowItems(page, 'Trending Movies').last()).toHaveAttribute('aria-label', 'Rank 60: Film 61');
  await expect(row(page, 'Trending Movies').getByRole('button', { name: 'View full collection', exact: true })).toBeVisible();
});

for (const intent of ['none', 'arrow', 'command', 'pointer'] as const) {
  test(`background Home refresh after Back respects ${intent === 'none' ? 'the saved selection when there is no new input' : `${intent} input without stealing native focus`}`, async ({ page }) => {
    await seed(page, rowConfig); await page.goto('/?featured=0#/home');
    const previousSelection = row(page, 'Trending Movies').getByRole('button', { name: 'Rank 1: After the Tide', exact: true });
    await previousSelection.click();
    await expect(page.getByRole('dialog', { name: 'After the Tide details', exact: true })).toBeVisible();
    await page.evaluate(() => {
      const api = window.TvItemLayoutDemo!.api, original = api.getCollectionList;
      api.getCollectionList = async (...args) => {
        const collections = await original(...args);
        if (location.hash === '#/home') await new Promise<void>(resolve => { (window as any).__releaseHomeRows = resolve; });
        return collections.map(item => item.Id === 'collection-coast' ? { ...item, Name: 'Refreshed coast collection' } : item);
      };
    });
    await page.keyboard.press('Escape'); await expect(home(page)).toBeVisible();
    await expect.poll(() => page.evaluate(() => typeof (window as any).__releaseHomeRows)).toBe('function');
    await expect(previousSelection).toBeVisible();
    await expect(previousSelection).toBeFocused();
    const nativeCards = home(page).getByRole('region', { name: 'Continue watching', exact: true }).locator('.card');
    const destination = nativeCards.nth(intent === 'arrow' ? 1 : 0);
    if (intent !== 'none') {
      await nativeCards.first().focus();
      if (intent === 'arrow') await page.keyboard.press('ArrowRight');
      else if (intent === 'command') await remote(page, 'right');
      else {
        // Model selecting a native control that stays on Home: preserve the
        // real pointer/focus sequence while suppressing this fixture's link.
        await destination.evaluate(element => element.addEventListener('click', event => { event.preventDefault(); event.stopImmediatePropagation(); }, { capture: true, once: true }));
        await destination.click();
      }
      await expect(destination).toBeFocused();
    }
    await page.evaluate(() => (window as any).__releaseHomeRows());
    await expect(row(page, 'Collections').getByRole('button', { name: 'Refreshed coast collection', exact: true })).toBeVisible();
    await expect(previousSelection).toBeVisible();
    await expect(intent === 'none' ? previousSelection : destination).toBeFocused();
  });
}

test('only accessible collections are fetched and account switches replace the editor without saving drafts', async ({ page }) => {
  await seed(page, { version: 1, rows: [{ ...rowConfig.rows[1], collectionIds: ['not-visible'], title: 'Unavailable' }] });
  await page.goto('/?featured=0#/home');
  await expect(row(page, 'Unavailable')).toContainText('No accessible collections selected');
  const dialog = await openEditor(page);
  await dialog.getByLabel('Row title', { exact: true }).fill('Unsaved secret title');
  await dialog.evaluate(node => { (window as any).__previousAccountEditor = node; });
  await page.evaluate(() => { window.TvItemLayoutDemo!.api.userId = 'other-account'; window.TvItemLayout!.refresh(); });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(node => node !== (window as any).__previousAccountEditor && !(window as any).__previousAccountEditor.isConnected)).toBe(true);
  await expect(dialog.locator('.tvl-home-row-choice')).toHaveCount(0);
  await expect(dialog.getByLabel('Row title', { exact: true })).toHaveCount(0);
  await expect(dialog).not.toContainText('Unsaved secret title');
  await goHome(page); await expect(row(page, 'Unavailable')).toHaveCount(0);
  expect((await saved(page)).rows[0].title).toBe('Unavailable');
  const other = await openEditor(page); await expect(other.locator('.tvl-home-row-choice')).toHaveCount(0);
  await expect(other).not.toContainText('Unsaved secret title');
});
