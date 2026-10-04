import { expect, test, type Page } from '@playwright/test';
import { parseHomeCollections } from '../../src/home-collection-settings';

const common = { kind:'items',collectionIds:['collection-coast'],ranked:true,shuffle:true,placement:'end',itemSort:'collection',itemOrder:[] };
const settings = parseHomeCollections({version:1,rows:[
  {...common,id:'first',title:'First shuffled row'},
  {...common,id:'second',title:'Second shuffled row'},
  {...common,id:'tabs',title:'Shuffled sources',tabs:[
    {id:'movies',label:'Movies',collectionId:'collection-coast',itemSort:'collection',itemOrder:[]},
    {id:'shows',label:'Shows',collectionId:'collection-wilderness',itemSort:'collection',itemOrder:[]},
  ]},
]});
const row = (page:Page,id:string) => page.locator(`#homeTab [data-home-row="${id}"]`);
const cards = (page:Page,id:string) => row(page,id).locator('.tvl-home-row-card');
const item = (page:Page,id:string,itemId:string) => row(page,id).locator(`.tvl-home-row-card[data-item-id="${itemId}"]`);
const ids = (page:Page,id:string) => cards(page,id).evaluateAll(nodes=>nodes.map(node=>(node as HTMLElement).dataset.itemId));
const nativeState = {nativeJellyfin:{scrollTop:64,activeTab:'home'},nativeBackStack:['/movies','/home']};

async function fixture(page:Page,layout:'tv'|'desktop'='tv') {
  await page.route('**/dist/demo.js',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:`${await response.text()}\n(()=>{
      const api=window.TvItemLayoutDemo.api,members=api.getCollectionItems,getItem=api.getItem,image=api.image;
      const state=window.__shuffleReturn={random:.01,ids:Array.from({length:24},(_,i)=>'shuffle-film-'+i),updated:'',memberReads:0,memberCompleted:0,hold:false,pending:[],release(){this.hold=false;this.pending.splice(0).forEach(resolve=>resolve());}};
      Math.random=()=>state.random;
      api.homeCollections={isCurrent:()=>true,load:async()=>({Revision:'shuffle',Settings:${JSON.stringify(settings)}}),save:async()=>{throw Error('Unexpected write');}};
      const film=async id=>({...await getItem('movie-tide'),Id:id,Name:(id==='new-film'?'New film':'Shuffle film '+(Number(id.slice(13))+1))+(state.updated===id?' updated':''),UserData:{Played:false,PlaybackPositionTicks:state.updated===id?18000000000:0}});
      api.getCollectionItems=async id=>{
        if(!['collection-coast','collection-wilderness'].includes(id))return members(id);
        state.memberReads++;if(state.hold)await new Promise(resolve=>state.pending.push(resolve));
        const found=await Promise.all(state.ids.map(film));state.memberCompleted++;return found;
      };
      api.getItem=async id=>id.startsWith('shuffle-film-')||id==='new-film'?film(id):getItem(id);
      api.image=(item,kind)=>image(item.Id.startsWith('shuffle-film-')||item.Id==='new-film'?{...item,Id:'movie-tide'}:item,kind);
    })();`});
  });
  await page.goto(`/?featured=0&layout=${layout}#/home`);
  for (const id of ['first','second','tabs']) await expect(cards(page,id)).toHaveCount(24);
  await expect(page.locator('#homeTab')).not.toHaveClass(/tvl-home-initial-loading/);
  await page.evaluate(nativeState=>history.replaceState({...history.state,...nativeState},'',location.href),nativeState);
}
async function rememberRows(page:Page) {
  await page.evaluate(()=>{
    (window as any).__shuffleReturn.elements=Array.from(document.querySelectorAll('#homeTab [data-home-row],#homeTab .tvl-home-row-card,#homeTab .tvl-home-row-card img'));
  });
  return Promise.all(['first','second','tabs'].map(id=>ids(page,id)));
}
async function retainedRows(page:Page,orders:(string|undefined)[][]) {
  expect(await Promise.all(['first','second','tabs'].map(id=>ids(page,id)))).toEqual(orders);
  expect(await page.evaluate(()=>(window as any).__shuffleReturn.elements.every((node:HTMLElement)=>node.isConnected&&document.querySelector('#homeTab')!.contains(node)))).toBe(true);
  expect(await page.evaluate(()=>history.state)).toMatchObject(nativeState);
}

for (const origin of ['second','tabs','desktop-unfocused'] as const) test(`item Back keeps every shuffle and returns to the exact ${origin} occurrence of a duplicate film`, async ({ page }) => {
  await fixture(page,origin==='desktop-unfocused'?'desktop':'tv');
  const originRow=origin==='second'?'second':'tabs';
  if(originRow==='tabs') {
    await row(page,'tabs').getByRole('tab',{name:'Shows',exact:true}).click();
    await expect(cards(page,'tabs')).toHaveCount(24);
  }
  const selected=item(page,originRow,'shuffle-film-13');
  if(origin==='desktop-unfocused') {
    await item(page,'first','shuffle-film-13').focus();
    // Some desktop browsers activate buttons without focusing them. Keep a
    // different occurrence focused so selection must use the clicked card.
    await selected.evaluate(node=>node.addEventListener('mousedown',event=>event.preventDefault(),{once:true}));
  } else await selected.focus();
  const before=await rememberRows(page);
  await page.evaluate(()=>{(window as any).__shuffleReturn.hold=true;});
  if(origin==='desktop-unfocused') await selected.click(); else await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog',{name:'Shuffle film 14 details',exact:true})).toBeVisible();
  await page.evaluate(()=>{(window as any).__shuffleReturn.random=.999;});
  await page.goBack();
  await expect(selected).toBeFocused();
  if(originRow==='tabs') await expect(row(page,'tabs').getByRole('tab',{name:'Shows',exact:true})).toHaveAttribute('aria-selected','true');
  await retainedRows(page,before);
  await expect.poll(()=>selected.evaluate(node=>{
    const rect=node.getBoundingClientRect(),strip=node.closest('.tvl-home-row-cards')!.getBoundingClientRect();
    return rect.left>=strip.left&&rect.right<=strip.right;
  })).toBe(true);
});

