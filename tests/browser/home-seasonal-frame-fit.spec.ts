import { expect, test, type Locator, type Page } from '@playwright/test';
import { openCollectionRowsFromSettings } from './collection-rows-fixture';
import { defaultSeasonalAppearance, type HomeCollectionRow, type HomeSeasonalAppearance, type HomeSeasonalArtStyle } from '../../src/home-collection-settings';
import { useDesktopLayout } from './layout-fixture';

// A solid sentinel makes poster pixels distinguishable from every frame and door.
// Inspect the actual screenshot: a 100%-sized <img> can still have transparent
// artwork padding, so bounding rectangles alone do not detect this regression.
const solidPoster = (width = 300) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="440"><path fill="#ff00ff" d="M0 0h${width}v440H0z"/></svg>`)}`;
const themes = ['halloween', 'christmas'] as const;
const styles = (theme: HomeSeasonalAppearance['theme']): HomeSeasonalArtStyle[] => theme === 'halloween'
  ? ['classic', 'storybook', 'photoreal', 'nightmare'] : ['classic', 'storybook', 'photoreal'];
const homeRow = (page: Page, id: string) => page.locator(`#homeTab [data-home-row="${id}"]`);
const editor = (page: Page) => page.getByRole('dialog', { name: 'Customize Home rows', exact: true });
const preview = (page: Page) => editor(page).getByRole('complementary', { name: 'Home row preview', exact: true });

