import { expect, test, type Page } from '@playwright/test';
import { defaultSeasonalAppearance, type HomeCollectionRow, type HomeSeasonalAppearance } from '../../src/home-collection-settings';

const row = (page: Page, id: string) => page.locator(`#homeTab [data-home-row="${id}"]`);
const base = (id: string, extra: Partial<HomeCollectionRow> = {}): HomeCollectionRow => ({ id, kind:'items',title:id,
  collectionIds:['collection-coast'],ranked:false,placement:'start',itemSort:'collection',itemOrder:[],...extra });
async function fixture(page: Page, appearance: Partial<HomeSeasonalAppearance> = {}, layout = 'tv') {
  const settings = { version:1, rows:[base('Before'),base('seasonal',{kind:'seasonal',title:'',collectionIds:[],children:[
    base('Halloween',{season:{start:'10-01',end:'10-31'},appearance:{...defaultSeasonalAppearance('halloween'),...appearance}})
  ]}),base('After')] };
  await page.clock.install({ time:new Date('2026-10-15T12:00:00+01:00') });
  await page.addInitScript(settings => {
    localStorage.setItem(`jellyfin-cinema.home-collections.v1:${encodeURIComponent(location.origin)}:demo`,JSON.stringify(settings));
  },settings);
  await page.route('**/dist/demo.js',async route => {
    const response=await route.fetch();
    await route.fulfill({response,body:`${await response.text()}\n(()=>{
      const api=window.TvItemLayoutDemo.api,members=api.getCollectionItems,item=api.getItem;
      api.homeCollections={isCurrent:()=>true,load:async()=>({Revision:'appearance',Settings:${JSON.stringify(settings)}}),save:async()=>{throw new Error('Unexpected write')}};
      api.getCollectionItems=async id=>{const found=await members(id);return id==='collection-coast'?Array.from({length:12},(_,i)=>({...found[i%found.length],Id:'season-film-'+i,Name:'Seasonal film '+(i+1)})):found;};
      api.getItem=async id=>id.startsWith('season-film-')?{...await item('movie-tide'),Id:id,Name:'Seasonal film '+(Number(id.slice(12))+1)}:item(id);
    })();`});
  });
  await page.goto(`/?featured=0&layout=${layout}#/home`);
  await expect(row(page,'Halloween').locator('.tvl-home-row-card')).toHaveCount(12);
  await expect(page.locator('#homeTab')).not.toHaveClass(/tvl-home-initial-loading/);
}

test('seasonal doors reveal the selected item, close behind it, and preserve normal activation and Back',async({page})=>{
  await fixture(page,{theme:'christmas',reveal:'doors',expansion:'large'});
  const section=row(page,'Halloween'),cards=section.locator('.tvl-home-row-card');
  const height=await section.evaluate(node=>node.getBoundingClientRect().height);
  const backgroundSize=await section.locator('.tvl-seasonal-backdrop').evaluate(node=>getComputedStyle(node).backgroundSize);
  const posterHeight=await cards.first().locator('.tvl-home-row-art').evaluate(node=>node.getBoundingClientRect().height);
  await expect(cards.first().locator('.tvl-home-row-caption')).toHaveCSS('opacity','0');
  await expect(cards.first().locator('.tvl-seasonal-door-number')).toHaveText('1');
  await cards.first().focus();
  await expect(section).toHaveClass(/tvl-seasonal-expanded/);
  await expect(cards.first()).toHaveClass(/tvl-seasonal-item-open/);
  await expect(cards.first().locator('.tvl-home-row-caption')).toHaveCSS('opacity','1');
  await expect.poll(()=>section.evaluate(node=>node.getBoundingClientRect().height)).toBeGreaterThan(height*1.4);
  expect(await cards.first().locator('.tvl-home-row-art').evaluate(node=>node.getBoundingClientRect().height)).toBe(posterHeight);
  expect(await section.locator('.tvl-seasonal-backdrop').evaluate(node=>getComputedStyle(node).backgroundSize)).toBe(backgroundSize);
  await page.keyboard.press('ArrowRight');
  await expect(cards.nth(1)).toBeFocused(); await expect(cards.first()).not.toHaveClass(/tvl-seasonal-item-open/);
  await expect(cards.nth(1)).toHaveClass(/tvl-seasonal-item-open/);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog',{name:'Seasonal film 2 details',exact:true})).toBeVisible();
  await page.goBack(); await expect(cards.nth(1)).toBeFocused(); await expect(cards.nth(1)).toHaveClass(/tvl-seasonal-item-open/);
  await page.keyboard.press('ArrowDown'); await expect(row(page,'After').locator('.tvl-home-row-card').nth(1)).toBeFocused();
  await expect(section).not.toHaveClass(/tvl-seasonal-expanded/);
  await expect.poll(()=>section.evaluate((node,height)=>Math.abs(node.getBoundingClientRect().height-height),height)).toBeLessThan(2);
});

