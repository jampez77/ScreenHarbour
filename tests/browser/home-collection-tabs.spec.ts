import { expect, test, type Page } from '@playwright/test';
import { openCollectionRowsFromSettings } from './collection-rows-fixture';
import { useDesktopLayout } from './layout-fixture';

const config = { version: 1, rows: [{ id: 'platform', kind: 'items', title: 'Trending on Netflix', collectionIds: ['collection-coast'], ranked: true, placement: 'start', itemSort: 'collection', itemOrder: [], tabs: [
  { id: 'movies', label: 'Movies', collectionId: 'collection-coast', itemSort: 'collection', itemOrder: [] },
  { id: 'shows', label: 'Shows', collectionId: 'collection-wilderness', itemSort: 'collection', itemOrder: [] }
] }] };
const homeRow = (page: Page) => page.locator('#homeTab [data-home-row="platform"]');
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Customize Home rows', exact: true });
const preview = (page: Page) => dialog(page).getByRole('complementary', { name: 'Home row preview' });
const editSource = (page: Page) => dialog(page).locator('.tvl-home-editor-row');
async function seed(page: Page) {
  await page.addInitScript(config => localStorage.setItem(`jellyfin-cinema.home-collections.v1:${encodeURIComponent(location.origin)}:demo`,JSON.stringify(config)),config);
}
async function openEditor(page: Page) {
  await useDesktopLayout(page);
  await openCollectionRowsFromSettings(page);
  await expect(dialog(page).getByRole('button',{name:'Save rows',exact:true})).toBeEnabled();
}
async function remote(page: Page, command: string) {
  await page.evaluate(command=>window.dispatchEvent(new CustomEvent('command',{cancelable:true,detail:{command}})),command);
}
async function ids(locator: ReturnType<typeof homeRow>) { return locator.locator('.tvl-home-row-card').evaluateAll(nodes=>nodes.map(node=>(node as HTMLElement).dataset.itemId)); }

test('Movies/Shows switch preserves source order, resets rank and restores selected tab after item Back',async({page})=>{
  await seed(page);await page.goto('/?featured=0#/home');
  await expect(homeRow(page).getByRole('tab',{name:'Movies',exact:true})).toHaveAttribute('aria-selected','true');
  await expect.poll(()=>ids(homeRow(page))).toEqual(['movie-tide','movie-blue']);
  await homeRow(page).getByRole('tab',{name:'Shows',exact:true}).click();
  await expect.poll(()=>ids(homeRow(page))).toEqual(['series-north','movie-higher','movie-wild']);
  await expect(homeRow(page).getByRole('button',{name:'Rank 1: North of Nowhere',exact:true})).toBeVisible();
  await homeRow(page).getByRole('button',{name:'Rank 1: North of Nowhere',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'North of Nowhere details',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(homeRow(page).getByRole('tab',{name:'Shows',exact:true})).toHaveAttribute('aria-selected','true');
  await expect(homeRow(page).getByRole('button',{name:'Rank 1: North of Nowhere',exact:true})).toBeFocused();
});

test('remote navigation moves between source switch, cards and native rows without selecting tabs on mere focus',async({page})=>{
  await seed(page);await page.goto('/?featured=0#/home');
  const movies=homeRow(page).getByRole('tab',{name:'Movies',exact:true}),shows=homeRow(page).getByRole('tab',{name:'Shows',exact:true});
  await movies.focus();await page.keyboard.press('ArrowRight');await expect(shows).toBeFocused();
  await expect(movies).toHaveAttribute('aria-selected','true');await remote(page,'select');
  await expect(shows).toHaveAttribute('aria-selected','true');await expect(homeRow(page).locator('.tvl-home-row-card')).toHaveCount(3);
  await remote(page,'down');await expect(homeRow(page).locator('.tvl-home-row-card').first()).toBeFocused();
  await remote(page,'right');await expect(homeRow(page).locator('.tvl-home-row-card').nth(1)).toBeFocused();
  await remote(page,'up');await expect(shows).toBeFocused();
  await page.keyboard.press('ArrowDown');await expect(homeRow(page).locator('.tvl-home-row-card').first()).toBeFocused();
  await page.keyboard.press('ArrowDown');await expect(page.locator('#homeTab').getByRole('region',{name:'My Media',exact:true}).getByRole('button',{name:'Movies',exact:true})).toBeFocused();
  await page.keyboard.press('ArrowUp');await expect(homeRow(page).locator('.tvl-home-row-card').first()).toBeFocused();
});

test('editor creates collection tabs and preview follows per-tab sorting, labels and tab order before saving',async({page})=>{
  await page.goto('/?featured=0#/home');await openEditor(page);
  await dialog(page).getByRole('button',{name:'Add collection items row',exact:true}).click();
  await dialog(page).getByRole('button',{name:'Coastal Stories',exact:true}).click();
  await dialog(page).getByLabel('Row title',{exact:true}).fill('Netflix');
  await dialog(page).getByRole('button',{name:'Add collection tabs',exact:true}).click();
  await expect(preview(page).getByRole('tab',{name:'Shows',exact:true})).toHaveAttribute('aria-selected','true');
  await dialog(page).getByRole('button',{name:'Save rows',exact:true}).click();
  await expect(dialog(page).getByRole('status')).toContainText('each tab');
  await dialog(page).getByRole('button',{name:'Into the Wilderness',exact:true}).click();
  await expect.poll(()=>ids(preview(page))).toEqual(['series-north','movie-higher','movie-wild']);
  await dialog(page).getByRole('button',{name:'Item order',exact:true}).click();
  await dialog(page).getByRole('button',{name:'Title A–Z',exact:true}).click();
  await expect.poll(()=>ids(preview(page))).toEqual(['movie-higher','series-north','movie-wild']);
  await preview(page).getByRole('tab',{name:'Movies',exact:true}).click();
  await expect.poll(()=>ids(preview(page))).toEqual(['movie-tide','movie-blue']);
  await expect(dialog(page).getByRole('button',{name:'Collection order',exact:true})).toHaveAttribute('aria-pressed','true');
  await dialog(page).getByRole('button',{name:'Content',exact:true}).click();
  await dialog(page).getByLabel('Tab label',{exact:true}).fill('Films');
  await expect(preview(page).getByRole('tab',{name:'Films',exact:true})).toHaveAttribute('aria-selected','true');
  await dialog(page).getByRole('button',{name:'Ranked artwork',exact:true}).click();
  await expect(preview(page).locator('.tvl-home-rank')).toHaveCount(2);
  await dialog(page).getByRole('button',{name:'Move tab right',exact:true}).click();
  await expect(editSource(page).getByRole('tab').first()).toHaveText('Shows');
  await dialog(page).getByRole('button',{name:'Save rows',exact:true}).click();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem(`jellyfin-cinema.home-collections.v1:${encodeURIComponent(location.origin)}:demo`)!));
  expect(saved.rows[0].tabs.map((tab:any)=>[tab.label,tab.itemSort])).toEqual([['Shows','title'],['Films','collection']]);
  await page.evaluate(()=>{location.hash='/home';});
  const home=page.locator('#homeTab .tvl-home-collection-row');
  await expect(home.getByRole('tab',{name:'Shows',exact:true})).toHaveAttribute('aria-selected','true');
  await expect.poll(()=>ids(home)).toEqual(['movie-higher','series-north','movie-wild']);
});

