import { expect, test, type Page } from '@playwright/test';
import { parseHomeCollections } from '../../src/home-collection-settings';
import { useDesktopLayout } from './layout-fixture';

const collections = (page: Page) => page.getByRole('dialog', { name: 'Collections', exact: true });
const launcher = (page: Page) => page.locator('.tvl-settings-collections-link');
const editor = (page: Page) => page.getByRole('dialog', { name: 'Customize Home rows', exact: true });
const saved = (page: Page, user = 'demo') => page.evaluate(user => localStorage.getItem(`jellyfin-cinema.home-collections.v1:${encodeURIComponent(location.origin)}:${user}`), user);
const mainSettings = '#/mypreferencesmenu';
async function openSettings(page: Page, suffix = '') {
  await page.goto(`/?featured=0&layout=desktop${mainSettings}${suffix}`);
  await launcher(page).click();
  await expect(editor(page).getByRole('button', { name: 'Save rows', exact: true })).toBeEnabled();
}
async function draft(page: Page, title = 'Unsaved desktop draft') {
  await editor(page).getByRole('button', { name: 'Add collection items row', exact: true }).click();
  await editor(page).getByLabel('Row title', { exact: true }).fill(title);
  await editor(page).getByRole('button', { name: 'Coastal Stories', exact: true }).click();
}

