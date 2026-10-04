import { expect, test, type Page } from '@playwright/test';
import { parseHomeCollections } from '../../src/home-collection-settings';
import { defaultProviderHomes } from '../../src/provider-settings';

const settings = parseHomeCollections({ version: 1, rows: [{ id: 'weekend', kind: 'items', title: 'Weekend films', collectionIds: ['collection-coast'], ranked: true, placement: 'end' }] });
const row = (page: Page) => page.locator('#homeTab [data-home-row="weekend"]');
const cards = (page: Page) => row(page).locator('.tvl-home-row-card');
const loader = (page: Page) => page.getByRole('status', { name: 'Loading Home', exact: true });

async function fixture(page: Page, empty = false) {
  await page.route('**/dist/demo.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\n(() => {
      const api=window.TvItemLayoutDemo.api, members=api.getCollectionItems, item=api.getItem, list=api.getCollectionList;
      const state=window.__warmHome={settings:${JSON.stringify(empty ? { version: 1, rows: [] } : settings)},providers:${JSON.stringify(defaultProviderHomes())},count:20,
        holdSettings:false,holdMembers:false,holdList:false,pendingSettings:[],pendingMembers:[],pendingList:[],settingsReads:0,memberReads:0,loaderMounts:0,
        releaseList(){this.holdList=false;this.pendingList.splice(0).forEach(resolve=>resolve());},
        releaseSettings(){this.holdSettings=false;this.pendingSettings.splice(0).forEach(resolve=>resolve());},
        releaseMembers(){this.holdMembers=false;this.pendingMembers.splice(0).forEach(resolve=>resolve());}};
      api.homeCollections={isCurrent:()=>true,load:async()=>{state.settingsReads++;if(state.holdSettings)await new Promise(resolve=>state.pendingSettings.push(resolve));return {Revision:'rows',Settings:state.settings};},save:async()=>{throw new Error('Unexpected write');}};
      api.providerHomes={isCurrent:()=>true,load:async()=>{state.settingsReads++;if(state.holdSettings)await new Promise(resolve=>state.pendingSettings.push(resolve));return {Revision:'providers',Settings:state.providers};},save:async()=>{throw new Error('Unexpected write');}};
      api.getCollectionList=async()=>{if(state.holdList)await new Promise(resolve=>state.pendingList.push(resolve));return list();};
      api.getCollectionItems=async id=>{
        const found=await members(id);if(id!=='collection-coast')return found;state.memberReads++;
        if(state.holdMembers)await new Promise(resolve=>state.pendingMembers.push(resolve));
        return Array.from({length:state.count},(_,i)=>({...found[i%found.length],Id:'warm-film-'+i,Name:'Weekend film '+(i+1)}));};
      api.getItem=async id=>id.startsWith('warm-film-')?{...await item('movie-tide'),Id:id,Name:'Weekend film '+(Number(id.slice(10))+1)}:item(id);
    })();` });
  });
  await page.goto('/?featured=0&layout=desktop#/home');
  await expect(cards(page)).toHaveCount(empty ? 0 : 20);
  await expect(page.locator('#homeTab .tvl-provider-tile').first()).toBeVisible(); await expect(loader(page)).toHaveCount(0);
}
async function holdAndLeave(page: Page) {
  const target = cards(page).nth(12); await target.focus();
  await target.evaluate(node => {
    const strip = node.closest('.tvl-home-row-cards')!;
    strip.scrollLeft += node.getBoundingClientRect().left - strip.getBoundingClientRect().left - 100;
    window.scrollTo(0, node.getBoundingClientRect().top + window.scrollY - 220);
  });
  const saved = await position(page);
  await page.evaluate(() => { const state=(window as any).__warmHome; state.holdSettings=true; state.holdMembers=true; });
  await page.keyboard.press('Enter'); await expect(page.getByRole('dialog', { name: 'Weekend film 13 details', exact: true })).toBeVisible();
  await page.evaluate(() => {
    const state=(window as any).__warmHome;
    new MutationObserver(records => {
      records.forEach(record => record.addedNodes.forEach(node => {
        if (node instanceof Element && (node.matches('.tvl-home-loading-status') || node.querySelector('.tvl-home-loading-status'))) state.loaderMounts++;
      }));
      const returned=document.querySelector<HTMLElement>('#homeTab [data-home-row="weekend"] .tvl-home-row-card');
      if (state.returnStarted !== undefined && state.returnReady === undefined && returned?.getClientRects().length
        && getComputedStyle(returned).visibility === 'visible') state.returnReady=performance.now()-state.returnStarted;
    }).observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['class','hidden','style'] });
  });
  return saved;
}
async function position(page: Page) {
  return page.evaluate(() => ({
    vertical: document.scrollingElement!.scrollTop,
    horizontal: document.querySelector('#homeTab [data-home-row="weekend"] .tvl-home-row-cards')?.scrollLeft || 0,
    focus: (document.activeElement as HTMLElement).dataset.focusId
  }));
}
async function returnHome(page: Page) {
  await page.evaluate(() => { (window as any).__warmHome.returnStarted=performance.now(); });
  await page.goBack();
}
async function expectWarm(page: Page) {
  await expect(cards(page)).toHaveCount(20, { timeout: 1_000 });
  await expect(row(page)).toBeVisible(); await expect(loader(page)).toHaveCount(0);
  await expect(page.locator('#homeTab')).not.toHaveClass(/tvl-home-initial-loading/);
  expect(await page.evaluate(() => (window as any).__warmHome.loaderMounts)).toBe(0);
  const elapsed = await page.evaluate(() => (window as any).__warmHome.returnReady as number);
  expect(elapsed).toBeLessThan(1_000);
  await test.info().attach('warm-return-ms', { body: String(elapsed), contentType: 'text/plain' });
}
async function release(page: Page) {
  await page.evaluate(() => { const state=(window as any).__warmHome; state.releaseSettings(); state.releaseMembers(); });
}

test('Back reuses cached rows immediately while both account settings and membership refresh are held', async ({ page }) => {
  await fixture(page); const saved = await holdAndLeave(page);
  expect(saved.vertical).toBeGreaterThan(500); expect(saved.horizontal).toBeGreaterThan(1500);
  await returnHome(page); await expectWarm(page);
  await expect.poll(() => page.evaluate(() => (window as any).__warmHome.pendingSettings.length)).toBeGreaterThan(0);
  await expect.poll(() => position(page)).toEqual(saved);
  await release(page); await expect(cards(page)).toHaveCount(20);
  await expect.poll(() => position(page)).toEqual(saved); await expect(loader(page)).toHaveCount(0);
});

test('warm Home applies new settings and members in the background without losing the returned card or scroll', async ({ page }) => {
  await fixture(page); const saved = await holdAndLeave(page);
  await page.evaluate(() => {
    const state=(window as any).__warmHome;
    state.settings={...state.settings,rows:state.settings.rows.map((row: any)=>({...row,title:'Fresh weekend films'}))};
    state.count=21;
  });
  await returnHome(page); await expectWarm(page); await expect.poll(() => position(page)).toEqual(saved);
  await page.evaluate(() => (window as any).__warmHome.releaseSettings());
  await expect.poll(() => page.evaluate(() => (window as any).__warmHome.pendingMembers.length)).toBeGreaterThan(0);
  await expect(cards(page)).toHaveCount(20); await expect(loader(page)).toHaveCount(0);
  await page.evaluate(() => (window as any).__warmHome.releaseMembers());
  await expect(row(page)).toHaveAttribute('aria-label', 'Fresh weekend films'); await expect(cards(page)).toHaveCount(21);
  await expect.poll(() => position(page)).toEqual(saved); await expect(loader(page)).toHaveCount(0);
});

test('another account cannot reuse the first account’s warm rows while its own preferences are pending', async ({ page }) => {
  await fixture(page); await holdAndLeave(page);
  await page.evaluate(() => {
    const state=(window as any).__warmHome;
    state.settings={version:1,rows:[]};state.providers={...state.providers,enabled:false};
    window.TvItemLayoutDemo!.api.userId='kids';location.hash='/home';
  });
  await expect.poll(() => page.evaluate(() => (window as any).__warmHome.pendingSettings.length)).toBeGreaterThan(0);
  await expect(row(page)).toHaveCount(0); await expect(loader(page)).toBeVisible();
  await release(page); await expect(loader(page)).toHaveCount(0);
  await expect(row(page)).toHaveCount(0); await expect(page.locator('#homeTab .tvl-provider-tile')).toHaveCount(0);
});

for (const savedLocally of [true, false]) test(`adding the first collection ${savedLocally ? 'on this device' : 'on another device'} leaves cached service tiles usable while its catalogue loads`, async ({ page }) => {
  await fixture(page, true);
  await page.locator('#homeTab [aria-label="Latest in Movies"] button').first().click();
  await expect(page.getByRole('dialog', { name: / details$/ })).toBeVisible();
  await page.evaluate(({ settings, savedLocally }) => {
    const state=(window as any).__warmHome; state.settings=settings; state.holdList=true;
    // Same-device saves update the local account cache. Another device's save
    // arrives only through the preferences read that runs during warm return.
    if (savedLocally) {
      const key=`jellyfin-cinema.home-collections.v1:${encodeURIComponent(location.origin)}:demo`;
      localStorage.setItem(key,JSON.stringify(settings));
      localStorage.setItem(key+':synced',JSON.stringify({Revision:'rows-saved',Settings:settings}));
    }
    new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{
      if(node instanceof Element&&(node.matches('.tvl-home-loading-status')||node.querySelector('.tvl-home-loading-status')))state.loaderMounts++;
    }))).observe(document.body,{childList:true,subtree:true});
  }, { settings, savedLocally });
  await page.goBack();
  await expect.poll(() => page.evaluate(() => (window as any).__warmHome.pendingList.length)).toBeGreaterThan(0);
  await expect(page.locator('#homeTab .tvl-provider-tile').first()).toBeVisible();
  await expect(loader(page)).toHaveCount(0); await expect(page.locator('#homeTab')).not.toHaveClass(/tvl-home-initial-loading/);
  expect(await page.evaluate(() => (window as any).__warmHome.loaderMounts)).toBe(0);
  await page.evaluate(() => (window as any).__warmHome.releaseList());
  await expect(cards(page)).toHaveCount(20); await expect(loader(page)).toHaveCount(0);
});

for (const userInput of [false, true]) test(userInput
  ? 'late native viewshow preserves a new remote selection made after the cached Home return'
  : 'late native autofocus and viewshow restore the cached collection card and scroll', async ({ page }) => {
  await fixture(page); const saved = await holdAndLeave(page);
  await returnHome(page); await expectWarm(page); await expect.poll(() => position(page)).toEqual(saved);
  let expected = saved;
  if (userInput) {
    await page.keyboard.press('ArrowRight'); await expect(cards(page).nth(13)).toBeFocused();
    expected = await position(page); expect(expected.focus).not.toBe(saved.focus);
  }
  await page.evaluate(userInput => {
    const host = document.querySelector<HTMLElement>('#indexPage')!;
    if (!userInput) {
      // Native viewManager restores its first control after unhide when the
      // previously focused custom node was replaced during the warm rebuild.
      host.querySelector<HTMLElement>('[aria-label="My Media"] button')!.focus();
      window.scrollTo(0,0);
    }
    host.dispatchEvent(new CustomEvent('viewshow', { bubbles: true }));
  }, userInput);
  await expect.poll(() => position(page)).toEqual(expected); await expect(loader(page)).toHaveCount(0);
  await release(page); await expect.poll(() => position(page)).toEqual(expected);
});

test('warm native rebuild reveals native, streaming and collection rows together without animation or waiting for background data', async ({ page }) => {
  await fixture(page); await holdAndLeave(page);
  await page.evaluate(() => {
    const state=(window as any).__warmHome, host=document.querySelector('#homeTab')!;
    state.nativeRows=Array.from(host.querySelectorAll<HTMLElement>('.verticalSection'))
      .filter(node=>!node.matches('.tvl-home-collection-row,.tvl-home-provider-row'));
    state.nativeRows.forEach((node: HTMLElement)=>{node.hidden=true;});
    state.nativeBusy=host.querySelector('.sections .itemsContainer')!;
    state.nativeBusy.setAttribute('aria-busy','true');
    state.frames=[];
    const visible=(selector: string)=>{
      const node=document.querySelector<HTMLElement>(selector);
      return !!node?.getClientRects().length && getComputedStyle(node).visibility==='visible';
    };
    const sample=()=>{
      state.frames.push(['#homeTab [aria-label="Latest in Movies"] button','#homeTab [data-home-row="weekend"]','#homeTab .tvl-home-provider-row'].map(visible));
      if(!state.stopFrames)requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await returnHome(page);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))));
  const pendingFrames=await page.evaluate(() => (window as any).__warmHome.frames as boolean[][]);
  expect(pendingFrames.length).toBeGreaterThan(0);
  expect(pendingFrames.filter(frame=>frame.some(Boolean) && !frame.every(Boolean))).toEqual([]);
  await expect(row(page)).toBeHidden(); await expect(page.locator('#homeTab .tvl-provider-tile').first()).toBeHidden();
  await expect(loader(page)).toHaveCount(0);
  await page.evaluate(() => {
    const state=(window as any).__warmHome;
    state.nativeRows.forEach((node: HTMLElement)=>{node.hidden=false;});
    state.nativeBusy.removeAttribute('aria-busy');
  });
  await expect(row(page)).toBeVisible(); await expect(cards(page)).toHaveCount(20);
  await expect(page.locator('#homeTab .tvl-provider-tile').first()).toBeVisible();
  await expect(page.locator('#homeTab [aria-label="Latest in Movies"] button').first()).toBeVisible();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect.poll(() => page.evaluate(() => (window as any).__warmHome.pendingSettings.length)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => (window as any).__warmHome.pendingMembers.length)).toBeGreaterThan(0);
  const observed=await page.evaluate(() => {
    const state=(window as any).__warmHome;state.stopFrames=true;
    return {frames:state.frames as boolean[][],settings:state.pendingSettings.length,members:state.pendingMembers.length,loaderMounts:state.loaderMounts};
  });
  expect(observed.frames.some(frame=>frame.every(Boolean))).toBe(true);
  expect(observed.frames.filter(frame=>frame.some(Boolean) && !frame.every(Boolean))).toEqual([]);
  expect(observed.settings).toBeGreaterThan(0); expect(observed.members).toBeGreaterThan(0); expect(observed.loaderMounts).toBe(0);
  await expect(loader(page)).toHaveCount(0); await release(page);
});

test('an unrelated active global spinner cannot hide a warm Home after its rebuilt native rows settle', async ({ page }) => {
  await fixture(page); await holdAndLeave(page);
  await page.evaluate(() => {
    const state=(window as any).__warmHome, sections=document.querySelector('#homeTab .sections')!;
    const native=document.createElement('section');native.className='verticalSection';native.setAttribute('aria-label','Rebuilt library');
    native.innerHTML='<h2 class="sectionTitle">Rebuilt library</h2><div class="itemsContainer" aria-busy="true"></div>';
    sections.replaceChildren(native);
    state.finishNative=()=>{
      const cards=native.querySelector('.itemsContainer')!;
      const button=document.createElement('button');button.textContent='Rebuilt native movie';cards.append(button);cards.removeAttribute('aria-busy');
    };
    const spinner=document.createElement('div');spinner.className='docspinner mdlSpinnerActive';spinner.id='unrelated-global-spinner';document.body.append(spinner);
    state.nativeFrames=[];
    const shown=(selector: string)=>{const node=document.querySelector<HTMLElement>(selector);return !!node?.getClientRects().length&&getComputedStyle(node).visibility==='visible';};
    const sample=()=>{
      state.nativeFrames.push(['#homeTab [aria-label="Rebuilt library"] button','#homeTab [data-home-row="weekend"]','#homeTab .tvl-home-provider-row'].map(shown));
      if(!state.stopNativeFrames)requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await returnHome(page);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(row(page)).toBeHidden(); await expect(loader(page)).toHaveCount(0);
  await page.evaluate(() => (window as any).__warmHome.finishNative());
  await expect(row(page)).toBeVisible({timeout:1_000}); await expect(cards(page)).toHaveCount(20);
  await expect(page.getByRole('button',{name:'Rebuilt native movie',exact:true})).toBeVisible();
  await expect(page.locator('#homeTab .tvl-provider-tile').first()).toBeVisible();
  await expect(page.locator('#unrelated-global-spinner')).toHaveClass(/mdlSpinnerActive/);
  await expect.poll(() => page.evaluate(() => (window as any).__warmHome.pendingSettings.length)).toBeGreaterThan(0);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const frames=await page.evaluate(() => {const state=(window as any).__warmHome;state.stopNativeFrames=true;return state.nativeFrames as boolean[][];});
  expect(frames.some(frame=>frame.every(Boolean))).toBe(true);
  expect(frames.filter(frame=>frame.some(Boolean)&&!frame.every(Boolean))).toEqual([]);
  expect(await page.evaluate(() => (window as any).__warmHome.loaderMounts)).toBe(0);
  await release(page);
});

test('warm membership refresh waits for paint, uses two requests at a time and cancels queued work when Home closes', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem(`jellyfin-cinema.home-collections.v1:${encodeURIComponent(location.origin)}:demo`,JSON.stringify({version:1,rows:
    Array.from({length:4},(_,i)=>({id:'pool-'+i,kind:'items',title:'Picks '+i,collectionIds:['collection-pool-'+i],ranked:false,placement:'end'}))
  })));
  await page.route('**/dist/demo.js',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:`${await response.text()}\n(()=>{
      const api=window.TvItemLayoutDemo.api,members=api.getCollectionItems;
      const state=window.__warmPool={hold:false,started:[],pending:[],active:0,peak:0,finished:0};
      const saved=JSON.parse(localStorage.getItem('jellyfin-cinema.home-collections.v1:'+encodeURIComponent(location.origin)+':demo'));
      api.homeCollections={isCurrent:()=>true,load:async()=>({Revision:'pool',Settings:saved}),save:async()=>{throw new Error('Unexpected write');}};
      api.getCollectionList=async()=>Array.from({length:4},(_,i)=>({Id:'collection-pool-'+i,Type:'BoxSet',Name:'Pool '+i}));
      api.getCollectionItems=async id=>{
        if(!id.startsWith('collection-pool-')||!state.hold)return members(id.startsWith('collection-pool-')?'collection-coast':id);
        state.started.push(id);state.active++;state.peak=Math.max(state.peak,state.active);
        await new Promise(resolve=>state.pending.push(resolve));
        const result=await members('collection-coast');state.active--;state.finished++;return result;
      };
    })();`});
  });
  await page.goto('/?featured=0&layout=desktop#/home');
  const rows=page.locator('#homeTab [data-home-row^="pool-"]');
  await expect(rows.locator('.tvl-home-row-card')).toHaveCount(8);
  await rows.first().locator('.tvl-home-row-card').first().click();
  await expect(page.getByRole('dialog',{name:'After the Tide details',exact:true})).toBeVisible();
  await page.evaluate(()=>{
    (window as any).__warmPool.hold=true;
    document.querySelector('#homeTab .sections .itemsContainer')!.setAttribute('aria-busy','true');
  });
  await page.goBack();
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())))));
  expect(await page.evaluate(()=>(window as any).__warmPool.started)).toEqual([]);
  // Populated native rows can refresh without hiding the retained Home.
  await expect(rows.first()).toBeVisible();
  await page.evaluate(()=>document.querySelector('#homeTab .sections .itemsContainer')!.removeAttribute('aria-busy'));
  await expect(rows.first()).toBeVisible();await expect(rows.locator('.tvl-home-row-card')).toHaveCount(8);
  await expect.poll(()=>page.evaluate(()=>(window as any).__warmPool.pending.length)).toBe(2);
  expect(await page.evaluate(()=>(window as any).__warmPool.started.length)).toBe(2);
  expect(await page.evaluate(()=>(window as any).__warmPool.peak)).toBe(2);
  await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  expect(await page.evaluate(()=>(window as any).__warmPool.started.length)).toBe(2);
  expect(await page.evaluate(()=>(window as any).__warmPool.peak)).toBe(2);
  await page.evaluate(()=>(window as any).__warmPool.pending.shift()());
  await expect.poll(()=>page.evaluate(()=>(window as any).__warmPool.started.length)).toBe(3);
  expect(await page.evaluate(()=>(window as any).__warmPool.peak)).toBe(2);
  await rows.first().locator('.tvl-home-row-card').first().click();
  await expect(page.getByRole('dialog',{name:'After the Tide details',exact:true})).toBeVisible();
  await page.evaluate(()=>(window as any).__warmPool.pending.splice(0).forEach((resolve:()=>void)=>resolve()));
  await expect.poll(()=>page.evaluate(()=>(window as any).__warmPool.finished)).toBe(3);
  expect(await page.evaluate(()=>(window as any).__warmPool.started.length)).toBe(3);
});