test('an empty or failed source does not hide the platform switch or another populated tab',async({page})=>{
  await seed(page);await page.goto('/?featured=0#/list?parentId=library-collections');
  await page.evaluate(()=>{
    const original=window.TvItemLayoutDemo!.api.getCollectionItems;
    let attempts=0;window.TvItemLayoutDemo!.api.getCollectionItems=async id=>{if(id==='collection-wilderness'){if(!attempts++)throw Error('offline');return [];}return original(id);};
    location.hash='/home';
  });
  await expect(homeRow(page).locator('.tvl-home-row-card')).toHaveCount(2);
  await homeRow(page).getByRole('tab',{name:'Shows',exact:true}).click();
  await expect(homeRow(page)).toContainText('could not be loaded');
  await homeRow(page).getByRole('button',{name:'Retry collection',exact:true}).click();
  await expect(homeRow(page)).toContainText('This collection is empty.');
  await expect(homeRow(page).getByRole('tab',{name:'Shows',exact:true})).toBeFocused();
  await expect(homeRow(page).getByRole('tab')).toHaveCount(2);
  await homeRow(page).getByRole('tab',{name:'Movies',exact:true}).click();await expect(homeRow(page).locator('.tvl-home-row-card')).toHaveCount(2);
});

test('a late retry respects new pointer intent even when it leaves the document body focused',async({page})=>{
  await seed(page);await page.goto('/?featured=0#/list?parentId=library-collections');
  await page.evaluate(()=>{
    const original=window.TvItemLayoutDemo!.api.getCollectionItems;let attempts=0;
    window.TvItemLayoutDemo!.api.getCollectionItems=async id=>{
      if(id==='collection-wilderness') {if(!attempts++)throw Error('offline');await new Promise<void>(resolve=>{(window as any).__finishRetry=resolve;});}return original(id);
    };location.hash='/home';
  });
  await homeRow(page).getByRole('tab',{name:'Shows',exact:true}).click();await homeRow(page).getByRole('button',{name:'Retry collection',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>typeof (window as any).__finishRetry)).toBe('function');
  await page.evaluate(()=>document.body.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})));
  await page.evaluate(()=>(window as any).__finishRetry());await expect(homeRow(page).locator('.tvl-home-row-card')).toHaveCount(3);
  expect(await page.evaluate(()=>document.activeElement===document.body)).toBe(true);
});

