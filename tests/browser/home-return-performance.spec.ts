import { expect, test, type Page } from '@playwright/test';
import { defaultProviderHomes } from '../../src/provider-settings';

const common = { kind: 'items', collectionIds: ['collection-coast'], ranked: true, placement: 'end', itemSort: 'collection', itemOrder: [] };
const appearance = { theme: 'halloween', background: 'parallax', backgroundStyle: 'nightmare', frame: true,
  frameStyle: 'nightmare', reveal: 'doors', coverStyle: 'nightmare', expansion: 'fullscreen' };
const settings = { version: 1, rows: [
  { ...common, id: 'seasonal', kind: 'seasonal', title: '', children: [
    { ...common, id: 'return-seasonal', title: 'Halloween films', season: { start: '01-01', end: '12-31' }, appearance },
    { ...common, id: 'return-second', title: 'More Halloween films', season: { start: '01-01', end: '12-31' }, appearance },
  ] },
  { ...common, id: 'return-plain', title: 'Film night' },
  { ...common, id: 'return-more', title: 'More films' },
] };
const cards = (page: Page) => page.locator('#homeTab [data-home-row="return-seasonal"] .tvl-home-row-card');

async function fixture(page: Page, shuffle: boolean) {
  const shuffledSettings = { ...settings, rows: settings.rows.map(row => ({ ...row, shuffle,
    ...('children' in row ? { children: row.children.map(child => ({ ...child, shuffle })) } : {}) })) };
  await page.route('**/dist/demo.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\n(() => {
      const api=window.TvItemLayoutDemo.api, members=api.getCollectionItems, image=api.image, item=api.getItem;
      const state=window.__returnPerformance={hold:false,pending:[],reads:0,errors:[],random:0.999,
        release(){this.hold=false;this.pending.splice(0).forEach(resolve=>resolve());}};
      Math.random=()=>state.random;
      const wait=async()=>{state.reads++;if(state.hold)await new Promise(resolve=>state.pending.push(resolve));};
      api.homeCollections={isCurrent:()=>true,load:async()=>{await wait();return{Revision:'rows',Settings:${JSON.stringify(shuffledSettings)}};},save:async()=>{throw new Error('Unexpected write');}};
      api.providerHomes={isCurrent:()=>true,load:async()=>{await wait();return{Revision:'services',Settings:${JSON.stringify(defaultProviderHomes())}};},save:async()=>{throw new Error('Unexpected write');}};
      api.getCollectionItems=async id=>{await wait();const found=await members(id);return id==='collection-coast'
        ?Array.from({length:60},(_,i)=>({...found[i%found.length],Id:'return-film-'+i,Name:'Film '+(i+1)})):found;};
      api.getItem=async id=>id.startsWith('return-film-')?{...await item('movie-tide'),Id:id,Name:'Film '+(Number(id.slice(12))+1)}:item(id);
      api.image=(item,kind)=>image(item.Id.startsWith('return-film-')?{...item,Id:Number(item.Id.slice(12))%2?'movie-blue':'movie-tide'}:item,kind);
    })();` });
  });
  await page.goto('/?featured=0&providers=1&layout=tv#/home');
  await expect(page.locator('#homeTab .tvl-home-row-card')).toHaveCount(240);
  await expect(page.locator('#homeTab')).not.toHaveClass(/tvl-home-initial-loading/);
  await cards(page).nth(12).focus();
  await expect(cards(page).nth(12)).toHaveClass(/tvl-seasonal-item-open/);
  // Finish the entry motion before saving the position from which Back returns.
  await expect.poll(() => page.evaluate(() => document.querySelector('[data-home-row="return-seasonal"]')!.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length)).toBe(0);
  await page.evaluate(() => {
    const state=(window as any).__returnPerformance;
    state.hold=true;state.random=0;
    state.cards=Array.from(document.querySelectorAll('#homeTab .tvl-home-row-card'));
    state.rows=Array.from(document.querySelectorAll('#homeTab [data-home-row]'));
    state.posters=Array.from(document.querySelectorAll('#homeTab .tvl-home-row-card img'));
    state.focus=document.activeElement;
  });
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Film 13 details', exact: true })).toBeVisible();
}

for (const shuffle of [false, true]) for (const nativeRefreshing of [false, true]) test(`warm Back reuses loaded ${shuffle ? 'shuffled ' : ''}seasonal artwork and responds immediately${nativeRefreshing ? ' while populated native rows refresh' : ''}`, async ({ page }) => {
  await fixture(page, shuffle);
  if (nativeRefreshing) await page.evaluate(() => {
    // Native Home refreshes progress after a movie closes but leaves its old
    // cards available. Those populated rows should remain useful during I/O.
    const host=document.querySelector('#homeTab')!;
    (window as any).__returnPerformance.native=host.querySelector('.sections .itemsContainer')!;
    (window as any).__returnPerformance.native.setAttribute('aria-busy','true');
  });
  await page.goBack();
  await expect(cards(page).nth(12)).toBeFocused({ timeout: 1_000 });
  await expect(cards(page).nth(12)).toBeVisible();
  await expect(page.locator('#homeTab')).not.toHaveClass(/tvl-home-initial-loading/);
  await expect(page.locator('.tvl-home-loading-status')).toHaveCount(0);
  await expect(page.locator('#homeTab .tvl-provider-tile').first()).toBeVisible();
  const retained = await page.evaluate(() => {
    const state=(window as any).__returnPerformance;
    return {
      cards:state.cards.every((node: HTMLElement)=>node.isConnected&&document.querySelector('#homeTab')!.contains(node)),
      rows:state.rows.every((node: HTMLElement)=>node.isConnected&&document.querySelector('#homeTab')!.contains(node)),
      posters:state.posters.every((node: HTMLElement)=>node.isConnected&&document.querySelector('#homeTab')!.contains(node)),
      focus:document.activeElement===state.focus,
    };
  });
  expect(retained).toEqual({cards:true,rows:true,posters:true,focus:true});
  // Real remote input must work while both account configuration and collection
  // membership reads are held; the old first-load deadline is 3.5 seconds.
  await page.keyboard.press('ArrowRight');
  await expect(cards(page).nth(13)).toBeFocused();
  await expect.poll(() => page.evaluate(() => (window as any).__returnPerformance.pending.length)).toBeGreaterThan(0);
  if (nativeRefreshing) await page.evaluate(() => (window as any).__returnPerformance.native.removeAttribute('aria-busy'));
  await page.evaluate(() => (window as any).__returnPerformance.release());
  await expect(cards(page).nth(13)).toBeFocused();
  await expect(page.locator('#homeTab .tvl-home-row-card')).toHaveCount(240);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Film 14 details', exact: true })).toBeVisible();
});

test('background metadata updates preserve unaffected artwork and source tabs remain usable across later revisions', async ({ page }) => {
  const saved = { version:1, rows:[
    { ...common, id:'stable-season', kind:'seasonal', title:'', children:[
      { ...common,id:'stable-art',title:'Halloween films',collectionIds:['return-stable'],season:{start:'01-01',end:'12-31'},appearance },
    ] },
    { ...common,id:'stable-tabs',title:'Movies and Shows',collectionIds:['return-tab-movies'],tabs:[
      {id:'movies',label:'Movies',collectionId:'return-tab-movies'},
      {id:'shows',label:'Shows',collectionId:'return-tab-shows'},
    ] },
    { ...common,id:'changed-row',title:'Recently played',collectionIds:['return-changed'] },
  ] };
  await page.route('**/dist/demo.js',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:`${await response.text()}\n(()=>{
      const api=window.TvItemLayoutDemo.api,list=api.getCollectionList,members=api.getCollectionItems;
      const state=window.__returnMetadata={revision:0,reads:0};
      api.homeCollections={isCurrent:()=>true,load:async()=>({Revision:'settings',Settings:${JSON.stringify(saved)}}),save:async()=>{throw Error('Unexpected save');}};
      api.getCollectionList=async()=>{const found=await list();return[...found,...['return-stable','return-tab-movies','return-tab-shows','return-changed'].map(Id=>({...found[0],Id,Name:Id}))];};
      api.getCollectionItems=async id=>{
        state.reads++;if(!id.startsWith('return-'))return members(id);
        const found=await members(id==='return-tab-shows'?'collection-wilderness':'collection-coast');
        if(id==='return-stable')return Array.from({length:60},(_,i)=>({...found[i%found.length],Id:'stable-'+i}));
        return found.map((item,i)=>({...item,...(id==='return-changed'&&i===0?{Name:'Updated film '+state.revision,UserData:{...item.UserData,PlaybackPositionTicks:state.revision*10000000}}:{})}));
      };
    })();`});
  });
  await page.goto('/?featured=0&layout=tv#/home');
  const artwork=page.locator('#homeTab [data-home-row="stable-art"]');
  const tabs=page.locator('#homeTab [data-home-row="stable-tabs"]');
  const changed=page.locator('#homeTab [data-home-row="changed-row"]');
  await expect(artwork.locator('.tvl-home-row-card')).toHaveCount(60);
  await expect(changed.getByRole('button',{name:'Rank 1: Updated film 0',exact:true})).toBeVisible();
  await page.evaluate(()=>{
    const state=(window as any).__returnMetadata;
    state.artwork=Array.from(document.querySelectorAll('[data-home-row="stable-art"] img'));
    state.row=document.querySelector('[data-home-row="stable-art"]');
    state.tabs=document.querySelector('[data-home-row="stable-tabs"]');
  });
  for (const revision of [1,2]) {
    await page.evaluate(revision=>{(window as any).__returnMetadata.revision=revision;window.dispatchEvent(new Event('focus'));},revision);
    await expect(changed.getByRole('button',{name:`Rank 1: Updated film ${revision}`,exact:true})).toBeVisible();
    expect(await page.evaluate(()=>{
      const state=(window as any).__returnMetadata;
      return state.row===document.querySelector('[data-home-row="stable-art"]')
        &&state.tabs===document.querySelector('[data-home-row="stable-tabs"]')
        &&state.artwork.every((node:HTMLElement)=>node.isConnected&&state.row.contains(node));
    })).toBe(true);
    const name=revision===1?'Shows':'Movies';
    await tabs.getByRole('tab',{name,exact:true}).focus();
    await page.keyboard.press('Enter');
    await expect(tabs.getByRole('tab',{name,exact:true})).toHaveAttribute('aria-selected','true');
    await expect(tabs.locator('.tvl-home-row-card')).toHaveCount(revision===1?3:2);
  }
  await tabs.locator('.tvl-home-row-card').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog',{name:'After the Tide details',exact:true})).toBeVisible();
});