test('Collections stays browsable without customization and desktop Settings groups Collection rows with the other ScreenHarbour options', async ({ page }) => {
  await page.goto('/?featured=0&layout=tv#/list?parentId=library-collections');
  await expect(collections(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Customize Home rows', exact: true })).toHaveCount(0);
  await collections(page).getByRole('button', { name: 'Coastal Stories', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Coastal Stories collection', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(collections(page).getByRole('button', { name: 'Coastal Stories', exact: true })).toBeFocused();
  await useDesktopLayout(page);
  await expect(page.getByRole('button', { name: 'Customize Home rows', exact: true })).toHaveCount(0);
  await page.evaluate(() => { location.hash = '/mypreferencesmenu'; });
  await expect(launcher(page)).toBeVisible();
  const group = launcher(page).locator('xpath=..');
  await expect(group.locator('.tvl-settings-provider-link')).toBeVisible();
  await expect(group.locator('.tvl-settings-loading-link')).toBeVisible();
  await expect(launcher(page).getByText('Collection rows', { exact: true })).toBeVisible();
  await expect(launcher(page).getByText('Home collections and seasonal rows', { exact: true })).toBeVisible();
  await launcher(page).focus(); await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/mypreferencesmenu\?cinemaCollections=1$/);
  await expect(editor(page)).toBeVisible();
  await editor(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page).toHaveURL(/#\/mypreferencesmenu$/);
  await expect(launcher(page)).toBeFocused();
});

for (const leave of ['Cancel', 'Escape', 'browser Back'] as const) test(`${leave} discards the collection draft and returns to its Settings link with server context intact`, async ({ page }) => {
  await openSettings(page, '?serverId=family-server');
  const params = new URLSearchParams((await page.evaluate(() => location.hash)).split('?')[1]);
  expect(params.get('cinemaCollections')).toBe('1'); expect(params.get('serverId')).toBe('family-server');
  await draft(page);
  if (leave === 'Cancel') await editor(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  else if (leave === 'Escape') await page.keyboard.press('Escape');
  else await page.goBack();
  await expect(editor(page)).toHaveCount(0);
  await expect(page).toHaveURL(/#\/mypreferencesmenu\?serverId=family-server$/);
  await expect(launcher(page)).toBeFocused();
  expect(await saved(page)).toBeNull();
  await launcher(page).click();
  await expect(editor(page).getByRole('button', { name: 'Save rows', exact: true })).toBeEnabled();
  await expect(editor(page).locator('.tvl-home-row-choice')).toHaveCount(0);
});

test('Save from Settings keeps existing seasonal options and collection selections and returns focus to Collection rows', async ({ page }) => {
  const existing = parseHomeCollections({version:1,rows:[
    {id:'family-picks',kind:'items',title:'Family picks',collectionIds:['collection-coast'],ranked:true,placement:'start',shuffle:true,itemSort:'title',itemOrder:[]},
    {id:'seasons',kind:'seasonal',title:'',placement:'end',children:[
      {id:'halloween',kind:'items',title:'Halloween',collectionIds:['collection-wilderness'],ranked:true,shuffle:true,season:{start:'10-01',end:'10-31'},appearance:{theme:'halloween',background:'parallax',backgroundStyle:'nightmare',frame:true,frameStyle:'nightmare',reveal:'doors',coverStyle:'nightmare',expansion:'fullscreen'}},
    ]},
  ]});
  await page.addInitScript(existing=>localStorage.setItem(`jellyfin-cinema.home-collections.v1:${encodeURIComponent(location.origin)}:demo`,JSON.stringify(existing)),existing);
  await openSettings(page);
  await expect(editor(page).getByLabel('Row title', { exact: true })).toHaveValue('Family picks');
  await editor(page).getByLabel('Row title', { exact: true }).fill('Our family picks');
  await editor(page).getByRole('button', { name: 'Save rows', exact: true }).click();
  await expect(editor(page)).toHaveCount(0);
  await expect(page).toHaveURL(/#\/mypreferencesmenu$/);
  await expect(launcher(page)).toBeFocused();
  const expected = {...existing,rows:existing.rows.map((row,index)=>index?row:{...row,title:'Our family picks'})};
  expect(JSON.parse((await saved(page))!)).toEqual(expected);
  await launcher(page).click();
  await expect(editor(page).getByLabel('Row title', { exact: true })).toHaveValue('Our family picks');
});

for (const layout of ['tv', 'mobile']) test(`switching an open desktop editor to ${layout} closes it without saving, including conflicting layout roots`, async ({ page }) => {
  await openSettings(page); await draft(page);
  // Native display-mode changes can briefly leave different classes on each root.
  await page.evaluate(layout=>document.documentElement.classList.add('layout-'+layout),layout);
  await expect(editor(page)).toHaveCount(0);
  await expect(launcher(page)).toHaveCount(0);
  expect(await saved(page)).toBeNull();
  await useDesktopLayout(page);
  await expect(launcher(page)).toBeVisible();
  await launcher(page).click();
  await expect(editor(page).getByRole('button', { name: 'Save rows', exact: true })).toBeEnabled();
  await expect(editor(page).locator('.tvl-home-row-choice')).toHaveCount(0);
});

for (const layout of ['tv', 'mobile']) test(`${layout} does not expose the Settings editor through a direct URL`, async ({ page }) => {
  await page.goto(`/?featured=0&layout=${layout}#/mypreferencesmenu?cinemaCollections=1`);
  await expect(page.locator('#myPreferencesMenuPage')).toBeVisible();
  await expect(editor(page)).toHaveCount(0);
  await expect(launcher(page)).toHaveCount(0);
});

test('a direct editor URL for another profile cannot open current-account collection settings', async ({ page }) => {
  await page.goto('/?featured=0&layout=desktop#/mypreferencesmenu?cinemaCollections=1&userId=someone-else');
  await expect(page.locator('#myPreferencesMenuPage')).toBeVisible();
  await expect(editor(page)).toHaveCount(0);
  await expect(launcher(page)).toHaveCount(0);
  expect(await saved(page)).toBeNull();
});

test('leaving Settings or changing accounts destroys the editor and cannot carry an unsaved draft to another account', async ({ page }) => {
  await openSettings(page); await draft(page);
  const first = await editor(page).elementHandle();
  await page.evaluate(() => { location.hash='/home'; });
  await expect(editor(page)).toHaveCount(0);
  expect(await first!.evaluate(node=>node.isConnected)).toBe(false);
  expect(await saved(page)).toBeNull();
  await page.evaluate(() => { location.hash='/mypreferencesmenu'; });
  await launcher(page).click();
  await expect(editor(page).getByRole('button', { name: 'Save rows', exact: true })).toBeEnabled();
  await draft(page, 'Parents only draft');
  const outgoing = await editor(page).elementHandle();
  await page.evaluate(() => {
    window.TvItemLayoutDemo!.api = {...window.TvItemLayoutDemo!.api,userId:'kids'};
    window.TvItemLayout!.refresh();
  });
  await expect.poll(() => outgoing!.evaluate(node=>node.isConnected)).toBe(false);
  expect(await page.locator('input').evaluateAll(nodes=>nodes.some(node=>node.value==='Parents only draft'))).toBe(false);
  expect(await saved(page)).toBeNull(); expect(await saved(page,'kids')).toBeNull();
  await page.evaluate(() => { location.hash='/mypreferencesmenu'; });
  await expect(launcher(page)).toBeVisible();
  await launcher(page).click();
  await expect(editor(page).getByRole('button', { name: 'Save rows', exact: true })).toBeEnabled();
  await expect(editor(page).locator('.tvl-home-row-choice')).toHaveCount(0);
});

test('a bookmarked editor can cancel while collections load and a late response does not reopen it', async ({ page }) => {
  await page.route('**/dist/demo.js',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:`${await response.text()}\n(()=>{
      const api=window.TvItemLayoutDemo.api,list=api.getCollectionList;
      const state=window.__collectionSettingsLoad={finished:false};
      api.getCollectionList=async()=>{await new Promise(resolve=>{state.release=resolve;});const value=await list();state.finished=true;return value;};
    })();`});
  });
  await page.goto('/?featured=0&layout=desktop#/mypreferencesmenu?cinemaCollections=1&serverId=family-server');
  await expect(editor(page).getByRole('button',{name:'Save rows',exact:true})).toBeDisabled();
  const outgoing=await editor(page).elementHandle();
  await editor(page).getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(page).toHaveURL(/#\/mypreferencesmenu\?serverId=family-server$/);
  await expect(launcher(page)).toBeFocused();
  await page.evaluate(()=>(window as any).__collectionSettingsLoad.release());
  await expect.poll(()=>page.evaluate(()=>(window as any).__collectionSettingsLoad.finished)).toBe(true);
  await expect(editor(page)).toHaveCount(0);
  expect(await outgoing!.evaluate(node=>node.isConnected)).toBe(false);
  expect(await saved(page)).toBeNull();
});
