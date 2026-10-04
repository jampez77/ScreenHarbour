import { expect, test, type Page } from '@playwright/test';

type NativeCard = { key: string; channel?: string; id?: string; type?: string; image?: string; lazy?: string };
const card = (page: Page, key: string) => page.locator(`#homeTab [data-artwork-card="${key}"]`);
const logo = (page: Page, key: string) => card(page, key).locator('.tvl-home-channel-logo');
const art = (page: Page, key: string) => card(page, key).locator('.cardImageContainer');
const frames = (page: Page) => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
const reads = (page: Page) => page.evaluate(() => (window as any).__channelArtwork.reads as string[]);

async function fixture(page: Page, cards: NativeCard[], layout = 'tv', held = false, failedReads = 0) {
  const imageRequests: string[] = [];
  await page.route('**/channel-artwork-fixture/*.svg', async route => {
    const name = new URL(route.request().url()).pathname.split('/').pop()!;
    imageRequests.push(name);
    if (name.startsWith('broken')) return route.fulfill({ status: 404, body: '' });
    await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="90" viewBox="0 0 220 90"><rect x="5" y="5" width="210" height="80" rx="12" fill="#263b2e"/><text x="110" y="55" text-anchor="middle" fill="white" font-size="28">CHANNEL</text></svg>' });
  });
  await page.route('**/dist/demo.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\n(() => {
      const api=window.TvItemLayoutDemo.api, originalImage=api.image;
      const makeChannel=(Id,ImageTags)=>({Id,Name:Id,Type:'TvChannel',ImageTags});
      const state=window.__channelArtwork={cards:${JSON.stringify(cards)},reads:[],clicks:[],hold:${JSON.stringify(held)},failedReads:${failedReads},pending:[],channels:{
        parents:[makeChannel('channel-field',{Logo:'field-logo',Primary:'field-primary'}),makeChannel('channel-horizon',{Primary:'horizon-primary'}),
          makeChannel('channel-drift',{Logo:'broken-drift-logo',Primary:'drift-primary'}),makeChannel('channel-outside',{Logo:'broken-outside-logo',Primary:'broken-outside-primary'}),
          makeChannel('channel-empty',{})],
        kids:[makeChannel('channel-field',{Logo:'kids-field-logo',Primary:'kids-field-primary'})]
      },release(scope){this.pending=this.pending.filter(entry=>{if(!scope||entry.scope===scope){entry.resolve();return false;}return true;});}};
      api.serverId='channel-artwork-server';api.userId='parents';
      api.getChannels=async()=>{const scope=api.userId;state.reads.push(scope);const result=JSON.parse(JSON.stringify(state.channels[scope]||[]));
        if(state.failedReads>0){state.failedReads--;throw new Error('Temporary channel lookup failure');}
        if(state.hold)await new Promise(resolve=>state.pending.push({scope,resolve}));return result;};
      api.image=(item,kind)=>{if(item.Type==='TvChannel'&&(kind==='logo'||kind==='poster')){
        const tag=item.ImageTags&&item.ImageTags[kind==='logo'?'Logo':'Primary'];return tag?'/channel-artwork-fixture/'+tag+'.svg':null;}
        return originalImage(item,kind);};
      state.mount=()=>{
        document.getElementById('native-on-now-fixture')?.remove();
        const row=document.createElement('section');row.className='verticalSection';row.id='native-on-now-fixture';row.setAttribute('aria-label','On Now');
        const heading=document.createElement('h2');heading.className='sectionTitle';heading.textContent='On Now';row.append(heading);
        const list=document.createElement('div');list.className='itemsContainer focuscontainer-x';list.setAttribute('is','emby-itemscontainer');row.append(list);
        for(const item of state.cards){
          const desktop=${JSON.stringify(layout === 'desktop')},node=document.createElement(desktop?'div':'button');
          node.className='card backdropCard card-hoverable';node.dataset.artworkCard=item.key;node.dataset.type=item.type||'Program';
          node.dataset.id=item.id||'channel-field-program-1';node.dataset.serverid='channel-artwork-server';
          if(item.channel)node.dataset.channelid=item.channel;
          const box=document.createElement('div');box.className='cardBox';const scalable=document.createElement('div');scalable.className='cardScalable';
          const padder=document.createElement('div');padder.className='cardPadder cardPadder-backdrop';
          const image=document.createElement(desktop?'a':'div');image.className='cardImageContainer coveredImage';
          const placeholder=item.image||item.lazy?'':item.type==='TvChannel'?'<span class="cardDefaultText">'+item.key+'</span>':'<span class="cardImageIcon material-icons live_tv" aria-hidden="true">tv</span>';
          image.innerHTML=placeholder+'<div class="cardIndicators"><span>LIVE</span></div><div class="innerCardFooter"><div class="itemProgressBar"><div class="itemProgressBarForeground" style="width:40%"></div></div></div>';
          if(item.image)image.style.backgroundImage='url("'+item.image+'")';
          if(item.lazy){image.dataset.src=item.lazy;image.classList.add('lazy','lazy-hidden');}
          const target=desktop?image:node;target.setAttribute('aria-label',item.key);target.dataset.action='link';
          if(desktop)target.href='#/details?id='+node.dataset.id;else node.type='button';
          target.addEventListener('click',()=>{state.clicks.push(item.key);if(!desktop)location.hash='/details?id='+node.dataset.id;});
          const title=document.createElement('div');title.className='cardText';title.textContent=item.key;
          scalable.append(padder,image);box.append(scalable,title);node.append(box);list.append(node);
        }
        document.querySelector('#homeTab .sections').append(row);
      };state.mount();
    })();` });
  });
  await page.goto(`/?featured=0&layout=${layout}#/home`);
  await expect(page.locator('#homeTab .tvl-provider-tile').first()).toBeVisible();
  await expect(page.getByRole('status', { name: 'Loading Home', exact: true })).toHaveCount(0);
  return imageRequests;
}

