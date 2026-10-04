import { expect, test } from '@playwright/test';

for (const layout of ['tv', 'desktop'] as const) {
  test(`${layout} loads its own seasonal image sizes with no duplicate full-size downloads`, async ({ page }) => {
    const settings = { version: 1, rows: [{ id: 'season', kind: 'seasonal', title: '', collectionIds: [],
      ranked: false, placement: 'start', itemSort: 'collection', itemOrder: [], children: [{
        id: 'seasonal-films', kind: 'items', title: 'Seasonal films', collectionIds: ['collection-coast'],
        ranked: false, placement: 'start', itemSort: 'collection', itemOrder: [],
        season: { start: '01-01', end: '12-31' }, appearance: { theme: 'halloween', background: 'static',
          expansion: 'none', frame: true, reveal: 'doors', backgroundStyle: 'nightmare', frameStyle: 'nightmare', coverStyle: 'nightmare' }
      }] }] };
    const requests: string[] = [], failures: string[] = [];
    page.on('request', request => {
      if (request.url().includes('/assets/seasonal/')) requests.push(new URL(request.url()).pathname.split('/').pop()!);
    });
    page.on('response', response => {
      if (response.url().includes('/assets/seasonal/') && !response.ok()) failures.push(`${response.status()}: ${response.url()}`);
    });
    page.on('pageerror', error => failures.push(error.message));
    await page.route('**/dist/demo.js', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: `${await response.text()}\nwindow.TvItemLayoutDemo.api.homeCollections={isCurrent:()=>true,load:async()=>({Revision:'asset-selection',Settings:${JSON.stringify(settings)}}),save:async()=>{throw new Error('Unexpected write')}};` });
    });
    await page.goto(`/?featured=0&layout=${layout}#/home`);
    const card = page.locator('#homeTab [data-home-row="seasonal-films"] .tvl-home-row-card').first();
    await expect(card).toBeVisible();
    await card.focus();
    const suffix = layout === 'tv' ? '-tv' : '';
    const expected = ['halloween-nightmare', 'halloween-nightmare-door', 'halloween-nightmare-frame'].map(name => `${name}${suffix}.webp`).sort();
    await expect.poll(() => [...new Set(requests)].sort()).toEqual(expected);
    await expect.poll(() => card.locator('img').evaluateAll(nodes => nodes.every(node => {
      const image = node as HTMLImageElement;
      return image.complete && image.naturalWidth > 0;
    }))).toBe(true);
    await expect(card).toHaveClass(/tvl-seasonal-item-open/);
    expect(failures).toEqual([]);
  });
}
