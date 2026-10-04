import { expect, test, type Locator, type Page } from '@playwright/test';
import { openCollectionRowsFromSettings } from './collection-rows-fixture';
import { useDesktopLayout } from './layout-fixture';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rowSettings = { version:1, rows:[
  {id:'plain',kind:'items',title:'Weekend films',collectionIds:['collection-coast'],ranked:false,placement:'start'},
  {id:'ranked',kind:'items',title:'Trending films',collectionIds:['collection-coast'],ranked:true,placement:'start'},
] };
const row = (page:Page,id:string) => page.locator(`#homeTab [data-home-row="${id}"]`);
const cards = (page:Page,id:string) => row(page,id).locator('.tvl-home-row-card');

async function setup(page:Page,desktop=false) {
  await page.addInitScript(settings=>localStorage.setItem(`jellyfin-cinema.home-collections.v1:${encodeURIComponent(location.origin)}:demo`,JSON.stringify(settings)),rowSettings);
  await page.route('**/dist/demo.js',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:`${await response.text()}\n(()=>{
      const api=window.TvItemLayoutDemo.api,image=api.image;
      api.getCollectionItems=async()=>Array.from({length:12},(_,index)=>({Id:'style-film-'+index,Type:'Movie',Name:index===0?'The Last Light Over the Harbour':'Weekend film '+(index+1)}));
      api.image=(item,kind)=>image(item.Id.startsWith('style-film-')?{Id:'movie-tide'}:item,kind);
      ${desktop?"document.body.classList.replace('layout-tv','layout-desktop');":''}
    })();`});
  });
  await page.goto('/?featured=0&homeSections=resume,nextup#/home');
  await expect(cards(page,'ranked')).toHaveCount(12);
}

async function focusWithoutClipping(card:Locator,scroll=true) {
  if(scroll)await card.evaluate(node=>{
    (node as HTMLElement).focus({preventScroll:true});
    node.scrollIntoView({block:'nearest',inline:'nearest'});
  });
  await expect(card).toBeFocused();
  return card.evaluate(node=>{
    const art=node.querySelector<HTMLElement>('.tvl-home-row-art')!;
    const caption=node.querySelector<HTMLElement>('.tvl-home-row-caption')!;
    const strip=node.closest<HTMLElement>('.tvl-home-row-cards')!;
    const bounds=art.getBoundingClientRect(),viewport=strip.getBoundingClientRect();
    const ring=getComputedStyle(art),reach=parseFloat(ring.outlineWidth)+parseFloat(ring.outlineOffset);
    const range=document.createRange();range.selectNodeContents(caption);
    return { reach, left:bounds.left-reach-viewport.left,right:viewport.right-bounds.right-reach,
      top:bounds.top-reach-viewport.top,bottom:viewport.bottom-bounds.bottom-reach,
      captionGap:range.getBoundingClientRect().top-bounds.bottom-reach,
      cardOutline:getComputedStyle(node).outlineStyle,captionOutline:getComputedStyle(caption).outlineStyle,
      rankOutline:node.querySelector('.tvl-home-rank')?getComputedStyle(node.querySelector('.tvl-home-rank')!).outlineStyle:'none',
      scrollLeft:strip.scrollLeft, scrollable:strip.scrollWidth>strip.clientWidth,
      scrollbar:getComputedStyle(strip,'::-webkit-scrollbar').display,
      scrollbarHeight:strip.offsetHeight-strip.clientHeight,
    };
  });
}

for(const desktop of [false,true])test(`${desktop?'desktop':'TV'} ranked and plain rows keep first/last focus rings visible around artwork only`,async({page})=>{
  await setup(page,desktop);
  for(const id of ['plain','ranked']){
    // Exercise the WebKit rule independently of modern scrollbar-width support.
    await row(page,id).locator('.tvl-home-row-cards').evaluate(node=>(node as HTMLElement).style.setProperty('scrollbar-width','auto','important'));
    const first=await focusWithoutClipping(cards(page,id).first());
    expect(first.scrollable).toBe(true);expect(first.scrollLeft).toBe(0);
    expect(first.reach).toBeGreaterThan(0);
    for(const space of [first.left,first.right,first.top,first.bottom,first.captionGap])expect(space).toBeGreaterThanOrEqual(0);
    expect([first.cardOutline,first.captionOutline,first.rankOutline]).toEqual(['none','none','none']);
    expect(first.scrollbar).toBe('none');expect(first.scrollbarHeight).toBe(0);
    await page.screenshot({path:test.info().outputPath(`${desktop?'desktop':'tv'}-${id}-first.png`)});
    // Use the real row navigation for a complete horizontal traversal.
    for(let index=1;index<12;index++)await page.keyboard.press('ArrowRight');
    await expect(cards(page,id).last()).toBeFocused();
    const last=await focusWithoutClipping(cards(page,id).last(),false);
    expect(last.scrollLeft).toBeGreaterThan(0);
    for(const space of [last.left,last.right,last.top,last.bottom,last.captionGap])expect(space).toBeGreaterThanOrEqual(0);
    expect([last.cardOutline,last.captionOutline,last.rankOutline]).toEqual(['none','none','none']);
    await page.screenshot({path:test.info().outputPath(`${desktop?'desktop':'tv'}-${id}-last.png`)});
  }
});