for (const layout of ['desktop', 'tv']) test(`${layout} Home fills only missing TV artwork while preserving native progress, click, Back and focus`, async ({ page }, info) => {
  await fixture(page, [
    { key: 'Missing programme', channel: 'channel-field' },
    { key: 'Another programme', channel: 'channel-field', id: 'channel-field-program-2' },
    { key: 'Native thumbnail', channel: 'channel-horizon', image: '/demo/assets/mountains.jpg' },
    { key: 'Lazy thumbnail', channel: 'channel-horizon', lazy: '/demo/assets/ocean.jpg' },
    { key: 'Movie placeholder', channel: 'channel-field', type: 'Movie', id: 'movie-tide' }
  ], layout);
  await expect(logo(page, 'Missing programme')).toBeVisible();
  await expect(logo(page, 'Another programme')).toBeVisible();
  expect(await reads(page)).toEqual(['parents']);
  await expect(logo(page, 'Missing programme')).toHaveAttribute('src', /field-logo\.svg$/);
  await expect(logo(page, 'Missing programme')).toHaveCSS('object-fit', 'contain');
  await expect(logo(page, 'Missing programme')).toHaveCSS('pointer-events', 'none');
  await expect(card(page, 'Missing programme').locator('.cardImageIcon')).toBeHidden();
  await expect(card(page, 'Missing programme').locator('.cardIndicators')).toBeVisible();
  await expect(card(page, 'Missing programme').locator('.itemProgressBar')).toBeVisible();
  await expect(logo(page, 'Native thumbnail')).toHaveCount(0);
  await expect(art(page, 'Native thumbnail')).toHaveCSS('background-image', /mountains\.jpg/);
  await expect(logo(page, 'Lazy thumbnail')).toHaveCount(0);
  await expect(art(page, 'Lazy thumbnail')).toHaveAttribute('data-src', '/demo/assets/ocean.jpg');
  await expect(logo(page, 'Movie placeholder')).toHaveCount(0);
  const target = layout === 'desktop' ? art(page, 'Missing programme') : card(page, 'Missing programme');
  await target.scrollIntoViewIfNeeded();
  await target.focus(); await expect(target).toBeFocused();
  await page.screenshot({ path: info.outputPath(`home-channel-logo-${layout}.png`) });
  const retainedLogo = await logo(page, 'Missing programme').elementHandle();
  await target.click();
  await expect(page.getByRole('dialog', { name: 'Field Notes details', exact: true })).toBeVisible();
  expect(await retainedLogo!.evaluate(node => node.isConnected)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(logo(page, 'Missing programme')).toBeVisible();
  await expect(target).toBeFocused();
  expect(await reads(page)).toEqual(['parents']);
  expect(await page.evaluate(() => (window as any).__channelArtwork.clicks)).toEqual(['Missing programme']);
});

test('channel cards use Primary logos and failed logo images fall back once without hiding native unavailable placeholders', async ({ page }) => {
  const requests = await fixture(page, [
    { key: 'Primary channel', type: 'TvChannel', id: 'channel-horizon' },
    { key: 'Broken logo', channel: 'channel-drift' },
    { key: 'Both images fail', channel: 'channel-outside' },
    { key: 'No channel artwork', channel: 'channel-empty' },
    { key: 'Unknown channel', channel: 'channel-missing' }
  ]);
  await expect(logo(page, 'Primary channel')).toHaveAttribute('src', /horizon-primary\.svg$/);
  await expect(card(page, 'Primary channel').locator('.cardDefaultText')).toBeHidden();
  await expect(logo(page, 'Broken logo')).toHaveAttribute('src', /drift-primary\.svg$/);
  await expect(logo(page, 'Broken logo')).toBeVisible();
  await expect.poll(() => requests.filter(name => name === 'broken-outside-primary.svg').length).toBe(1);
  await frames(page);
  for (const key of ['Both images fail', 'No channel artwork', 'Unknown channel']) {
    await expect(logo(page, key)).toHaveCount(0);
    await expect(art(page, key)).not.toHaveClass(/tvl-home-channel-fallback/);
    await expect(card(page, key).locator('.cardImageIcon')).toBeVisible();
  }
  const before = [...requests];
  await page.evaluate(() => {
    const host = document.querySelector('#homeTab .sections')!;
    for (let i = 0; i < 5; i++) { const node = document.createElement('div'); host.append(node); node.remove(); }
  });
  await frames(page);
  expect(requests).toEqual(before); expect(await reads(page)).toEqual(['parents']);
});

test('rebuilt native rows reuse the channel lookup and recycled cards follow their new channel ID', async ({ page }) => {
  await fixture(page, [{ key: 'Rebuilt programme', channel: 'channel-field' }]);
  await expect(logo(page, 'Rebuilt programme')).toHaveAttribute('src', /field-logo\.svg$/);
  await page.evaluate(() => (window as any).__channelArtwork.mount());
  await expect(logo(page, 'Rebuilt programme')).toBeVisible();
  expect(await reads(page)).toEqual(['parents']);
  await card(page, 'Rebuilt programme').evaluate(node => { (node as HTMLElement).dataset.channelid = 'channel-horizon'; });
  await expect(logo(page, 'Rebuilt programme')).toHaveAttribute('src', /horizon-primary\.svg$/);
  expect(await reads(page)).toEqual(['parents']);
  await art(page, 'Rebuilt programme').evaluate(node => { (node as HTMLElement).style.backgroundImage = 'url("/demo/assets/forest.jpg")'; });
  await expect(logo(page, 'Rebuilt programme')).toHaveCount(0);
  await expect(art(page, 'Rebuilt programme')).not.toHaveClass(/tvl-home-channel-fallback/);
  await expect(card(page, 'Rebuilt programme').locator('.itemProgressBar')).toBeVisible();
});

test('native thumbnail completion takes precedence over a delayed channel lookup and never delays Home visibility', async ({ page }) => {
  const requests = await fixture(page, [{ key: 'Late native thumbnail', channel: 'channel-field' }], 'tv', true);
  await expect.poll(() => reads(page)).toEqual(['parents']);
  await expect(card(page, 'Late native thumbnail')).toBeVisible();
  await art(page, 'Late native thumbnail').evaluate(node => { (node as HTMLElement).style.backgroundImage = 'url("/demo/assets/forest.jpg")'; });
  await page.evaluate(() => (window as any).__channelArtwork.release());
  await frames(page);
  await expect(logo(page, 'Late native thumbnail')).toHaveCount(0);
  await expect(art(page, 'Late native thumbnail')).toHaveCSS('background-image', /forest\.jpg/);
  expect(requests).toEqual([]);
});

test('late channel lookups cannot add artwork after leaving Home', async ({ page }) => {
  await fixture(page, [{ key: 'Departing programme', channel: 'channel-field' }], 'desktop', true);
  await expect.poll(() => reads(page)).toEqual(['parents']);
  await page.locator('.skinHeader').getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page).toHaveURL(/#\/mypreferencesmenu$/);
  await page.evaluate(() => (window as any).__channelArtwork.release());
  await frames(page);
  await expect(page.locator('#homeTab .tvl-home-channel-logo')).toHaveCount(0);
  await expect(page.locator('#homeTab .tvl-home-channel-fallback')).toHaveCount(0);
});

test('switching accounts starts an isolated channel lookup and ignores the previous account’s late response', async ({ page }) => {
  await fixture(page, [{ key: 'Account programme', channel: 'channel-field' }], 'tv', true);
  await expect.poll(() => reads(page)).toEqual(['parents']);
  await page.evaluate(() => {
    (window as any).__channelArtwork.hold = false;
    window.TvItemLayoutDemo!.api.userId = 'kids';
    window.TvItemLayout!.refresh();
  });
  await expect(logo(page, 'Account programme')).toHaveAttribute('src', /kids-field-logo\.svg$/);
  await expect(logo(page, 'Account programme')).toBeVisible();
  expect(await reads(page)).toEqual(['parents', 'kids']);
  await page.evaluate(() => (window as any).__channelArtwork.release('parents'));
  await frames(page);
  await expect(logo(page, 'Account programme')).toHaveAttribute('src', /kids-field-logo\.svg$/);
  await expect(page.locator('#homeTab .tvl-home-channel-logo')).toHaveCount(1);
});

test('a temporary channel lookup failure retries on the same Home without hiding native placeholders or blocking Home', async ({ page }) => {
  await page.clock.install();
  await fixture(page, [{ key: 'Retry programme', channel: 'channel-field' }], 'tv', false, 1);
  await expect.poll(() => reads(page)).toEqual(['parents']);
  await frames(page);
  await expect(logo(page, 'Retry programme')).toHaveCount(0);
  await expect(card(page, 'Retry programme').locator('.cardImageIcon')).toBeVisible();
  await page.clock.fastForward(29_000);
  expect(await reads(page)).toEqual(['parents']);
  await page.clock.fastForward(2_000);
  await expect(logo(page, 'Retry programme')).toBeVisible();
  await expect(logo(page, 'Retry programme')).toHaveAttribute('src', /field-logo\.svg$/);
  expect(await reads(page)).toEqual(['parents', 'parents']);
  await expect(page.getByRole('status', { name: 'Loading Home', exact: true })).toHaveCount(0);
});
