import { expect, test, type Page } from '@playwright/test';

const section = (page: Page) => page.locator('#homeTab [data-home-row="parallax"]');
const strip = (page: Page) => section(page).locator('.tvl-home-row-cards');
const scene = (page: Page) => section(page).locator('.tvl-seasonal-scene');

async function fixture(page: Page, count = 60, background = 'parallax', expansion = 'none') {
  await page.addInitScript(({ background, expansion }) => localStorage.setItem(
    `jellyfin-cinema.home-collections.v1:${encodeURIComponent(location.origin)}:demo`, JSON.stringify({ version: 1, rows: [{
      id: 'seasons', kind: 'seasonal', title: '', collectionIds: [], ranked: false, placement: 'start', children: [{
        id: 'parallax', kind: 'items', title: 'Spooky Season', collectionIds: ['collection-coast'], ranked: false,
        season: { start: '01-01', end: '12-31' }, appearance: { theme: 'halloween', background, expansion,
          backgroundStyle: 'nightmare', frame: false, reveal: 'none' }
      }]
    }] })
  ), { background, expansion });
  await page.route('**/dist/demo.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\n(() => {
      const api=window.TvItemLayoutDemo.api, members=api.getCollectionItems;
      api.getCollectionItems=async id=>{
        const found=await members(id);if(id!=='collection-coast')return found;
        return Array.from({length:${count}},(_,i)=>({...found[i%found.length],Id:'parallax-film-'+i,Name:'Parallax film '+(i+1)}));
      };
    })();` });
  });
  await page.goto('/?featured=0&layout=tv#/home');
  await expect(section(page).locator('.tvl-home-row-card')).toHaveCount(count);
  await expect(page.locator('#homeTab')).not.toHaveClass(/tvl-home-initial-loading/);
  await section(page).locator('.tvl-home-row-card').first().focus();
  await expect(scene(page)).not.toHaveCSS('background-image', 'none');
  await page.waitForTimeout(450);
}

async function sample(page: Page, progress: number) {
  await strip(page).evaluate((node, progress) => {
    node.scrollLeft = progress * (node.scrollWidth - node.clientWidth);
    node.dispatchEvent(new Event('scroll'));
  }, progress);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  return scene(page).evaluate(node => {
    const rect = node.getBoundingClientRect(), clip = node.parentElement!.getBoundingClientRect();
    const matrix = getComputedStyle(node).transform;
    return { x: matrix === 'none' ? 0 : new DOMMatrixReadOnly(matrix).m41,
      width: rect.width, clipWidth: clip.width, left: rect.left - clip.left, right: rect.right - clip.right };
  });
}

for (const width of [960, 1280, 1920]) test(`parallax has a visible bounded sweep at ${width}px without a larger scenery layer`, async ({ page }) => {
  await page.setViewportSize({ width, height: 720 });
  await fixture(page);
  const samples = [];
  for (const progress of [0, .25, .5, .75, 1]) samples.push(await sample(page, progress));
  for (const position of samples) {
    expect(position.width / position.clipWidth).toBeCloseTo(1.15, 2);
    expect(position.left).toBeLessThan(-position.clipWidth * .007);
    expect(position.right).toBeGreaterThan(position.clipWidth * .007);
  }
  const travel = samples[0].x - samples[4].x;
  expect(travel / samples[0].clipWidth).toBeCloseTo(.135, 3);
  expect(travel).toBeGreaterThan(samples[0].clipWidth * .13);
  expect(Math.abs(samples[2].x)).toBeLessThan(1);
  expect(samples.map(position => position.x)).toEqual(samples.map(position => position.x).sort((a, b) => b - a));
});

test('full-screen expansion retains the stronger sweep and its covered edges', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await fixture(page, 12, 'parallax', 'fullscreen');
  await expect(section(page)).toHaveClass(/tvl-seasonal-expanded/);
  const first = await sample(page, 0), last = await sample(page, 1);
  expect((first.x - last.x) / first.clipWidth).toBeCloseTo(.135, 3);
  expect(first.left).toBeLessThan(-8); expect(last.right).toBeGreaterThan(8);
});

for (const background of ['static', 'parallax']) test(`${background} respects reduced motion throughout the row`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await fixture(page, 12, background);
  const first = await sample(page, 0), last = await sample(page, 1);
  expect(first.x).toBe(0); expect(last.x).toBe(0);
});

test('a burst of scroll events still performs only one parallax geometry read and transform update', async ({ page }) => {
  await fixture(page);
  const work = await strip(page).evaluate(async node => {
    const artwork = node.closest('.tvl-seasonal-row')!.querySelector<HTMLElement>('.tvl-seasonal-scene')!;
    const width = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollWidth')!;
    const client = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth')!;
    const range = node.scrollWidth - node.clientWidth;
    let scrollWidthReads = 0, clientWidthReads = 0, writes = 0;
    Object.defineProperty(node, 'scrollWidth', { configurable: true, get() { scrollWidthReads++; return width.get!.call(node); } });
    Object.defineProperty(node, 'clientWidth', { configurable: true, get() { clientWidthReads++; return client.get!.call(node); } });
    const observer = new MutationObserver(records => { writes += records.length; });
    observer.observe(artwork, { attributes: true, attributeFilter: ['style'] });
    for (let index = 1; index <= 20; index++) {
      node.scrollLeft = range * index / 20;
      node.dispatchEvent(new Event('scroll'));
    }
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    await Promise.resolve();
    observer.disconnect();
    delete (node as any).scrollWidth; delete (node as any).clientWidth;
    return { scrollWidthReads, clientWidthReads, writes };
  });
  expect(work).toEqual({ scrollWidthReads: 1, clientWidthReads: 1, writes: 1 });
});
