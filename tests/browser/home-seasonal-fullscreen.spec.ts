import { expect, test, type Page } from '@playwright/test';

const section = (page: Page) => page.locator('#homeTab [data-home-row="immersive"]');
const cards = (page: Page) => section(page).locator('.tvl-home-row-card');
async function fixture(page: Page, theme = 'halloween', style = 'nightmare', layout = 'tv', title = 'Spooky Season') {
  const base = { kind:'items', title:'Other films', collectionIds:['collection-coast'], ranked:false, placement:'start', itemSort:'collection', itemOrder:[] };
  const settings = {version:1,rows:[{...base,id:'before'},{...base,id:'seasons',kind:'seasonal',title:'',collectionIds:[],children:[
    {...base,id:'immersive',title,season:{start:'01-01',end:'12-31'},appearance:{theme,background:'parallax',backgroundStyle:style,frame:true,frameStyle:style,reveal:'doors',coverStyle:style,expansion:'fullscreen'}}
  ]},{...base,id:'after'}]};
  const errors:string[]=[]; const fonts:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(request.url().endsWith('.woff2')||request.url().includes('.woff2?'))fonts.push(request.url());});
  await page.route('**/dist/demo.js',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:`${await response.text()}\n(()=>{
      const api=window.TvItemLayoutDemo.api,items=api.getCollectionItems,image=api.image;
      api.homeCollections={isCurrent:()=>true,load:async()=>({Revision:'fullscreen',Settings:${JSON.stringify(settings)}}),save:async()=>{throw new Error('Unexpected write')}};
      api.getCollectionItems=async id=>{const found=await items(id);return id==='collection-coast'?Array.from({length:20},(_,i)=>({...found[i%found.length],Id:'immersive-'+i})):found;};
      api.image=(item,kind)=>image(item.Id.startsWith('immersive-')?{...item,Id:Number(item.Id.slice(10))%2?'movie-blue':'movie-tide'}:item,kind);
    })();`});
  });
  await page.goto(`/?featured=0&layout=${layout}#/home`);
  await expect(cards(page)).toHaveCount(20);
  await expect(page.locator('#homeTab')).not.toHaveClass(/tvl-home-initial-loading/);
  await page.locator('#homeTab [data-home-row="before"] .tvl-home-row-card').first().focus();
  return {errors,fonts};
}

for(const layout of ['tv','desktop']) test(`full-screen ${layout} row fits below the header, restores its height and keeps directional navigation`,async({page})=>{
  await page.setViewportSize({width:1280,height:720});
  const audit=await fixture(page,'halloween','nightmare',layout);
  const row=section(page),first=cards(page).first();
  const originalHeight=(await row.boundingBox())!.height;
  const poster=await first.locator('.tvl-home-row-art').boundingBox();
  await first.focus();
  await expect(row).toHaveClass(/tvl-seasonal-expanded/);
  await expect.poll(()=>row.evaluate(node=>node.getBoundingClientRect().height)).toBeGreaterThan(590);
  await expect.poll(()=>row.evaluate(node=>node.getBoundingClientRect().top)).toBeGreaterThanOrEqual(79);
  await expect.poll(()=>row.evaluate(node=>node.getBoundingClientRect().bottom)).toBeLessThanOrEqual(705);
  const title=row.locator('.tvl-seasonal-title-themed');
  await expect(title).toHaveCSS('opacity','1');
  await expect(row.locator('.tvl-seasonal-title-plain')).toHaveCSS('opacity','0');
  await expect.poll(()=>title.evaluate(node=>node.getBoundingClientRect().top)).toBeGreaterThan(79);
  expect(await title.evaluate(node=>getComputedStyle(node).fontFamily)).toContain('Nosifer');
  await expect.poll(()=>audit.fonts.length).toBe(1);
  expect(audit.fonts.every(url=>new URL(url).origin===new URL(page.url()).origin)).toBe(true);
  const focusedPoster=await first.locator('.tvl-home-row-art').boundingBox();
  expect(focusedPoster!.width).toBeCloseTo(poster!.width,1);expect(focusedPoster!.height).toBeCloseTo(poster!.height,1);
  if(layout==='tv'){
    for(let i=0;i<19;i++)await page.keyboard.press('ArrowRight');
    await expect(cards(page).last()).toBeFocused();
    await expect.poll(()=>cards(page).last().evaluate(node=>node.getBoundingClientRect().bottom)).toBeLessThan(705);
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#homeTab [data-home-row="after"] .tvl-home-row-card').last()).toBeFocused();
  }else await page.locator('#homeTab [data-home-row="after"] .tvl-home-row-card').first().focus();
  await expect.poll(async()=>Math.abs((await row.boundingBox())!.height-originalHeight)).toBeLessThan(1);
  await expect(title).toHaveCSS('opacity','0');
  await expect(row.locator('.tvl-seasonal-title-plain')).toHaveCSS('opacity','1');
  expect(audit.errors).toEqual([]);
});