async function fixture(page: Page, appearance?: Partial<HomeSeasonalAppearance>, artwork: 'poster' | 'wide' | 'missing' | 'error' = 'poster') {
  const base = (id: string): HomeCollectionRow => ({ id, kind: 'items', title: id, collectionIds: ['collection-coast'],
    ranked: false, placement: 'start', itemSort: 'collection', itemOrder: [] });
  const settings = { version: 1, rows: [{ ...base('seasonal'), kind: 'seasonal', title: '', collectionIds: [], children:
    ['Plain', 'Ranked'].map(id => ({ ...base(id), ranked: id === 'Ranked', season: { start: '01-01', end: '12-31' },
      ...(appearance ? { appearance: { ...defaultSeasonalAppearance('halloween'), background: 'none', expansion: 'none', reveal: 'none', ...appearance } } : {}) }))
  }] };
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(settings => {
    localStorage.setItem(`jellyfin-cinema.home-collections.v1:${encodeURIComponent(location.origin)}:demo`, JSON.stringify(settings));
  }, settings);
  await page.route('**/missing-seasonal-poster.png', route => route.fulfill({ status: 404, body: '' }));
  await page.route('**/dist/demo.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\n(()=>{
      const api=window.TvItemLayoutDemo.api;
      api.homeCollections={isCurrent:()=>true,load:async()=>({Revision:'frame-fit',Settings:${JSON.stringify(settings)}}),save:async()=>{throw new Error('Unexpected write')}};
      api.getCollectionItems=async()=>Array.from({length:2},(_,i)=>({Id:'frame-film-'+i,Type:'Movie',Name:'Frame film '+(i+1)}));
      const image=api.image;api.image=(item,kind)=>item.Id.startsWith('frame-film-')?${JSON.stringify(artwork === 'missing' ? null : artwork === 'error' ? '/missing-seasonal-poster.png' : solidPoster(artwork === 'wide' ? 880 : 300))}:image(item,kind);
    })();` });
  });
  await page.goto('/?featured=0&layout=tv#/home');
  await expect(homeRow(page, 'Ranked').locator('.tvl-home-row-card')).toHaveCount(2);
}

async function pixels(card: Locator) {
  const art = card.locator('.tvl-home-row-art');
  await art.locator('img').evaluateAll(async images => {
    await Promise.all(images.map(image => (image as HTMLImageElement).decode()));
  });
  const screenshot = await art.screenshot({ animations: 'disabled' });
  return art.evaluate(async (node, encoded) => {
    const screenshot = new Image(); screenshot.src = `data:image/png;base64,${encoded}`; await screenshot.decode();
    const canvas = document.createElement('canvas'); canvas.width = screenshot.width; canvas.height = screenshot.height;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(screenshot, 0, 0);
    const rendered = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const bounds = node.getBoundingClientRect(), scaleX = canvas.width / bounds.width, scaleY = canvas.height / bounds.height;
    const frame = node.querySelector<HTMLImageElement>('.tvl-seasonal-frame');
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (frame) {
      const frameBounds = frame.getBoundingClientRect();
      context.drawImage(frame, (frameBounds.left - bounds.left) * scaleX, (frameBounds.top - bounds.top) * scaleY,
        frameBounds.width * scaleX, frameBounds.height * scaleY);
    }
    const material = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let posterPixels = 0, escapedPixels = 0;
    let middleLeft = canvas.width, middleRight = -1;
    for (let y = 0; y < canvas.height; y++) {
      let left = canvas.width, right = -1;
      for (let x = 0; x < canvas.width; x++) {
        if (material[(y * canvas.width + x) * 4 + 3] >= 128) { left = Math.min(left, x); right = x; }
      }
      if (y === Math.floor(canvas.height / 2)) { middleLeft = left / scaleX; middleRight = (canvas.width - 1 - right) / scaleX; }
      for (let x = 0; x < canvas.width; x++) {
        const p = (y * canvas.width + x) * 4;
        if (!(rendered[p] > 235 && rendered[p + 1] < 20 && rendered[p + 2] > 235)) continue;
        posterPixels++;
        // The Halloween arch intentionally has no bottom sill; ignore its final
        // two percent, where the authored side rails fade out. Elsewhere, the
        // poster must stay within the frame's visible silhouette on each line.
        if (y < canvas.height * .98 && (x < left - 1.5 * scaleX || x > right + 1.5 * scaleX)) escapedPixels++;
      }
    }
    const image = node.querySelector<HTMLImageElement>('.tvl-seasonal-poster');
    let posterCoverage: number | undefined, posterEdges: Record<string, number> | undefined;
    if (image) {
      // The whole source must fit, including titles printed at its edges. Check
      // the painted pixels rather than just the IMG's layout box: a full-size
      // box hidden behind a frame was the original regression.
      const rect = image.getBoundingClientRect();
      const fit = Math.min(rect.width / image.naturalWidth, rect.height / image.naturalHeight);
      const width = image.naturalWidth * fit, height = image.naturalHeight * fit;
      const left = (rect.left - bounds.left + (rect.width - width) / 2) * scaleX;
      const top = (rect.top - bounds.top + (rect.height - height) / 2) * scaleY;
      const right = left + width * scaleX, bottom = top + height * scaleY;
      posterCoverage = posterPixels / (width * scaleX * height * scaleY);
      const magenta = (x: number, y: number) => {
        const p = (y * canvas.width + x) * 4;
        return rendered[p] > 235 && rendered[p + 1] < 20 && rendered[p + 2] > 235;
      };
      const x1 = Math.ceil(left) + 1, x2 = Math.floor(right) - 2;
      const y1 = Math.ceil(top) + 1, y2 = Math.floor(bottom) - 2;
      const horizontal = (y: number) => {
        let seen = 0;
        for (let x = x1; x <= x2; x++) if (magenta(x, y)) seen++;
        return seen / (x2 - x1 + 1);
      };
      const vertical = (x: number) => {
        let seen = 0;
        for (let y = y1; y <= y2; y++) if (magenta(x, y)) seen++;
        return seen / (y2 - y1 + 1);
      };
      posterEdges = { top: horizontal(y1), bottom: horizontal(y2), left: vertical(x1), right: vertical(x2) };
    }
    return { posterFraction: posterPixels / (canvas.width * canvas.height), escapedPixels, middleLeft, middleRight, posterCoverage, posterEdges };
  }, screenshot.toString('base64'));
}

async function expectFittedPoster(card: Locator, windowBars = false) {
  if (!await card.locator('.tvl-no-art').count()) await expect(card.locator('.tvl-seasonal-poster')).toHaveCount(1);
  const result = await pixels(card);
  expect(result.posterFraction, 'the poster remains visible inside its frame').toBeGreaterThan(.15);
  expect(result.escapedPixels, 'poster pixels must not leak above the arch or outside its rails').toBe(0);
  expect(result.middleLeft, 'visible left rail reaches the card edge').toBeLessThanOrEqual(2);
  expect(result.middleRight, 'visible right rail reaches the card edge').toBeLessThanOrEqual(2);
  // Shutters deliberately add window crossbars over the revealed image. Other
  // frame/reveal combinations must leave the complete image unobstructed.
  if (result.posterCoverage !== undefined && !windowBars) {
    expect(result.posterCoverage, 'the full poster is contained without being clipped or stretched to fill').toBeGreaterThan(.96);
    expect(result.posterCoverage, 'the poster keeps its source aspect ratio').toBeLessThan(1.04);
    for (const [edge, visibility] of Object.entries(result.posterEdges!)) {
      expect(visibility, `the poster's ${edge} edge is not covered by its frame`).toBeGreaterThan(.98);
    }
  }
}