test('an unavailable tab clears loading state while a previous source is still pending',async({page})=>{
  const withMissing=structuredClone(config);withMissing.rows[0].tabs.push({id:'missing',label:'Unavailable',collectionId:'gone',itemSort:'collection',itemOrder:[]});
  await page.addInitScript(config=>localStorage.setItem(`jellyfin-cinema.home-collections.v1:${encodeURIComponent(location.origin)}:demo`,JSON.stringify(config)),withMissing);
  await page.goto('/?featured=0#/list?parentId=library-collections');
  await page.evaluate(()=>{
    const original=window.TvItemLayoutDemo!.api.getCollectionItems;
    window.TvItemLayoutDemo!.api.getCollectionItems=async id=>id==='collection-wilderness'?new Promise(()=>{}):original(id);location.hash='/home';
  });
  await homeRow(page).getByRole('tab',{name:'Shows',exact:true}).click();
  await expect(homeRow(page).locator('.tvl-home-row-cards')).toHaveAttribute('aria-busy','true');
  await homeRow(page).getByRole('tab',{name:'Unavailable',exact:true}).click();
  await expect(homeRow(page)).toContainText('No accessible collections selected');
  await expect(homeRow(page).locator('.tvl-home-row-cards')).not.toHaveAttribute('aria-busy','true');
  await homeRow(page).getByRole('tab',{name:'Movies',exact:true}).click();await expect(homeRow(page).locator('.tvl-home-row-card')).toHaveCount(2);
});

test('tabbed editor and matching preview remain within mobile and desktop widths and enforce six tabs',async({page})=>{
  await seed(page);await page.goto('/?featured=0#/home');await openEditor(page);
  await expect(preview(page).locator('.tvl-home-row-card')).toHaveCount(2);
  for(const width of [1440,800,390]){
    await page.setViewportSize({width,height:900});
    expect(await dialog(page).evaluate(node=>node.scrollWidth<=node.clientWidth+1)).toBe(true);
    const box=await preview(page).boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(width);
  }
  await page.setViewportSize({width:1440,height:900});
  await page.screenshot({path:'/tmp/cinema-platform-tabs-editor.png'});
  for(let i=0;i<4;i++)await dialog(page).getByRole('button',{name:'Add tab',exact:true}).click();
  await expect(editSource(page).getByRole('tab')).toHaveCount(6);await expect(dialog(page).getByRole('button',{name:'Add tab',exact:true})).toBeDisabled();
  await dialog(page).getByRole('button',{name:'Remove tab',exact:true}).click();await expect(dialog(page).getByRole('button',{name:'Add tab',exact:true})).toBeEnabled();
});

test('late source responses cannot overwrite a newer selection or steal Home focus',async({page})=>{
  await seed(page);await page.goto('/?featured=0#/list?parentId=library-collections');
  await page.evaluate(()=>{
    const original=window.TvItemLayoutDemo!.api.getCollectionItems;
    window.TvItemLayoutDemo!.api.getCollectionItems=async id=>{const result=await original(id);if(id==='collection-wilderness')await new Promise<void>(resolve=>{(window as any).__finishShows=resolve;});return result;};
    location.hash='/home';
  });
  await expect(homeRow(page).locator('.tvl-home-row-card')).toHaveCount(2);
  await homeRow(page).getByRole('tab',{name:'Shows',exact:true}).click();await expect(homeRow(page)).toContainText('Loading collection');
  await homeRow(page).getByRole('tab',{name:'Movies',exact:true}).click();await expect(homeRow(page).locator('.tvl-home-row-card')).toHaveCount(2);
  await expect.poll(()=>page.evaluate(()=>typeof (window as any).__finishShows)).toBe('function');
  await page.evaluate(()=>(window as any).__finishShows());
  await expect.poll(()=>ids(homeRow(page))).toEqual(['movie-tide','movie-blue']);
  await expect(homeRow(page).getByRole('tab',{name:'Movies',exact:true})).toBeFocused();
});

test('removing a source retains the remaining source order; Cancel leaves stored tabs intact',async({page})=>{
  await seed(page);await page.goto('/?featured=0#/home');await openEditor(page);
  await dialog(page).getByRole('button',{name:'Remove tab',exact:true}).click();
  await expect(preview(page).getByRole('tab')).toHaveCount(0);await expect.poll(()=>ids(preview(page))).toEqual(['series-north','movie-higher','movie-wild']);
  await dialog(page).getByRole('button',{name:'Cancel',exact:true}).click();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem(`jellyfin-cinema.home-collections.v1:${encodeURIComponent(location.origin)}:demo`)!).rows[0].tabs.length)).toBe(2);
});