test('rapid TV vertical navigation stays adjacent while rows expand and collapse; the final focus ring fits',async({page})=>{
  await fixture(page,{reveal:'curtains',expansion:'large',background:'parallax'});
  const before=row(page,'Before').locator('.tvl-home-row-card'),season=row(page,'Halloween').locator('.tvl-home-row-card'),after=row(page,'After').locator('.tvl-home-row-card');
  await before.first().focus();
  for(let i=0;i<4;i++) {
    await page.keyboard.press('ArrowDown');await expect(season.first()).toBeFocused();
    await page.keyboard.press('ArrowDown');await expect(after.first()).toBeFocused();
    await page.keyboard.press('ArrowUp');await expect(season.first()).toBeFocused();
    await page.keyboard.press('ArrowUp');await expect(before.first()).toBeFocused();
  }
  await page.keyboard.press('ArrowDown');
  for(let i=0;i<11;i++)await page.keyboard.press('ArrowRight');
  await expect(season.last()).toBeFocused();
  await expect.poll(()=>season.last().evaluate(node=>node.getBoundingClientRect().bottom)).toBeLessThan(901);
  const ring=await season.last().locator('.tvl-home-row-art').evaluate(node=>{
    const art=node.getBoundingClientRect(),strip=node.closest('.tvl-home-row-cards')!.getBoundingClientRect();
    return {right:strip.right-art.right,outline:getComputedStyle(node).outlineWidth};
  });
  expect(ring.right).toBeGreaterThanOrEqual(5);expect(ring.outline).toBe('2px');
  await page.keyboard.press('ArrowDown');await expect(after.last()).toBeFocused();
  await expect.poll(()=>after.last().evaluate(node=>node.getBoundingClientRect().bottom)).toBeLessThan(901);
});

for(const background of ['static','parallax'] as const) test(`${background} background responds correctly to horizontal navigation`,async({page})=>{
  await fixture(page,{background,expansion:'none'});
  const section=row(page,'Halloween'),backdrop=section.locator('.tvl-seasonal-backdrop');
  await expect(section).toHaveAttribute('data-seasonal-background',background);
  await section.locator('.tvl-home-row-card').first().focus();
  const scenery=background==='parallax'?section.locator('.tvl-seasonal-scene'):backdrop;
  const initial=await scenery.evaluate(node=>getComputedStyle(node).transform);
  for(let i=0;i<11;i++)await page.keyboard.press('ArrowRight');
  if(background==='parallax') await expect.poll(()=>scenery.evaluate(node=>getComputedStyle(node).transform)).not.toBe(initial);
  else expect(await scenery.evaluate(node=>getComputedStyle(node).transform)).toBe(initial);
});

test('normal rows have no decorations, disabled effects stay off and reduced motion opens immediately',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await fixture(page,{background:'none',expansion:'none',frame:false,reveal:'curtains'});
  await expect(row(page,'Before').locator('[data-seasonal-theme],.tvl-seasonal-backdrop')).toHaveCount(0);
  const section=row(page,'Halloween'),card=section.locator('.tvl-home-row-card').first();
  await expect(section.locator('.tvl-seasonal-backdrop,.tvl-seasonal-frame')).toHaveCount(0);
  const height=await section.evaluate(node=>node.getBoundingClientRect().height);
  await card.focus();
  await expect(section).not.toHaveClass(/tvl-seasonal-expanded/);
  expect(await section.evaluate(node=>node.getBoundingClientRect().height)).toBe(height);
  await expect(card.locator('.tvl-seasonal-panel-left')).toHaveCSS('transition-duration','0s');
  await expect(card.locator('.tvl-home-row-caption')).toHaveCSS('opacity','1');
});