for (const theme of themes) for (const frameStyle of styles(theme)) {
  test(`${theme} ${frameStyle} fits ranked and ordinary Home cards and narrow editor previews`, async ({ page }) => {
    test.setTimeout(60_000);
    await fixture(page, { theme, frameStyle });
    for (const id of ['Plain', 'Ranked']) await expectFittedPoster(homeRow(page, id).locator('.tvl-home-row-card').first());
    await useDesktopLayout(page);
    await openCollectionRowsFromSettings(page);
    await page.setViewportSize({ width: 390, height: 900 });
    for (const id of ['Plain', 'Ranked']) {
      await editor(page).getByRole('button', { name: `Edit ${id}`, exact: true }).click();
      await expect(preview(page).locator('.tvl-home-row-card')).toHaveCount(2);
      await expectFittedPoster(preview(page).locator('.tvl-home-row-card').first());
      await editor(page).getByRole('button', { name: 'Back to seasonal group', exact: true }).click();
    }
  });
}

for (const theme of themes) test(`${theme} mixed covers hide the entire poster and reveal it within the photographic frame`, async ({ page }) => {
  test.setTimeout(60_000);
  await fixture(page, { theme, frameStyle: 'photoreal', coverStyle: 'storybook', reveal: 'doors' });
  await useDesktopLayout(page);
  await openCollectionRowsFromSettings(page);
  await editor(page).getByRole('button', { name: 'Edit Plain', exact: true }).click();
  await editor(page).getByRole('button', { name: 'Appearance', exact: true }).click();
  for (const reveal of theme === 'christmas' ? ['doors', 'shutters', 'curtains', 'advent'] : ['doors', 'shutters', 'curtains']) {
    await editor(page).getByRole('combobox', { name: 'Item reveal', exact: true }).selectOption(reveal);
    const cards = preview(page).locator('.tvl-home-row-card');
    await expect(cards).toHaveCount(2);
    await page.mouse.move(0, 0);
    expect((await pixels(cards.first())).posterFraction, `${reveal} completely conceals the poster`).toBe(0);
    await cards.first().focus();
    await expect(cards.first()).toHaveClass(/tvl-seasonal-item-open/);
    await expectFittedPoster(cards.first(), reveal === 'shutters');
    await cards.nth(1).focus();
    await expect(cards.first()).not.toHaveClass(/tvl-seasonal-item-open/);
    expect((await pixels(cards.first())).posterFraction, `${reveal} closes after focus moves away`).toBe(0);
  }
});

for (const artwork of ['missing', 'error'] as const) test(`${artwork} poster fallback fits the photographic arch`, async ({ page }) => {
  await fixture(page, { theme: 'halloween', frameStyle: 'photoreal' }, artwork);
  const card = homeRow(page, 'Plain').locator('.tvl-home-row-card').first();
  await expect(card.locator('.tvl-no-art')).toHaveCount(1);
  await page.addStyleTag({ content: '.tvl-no-art::before,.tvl-no-art > .tvl-seasonal-aperture {background:#ff00ff!important}' });
  await expectFittedPoster(card);
});

test('wide item artwork remains fully visible inside the photographic arch', async ({ page }) => {
  await fixture(page, { theme: 'halloween', frameStyle: 'photoreal' }, 'wide');
  for (const id of ['Plain', 'Ranked']) await expectFittedPoster(homeRow(page, id).locator('.tvl-home-row-card').first());
});

test('normal seasonal rows retain their full poster without aperture or frame layers', async ({ page }) => {
  await fixture(page);
  const normal = homeRow(page, 'Plain').locator('.tvl-home-row-card').first();
  await expect(normal.locator('.tvl-seasonal-aperture,.tvl-seasonal-frame')).toHaveCount(0);
  expect((await pixels(normal)).posterFraction).toBeGreaterThan(.98);
});

test('photographic covers work without a frame and do not change the poster dimensions', async ({ page }) => {
  await fixture(page, { theme: 'halloween', frame: false, frameStyle: 'photoreal', coverStyle: 'photoreal', reveal: 'doors' });
  const card = homeRow(page, 'Plain').locator('.tvl-home-row-card').first();
  const dimensions = await card.locator('.tvl-home-row-art').evaluate(node => ({ width: node.clientWidth, height: node.clientHeight }));
  await expect(card).toHaveAttribute('data-seasonal-reveal', 'doors');
  await expect(card.locator('.tvl-seasonal-aperture,.tvl-seasonal-frame')).toHaveCount(0);
  expect((await pixels(card)).posterFraction).toBe(0);
  await card.focus();
  await expect(card).toHaveClass(/tvl-seasonal-item-open/);
  expect((await pixels(card)).posterFraction).toBeGreaterThan(.98);
  expect(await card.locator('.tvl-home-row-art').evaluate(node => ({ width: node.clientWidth, height: node.clientHeight }))).toEqual(dimensions);
});