for(const desktop of [false,true])test(`${desktop?'desktop':'TV'} row ends reserve focus space without relying on scrollable end padding`,async({page})=>{
  await setup(page,desktop);
  // Older flex scrollers can omit trailing padding from their scrollable area.
  // Removing it exercises that geometry without depending on a legacy engine.
  await page.addStyleTag({content:'.tvl-home-row-cards{padding-right:0!important}'});
  for(const id of ['plain','ranked']){
    await focusWithoutClipping(cards(page,id).first());
    for(let index=1;index<12;index++)await page.keyboard.press('ArrowRight');
    const last=cards(page,id).last();
    await expect(last).toBeFocused();
    expect((await focusWithoutClipping(last,false)).right).toBeGreaterThanOrEqual(0);
    // A pointer/trackpad can reach the absolute end independently of focus.
    await row(page,id).locator('.tvl-home-row-cards').evaluate(node=>{node.scrollLeft=node.scrollWidth;});
    expect((await focusWithoutClipping(last,false)).right).toBeGreaterThanOrEqual(0);
    await page.screenshot({path:test.info().outputPath(`${desktop?'desktop':'tv'}-${id}-end-gutter.png`)});
  }
  const tiles=page.locator('#homeTab .tvl-provider-tile');
  await tiles.first().focus();
  for(let index=1;index<await tiles.count();index++)await page.keyboard.press('ArrowRight');
  await expect(tiles.last()).toBeFocused();
  for(const atEnd of [false,true])expect(await tiles.last().evaluate((tile,atEnd)=>{
    const strip=tile.closest<HTMLElement>('.tvl-home-row-cards')!;
    if(atEnd)strip.scrollLeft=strip.scrollWidth;
    const art=tile.querySelector('.tvl-provider-tile-mark')!,style=getComputedStyle(art);
    return strip.getBoundingClientRect().right-art.getBoundingClientRect().right-parseFloat(style.outlineWidth)-parseFloat(style.outlineOffset);
  },atEnd)).toBeGreaterThanOrEqual(0);

  await tiles.first().click();
  const serviceCards=page.locator('.tvl-provider-home [data-provider-row="trending-movies"] .tvl-home-row-card');
  await expect(serviceCards).toHaveCount(12);
  await focusWithoutClipping(serviceCards.first());
  for(let index=1;index<12;index++)await page.keyboard.press('ArrowRight');
  await expect(serviceCards.last()).toBeFocused();
  expect((await focusWithoutClipping(serviceCards.last(),false)).right).toBeGreaterThanOrEqual(0);
  await serviceCards.last().evaluate(node=>{const strip=node.closest('.tvl-home-row-cards')!;strip.scrollLeft=strip.scrollWidth;});
  expect((await focusWithoutClipping(serviceCards.last(),false)).right).toBeGreaterThanOrEqual(0);
  await page.screenshot({path:test.info().outputPath(`${desktop?'desktop':'tv'}-service-end-gutter.png`)});
});

test('custom row gaps match adjacent native rows without accumulating extra top padding',async({page})=>{
  await setup(page);
  const gaps=await page.locator('#homeTab').evaluate(home=>{
    const plain=home.querySelector('[data-home-row="plain"]')!.getBoundingClientRect();
    const ranked=home.querySelector('[data-home-row="ranked"]')!.getBoundingClientRect();
    const firstNative=home.querySelector('.verticalSection:not(.tvl-home-collection-row):not(.tvl-home-provider-row)')!.getBoundingClientRect();
    const native=home.querySelector('[aria-label="Continue watching"]')!.getBoundingClientRect();
    const next=home.querySelector('[aria-label="Next up"]')!.getBoundingClientRect();
    const heading=home.querySelector('[data-home-row="ranked"] h2')!.getBoundingClientRect();
    return {custom:ranked.top-plain.bottom,customToNative:firstNative.top-ranked.bottom,native:next.top-native.bottom,topInset:heading.top-ranked.top};
  });
  expect(gaps.native).toBeGreaterThan(0);
  expect(gaps.custom).toBeCloseTo(gaps.native,0);
  expect(gaps.customToNative).toBeCloseTo(gaps.native,0);
  expect(gaps.topInset).toBe(0);
});