test('desktop hover reveals a door without clicking and closes it when the pointer leaves',async({page})=>{
  await fixture(page,{reveal:'doors'},'desktop');
  const cards=row(page,'Halloween').locator('.tvl-home-row-card');
  await cards.first().hover();await expect(cards.first()).toHaveClass(/tvl-seasonal-item-open/);
  await cards.nth(1).hover();await expect(cards.first()).not.toHaveClass(/tvl-seasonal-item-open/);await expect(cards.nth(1)).toHaveClass(/tvl-seasonal-item-open/);
  await page.mouse.move(5,5);await expect(cards.nth(1)).not.toHaveClass(/tvl-seasonal-item-open/);
});


test('collapsing scenery above a selected row keeps its card below the fixed header',async({page})=>{
  await fixture(page,{expansion:'large'});
  const section=row(page,'Halloween'),next=row(page,'After').locator('.tvl-home-row-card').first();
  const height=await section.evaluate(node=>node.getBoundingClientRect().height);
  await section.locator('.tvl-home-row-card').first().focus();
  await expect.poll(()=>section.evaluate(node=>node.getBoundingClientRect().height)).toBeGreaterThan(height*1.4);
  await next.evaluate(node=>{node.focus({preventScroll:true});node.scrollIntoView({block:'start'});});
  await expect.poll(()=>section.evaluate((node,height)=>Math.abs(node.getBoundingClientRect().height-height),height)).toBeLessThan(2);
  await expect(next).toBeFocused();
  await expect.poll(()=>next.evaluate(node=>node.getBoundingClientRect().top)).toBeGreaterThanOrEqual(80);
});

for(const theme of ['halloween','christmas'] as const) test(`${theme} photoreal scenery, frames and shutters load locally and reveal the selected poster`,async({page})=>{
  const assets:string[]=[];
  page.on('response',response=>{if(response.url().includes('/assets/seasonal/')) {expect(response.status()).toBe(200);assets.push(response.url());}});
  await fixture(page,{theme,backgroundStyle:theme==='halloween'?'nightmare':'photoreal',frameStyle:'photoreal',coverStyle:'photoreal',reveal:'shutters'});
  const section=row(page,'Halloween'),cards=section.locator('.tvl-home-row-card');
  await expect.poll(()=>assets.filter(url=>/-tv\.webp\?v=0\.2\.48$/.test(url)).length).toBeGreaterThanOrEqual(3);
  expect(assets.every(url=>new URL(url).origin===new URL(page.url()).origin)).toBe(true);
  await expect(cards.first().locator('.tvl-seasonal-full-door')).toHaveCount(2);
  await expect(cards.first().locator('.tvl-seasonal-window')).toHaveCount(1);
  await expect(cards.first().locator('.tvl-seasonal-frame')).toHaveCSS('object-fit','fill');
  expect(await cards.first().locator('img').evaluateAll(nodes=>nodes.every(node=>(node as HTMLImageElement).complete&&(node as HTMLImageElement).naturalWidth>0))).toBe(true);
  await cards.first().focus(); await expect(cards.first()).toHaveClass(/tvl-seasonal-item-open/);
  await expect(cards.first().locator('.tvl-home-row-caption')).toHaveCSS('opacity','1');
  await page.keyboard.press('ArrowRight'); await expect(cards.first().locator('.tvl-home-row-caption')).toHaveCSS('opacity','0');
  await expect(cards.nth(1)).toBeFocused();
});

test('storybook remains self-contained and reduced-motion parallax stays still',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  const assets:string[]=[];page.on('request',request=>{if(request.url().includes('/assets/seasonal/'))assets.push(request.url());});
  await fixture(page,{background:'parallax',backgroundStyle:'storybook',frameStyle:'storybook',coverStyle:'storybook',reveal:'doors'});
  const section=row(page,'Halloween'),backdrop=section.locator('.tvl-seasonal-backdrop');
  await section.locator('.tvl-home-row-card').first().focus();
  const before=await section.locator('.tvl-seasonal-scene').evaluate(node=>getComputedStyle(node).transform);
  for(let i=0;i<11;i++)await page.keyboard.press('ArrowRight');
  expect(await section.locator('.tvl-seasonal-scene').evaluate(node=>getComputedStyle(node).transform)).toBe(before);
  expect(assets).toEqual([]);
});