test('full-screen row adapts to viewport changes and honours reduced motion',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.setViewportSize({width:1280,height:720});
  await fixture(page,'christmas','photoreal','tv','Christmas at the Movies');
  await cards(page).first().focus();
  await expect(section(page)).toHaveCSS('transition-duration','0s');
  await expect(section(page).locator('.tvl-seasonal-title-themed')).toHaveCSS('transition-duration','0s');
  await expect.poll(()=>section(page).evaluate(node=>node.getBoundingClientRect().bottom)).toBeLessThanOrEqual(705);
  const before=await section(page).locator('.tvl-seasonal-scene').evaluate(node=>getComputedStyle(node).transform);
  for(let i=0;i<12;i++)await page.keyboard.press('ArrowRight');
  expect(await section(page).locator('.tvl-seasonal-scene').evaluate(node=>getComputedStyle(node).transform)).toBe(before);
  await page.setViewportSize({width:1440,height:900});
  await expect.poll(()=>section(page).evaluate(node=>node.getBoundingClientRect().height)).toBeGreaterThan(760);
  await expect.poll(()=>section(page).evaluate(node=>node.getBoundingClientRect().bottom)).toBeLessThanOrEqual(885);
});

test('long themed titles remain above the cards without escaping the full-screen scene',async({page})=>{
  await page.setViewportSize({width:1280,height:720});
  await fixture(page,'halloween','storybook','tv','Halloween favourites and spooky surprises for a wonderfully magical family night');
  await cards(page).first().focus();
  const title=section(page).locator('.tvl-seasonal-title-themed');
  await expect(title).toHaveCSS('opacity','1');
  await expect.poll(()=>title.evaluate(node=>node.getBoundingClientRect().top)).toBeGreaterThanOrEqual(80);
  const box=await title.boundingBox(),art=await cards(page).first().locator('.tvl-home-row-art').boundingBox();
  expect(box!.y+box!.height).toBeLessThan(art!.y);
  expect(box!.x+box!.width).toBeLessThanOrEqual(1280);
});

test('full-screen headings and navigation work without newer replaceChildren API',async({page})=>{
  await page.addInitScript(()=>{
    for(const prototype of [Element.prototype,Document.prototype,DocumentFragment.prototype])
      Object.defineProperty(prototype,'replaceChildren',{configurable:true,value:undefined});
  });
  const audit=await fixture(page);
  await cards(page).first().focus();
  await expect(section(page)).toHaveClass(/tvl-seasonal-expanded/);
  await expect(section(page).locator('.tvl-seasonal-title-themed')).toHaveCSS('opacity','1');
  await page.keyboard.press('ArrowRight');
  await expect(cards(page).nth(1)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#homeTab [data-home-row="after"] .tvl-home-row-card').nth(1)).toBeFocused();
  await expect(section(page)).not.toHaveClass(/tvl-seasonal-expanded/);
  expect(audit.errors).toEqual([]);
});

for(const [theme,style,font,title] of [
  ['halloween','classic','Creepster','Halloween Nights'],
  ['halloween','storybook','Henny Penny','Little Monsters'],
  ['halloween','photoreal','IM Fell English SC','Haunted Cinema'],
  ['halloween','nightmare','Nosifer','Spooky Season'],
  ['christmas','classic','Berkshire Swash','Christmas Classics'],
  ['christmas','storybook','Snowburst One','A Christmas Wish'],
  ['christmas','photoreal','Cinzel Decorative','Christmas at the Movies']
]) test(`${theme} ${style} uses its own locally loaded title face`,async({page})=>{
  const audit=await fixture(page,theme,style,'tv',title);
  await cards(page).first().focus();
  const heading=section(page).locator('.tvl-seasonal-title-themed');
  await expect(heading).toHaveCSS('opacity','1');
  await page.evaluate(()=>document.fonts.ready);
  expect(await heading.evaluate(node=>{
    const style=getComputedStyle(node);
    return {family:style.fontFamily,loaded:document.fonts.check(`${style.fontWeight} 16px ${style.fontFamily.split(',')[0]}`)};
  })).toEqual({family:`"ScreenHarbour ${font}", Georgia, serif`,loaded:true});
  expect(audit.fonts).toHaveLength(1);
  expect(audit.errors).toEqual([]);
  if(style==='nightmare'||theme==='christmas'&&style==='photoreal'){
    await expect.poll(()=>section(page).evaluate(node=>node.getBoundingClientRect().bottom)).toBeLessThanOrEqual(885);
    await page.screenshot({path:`/Users/jamie/Documents/ChatGPT/Jellyfin/artifacts/seasonal-fullscreen/${theme}-${style}.png`,animations:'disabled'});
  }
});