test('repeated item Back keeps the same Home visit while an explicit new Home entry reshuffles it', async ({ page }) => {
  await fixture(page); const before=await rememberRows(page);
  for(const index of [7,13,19]) {
    const selected=item(page,'second',`shuffle-film-${index}`);
    await selected.focus(); await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog',{name:`Shuffle film ${index+1} details`,exact:true})).toBeVisible();
    await page.evaluate(()=>{(window as any).__shuffleReturn.random=.999;});
    await page.goBack(); await expect(selected).toBeFocused();
    await retainedRows(page,before);
  }
  await item(page,'second','shuffle-film-13').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog',{name:'Shuffle film 14 details',exact:true})).toBeVisible();
  // The item-return marker is still pending, but this creates a new Home
  // entry. Matching the old URL alone must not reuse its previous shuffle.
  await page.evaluate(()=>{location.hash='/home';});
  const source=Array.from({length:24},(_,i)=>`shuffle-film-${i}`);
  await expect.poll(()=>ids(page,'second')).toEqual(source);
  expect(await ids(page,'second')).not.toEqual(before[1]);
});

for(const destination of ['mypreferencesmenu','movies']) test(`an ordinary ${destination==='movies'?'library':'Settings'} trip still reshuffles after an earlier item return`, async ({ page }) => {
  await fixture(page); const selected=item(page,'second','shuffle-film-13');
  await selected.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog',{name:'Shuffle film 14 details',exact:true})).toBeVisible();
  await page.goBack(); await expect(selected).toBeFocused();
  await page.evaluate(destination=>{(window as any).__shuffleReturn.random=.999;location.hash='/'+destination;},destination);
  if(destination==='movies') await expect(page.getByRole('dialog',{name:'Movies',exact:true})).toBeVisible();
  else await expect(page.locator('#myPreferencesMenuPage')).toBeVisible();
  await page.goBack();
  await expect.poll(()=>ids(page,'second')).toEqual(Array.from({length:24},(_,i)=>`shuffle-film-${i}`));
});

test('return refresh accepts changed metadata, membership and resume progress without reshuffling surviving items', async ({ page }) => {
  await fixture(page);
  const selected=item(page,'second','shuffle-film-13');await selected.focus();
  const before=await ids(page,'second');
  await page.evaluate(()=>{(window as any).__shuffleReturn.hold=true;});
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog',{name:'Shuffle film 14 details',exact:true})).toBeVisible();
  await page.evaluate(()=>{
    const state=(window as any).__shuffleReturn;state.random=.999;state.updated='shuffle-film-13';
    state.ids=[...state.ids.filter((id:string)=>id!=='shuffle-film-0'),'new-film'];
  });
  await page.goBack();await expect(selected).toBeFocused();
  expect(await ids(page,'second')).toEqual(before);
  await expect.poll(()=>page.evaluate(()=>(window as any).__shuffleReturn.pending.length)).toBeGreaterThan(0);
  await page.evaluate(()=>(window as any).__shuffleReturn.release());
  await expect.poll(()=>ids(page,'second')).toEqual([...before.filter(id=>id!=='shuffle-film-0'),'new-film']);
  await expect(selected).toHaveAttribute('aria-label',/^Rank \d+: Shuffle film 14 updated$/);
  await expect(selected).toBeFocused();
  await page.keyboard.press('Enter');
  const details=page.getByRole('dialog',{name:'Shuffle film 14 updated details',exact:true});
  await expect(details.getByRole('button',{name:'Resume',exact:true})).toBeVisible();
  await expect(details.getByRole('button',{name:'Play from beginning',exact:true})).toBeVisible();
});


test('nested item navigation keeps the Home origin and reopening the same film from another row replaces that origin', async ({ page }) => {
  await fixture(page);const before=await rememberRows(page);
  const first=item(page,'first','shuffle-film-13');
  await first.focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog',{name:'Shuffle film 14 details',exact:true})).toBeVisible();
  await page.evaluate(()=>{(window as any).__shuffleReturn.random=.999;location.hash='/details?id=shuffle-film-5';});
  await expect(page.getByRole('dialog',{name:'Shuffle film 6 details',exact:true})).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog',{name:'Shuffle film 14 details',exact:true})).toBeVisible();
  await page.goBack();await expect(first).toBeFocused();
  await retainedRows(page,before);
  const second=item(page,'second','shuffle-film-13');
  await second.focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog',{name:'Shuffle film 14 details',exact:true})).toBeVisible();
  await page.goBack();await expect(second).toBeFocused();
  await expect(first).not.toBeFocused();
  await retainedRows(page,before);
});