test('editor preview keeps the shared thumbnail/rank proportions and scrolls without a bar',async({page})=>{
  await setup(page);
  const homeRatio=await cards(page,'ranked').first().evaluate(card=>{
    const art=card.querySelector('.tvl-home-row-art')!.getBoundingClientRect(),rank=card.querySelector('.tvl-home-rank')!.getBoundingClientRect();
    return {art:art.width/art.height,rank:rank.width/art.width};
  });
  await useDesktopLayout(page);
  await openCollectionRowsFromSettings(page);
  const editor=page.getByRole('dialog',{name:'Customize Home rows',exact:true});
  await editor.locator('.tvl-home-row-choice').filter({hasText:'Trending films'}).click();
  const preview=editor.getByRole('complementary',{name:'Home row preview',exact:true});
  await expect(preview.locator('.tvl-home-row-card')).toHaveCount(12);
  const previewRatio=await preview.locator('.tvl-home-row-card').first().evaluate(card=>{
    const art=card.querySelector('.tvl-home-row-art')!.getBoundingClientRect(),rank=card.querySelector('.tvl-home-rank')!.getBoundingClientRect();
    return {art:art.width/art.height,rank:rank.width/art.width};
  });
  expect(previewRatio.art).toBeCloseTo(homeRatio.art,2);expect(previewRatio.rank).toBeCloseTo(homeRatio.rank,2);
  await expect(preview.locator('.tvl-home-row-card').first()).toHaveAttribute('role','img');
  expect(await preview.locator('.tvl-home-row-cards').evaluate(node=>getComputedStyle(node,'::-webkit-scrollbar').display)).toBe('none');
  await preview.getByRole('button',{name:'Next preview items',exact:true}).click();
  expect(await preview.locator('.tvl-home-row-cards').evaluate(node=>node.scrollLeft)).toBeGreaterThan(0);
  await page.screenshot({path:test.info().outputPath('ranked-preview.png')});
});

const nativeSource=process.env.TVL_JELLYFIN_WEB_SOURCE||'/tmp/tvl-jellyfin-web-12-audit';
const nativeCard=resolve(nativeSource,'src/components/cardbuilder/card.scss');
const elegantPath=process.env.TVL_ELEGANTFIN_CSS||'/tmp/cinema-elegantfin-theme.css';
test('native visual/nonvisual cards and custom cards match artwork focus with actual Jellyfin and ElegantFin CSS',async({page})=>{
  test.skip(!existsSync(nativeCard)||!existsSync(elegantPath),'Set TVL_JELLYFIN_WEB_SOURCE and TVL_ELEGANTFIN_CSS to the audited upstream styles.');
  await setup(page,true);
  // Load upstream CSS after Cinema to exercise the real late-loaded cascade.
  // This Sass file uses only CSS-compatible nesting and media rules.
  await page.addStyleTag({content:readFileSync(nativeCard,'utf8')+'\n'+readFileSync(elegantPath,'utf8').replace(/@import[^;]+;/g,'')});
  for(const flex of [false,true]){
    await page.locator('#homeTab .homeSectionsContainer').evaluate((host,flex)=>{
      // HomeScreen Sections can make all native/custom rows ordered siblings.
      const rows=Array.from(host.querySelectorAll('.verticalSection,.tvl-home-collection-row'));
      host.replaceChildren(...rows);(host as HTMLElement).style.display=flex?'flex':'block';
      (host as HTMLElement).style.flexDirection='column';
    },flex);
    const gaps=await page.locator('#homeTab').evaluate(home=>{
      const bounds=(selector:string)=>home.querySelector(selector)!.getBoundingClientRect();
      const plain=bounds('[data-home-row="plain"]'),ranked=bounds('[data-home-row="ranked"]');
      const first=bounds('[aria-label="My Media"]'),native=bounds('[aria-label="Continue watching"]'),next=bounds('[aria-label="Next up"]');
      return {custom:ranked.top-plain.bottom,toNative:first.top-ranked.bottom,native:next.top-native.bottom};
    });
    expect(gaps.custom,`${flex?'flex':'block'} custom spacing`).toBeCloseTo(gaps.native,0);
    expect(gaps.toNative,`${flex?'flex':'block'} transition spacing`).toBeCloseTo(gaps.native,0);
  }
  const native=page.locator('#homeTab [aria-label="Continue watching"] .card');
  await native.nth(1).evaluate(card=>{
    const box=card.querySelector('.cardBox')!;box.classList.add('visualCardBox');
    const footer=document.createElement('div');footer.className='cardFooter';footer.append(...box.querySelectorAll('.cardText'));box.append(footer);
  });
  const rings=[];
  for(const card of [native.first(),native.nth(1)]){
    await card.focus();
    rings.push(await card.locator('.cardScalable').evaluate(art=>{const css=getComputedStyle(art);return [css.outlineWidth,css.outlineOffset,css.outlineColor];}));
    await expect(card).toHaveCSS('outline-style','none');await expect(card.locator('.cardBox')).toHaveCSS('outline-style','none');
    expect(await card.evaluate(node=>getComputedStyle(node).contain.split(' ').includes('paint'))).toBe(false);
  }
  const focused=cards(page,'ranked').first();await focusWithoutClipping(focused);
  const ring=await focused.locator('.tvl-home-row-art').evaluate(art=>{const css=getComputedStyle(art);return [css.outlineWidth,css.outlineOffset,css.outlineColor];});
  expect(rings).toEqual([ring,ring]);
  await page.screenshot({path:test.info().outputPath('elegantfin-ranked-focus.png')});
});
