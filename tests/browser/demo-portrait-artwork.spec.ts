import { expect, test } from '@playwright/test';

for (const theme of ['halloween', 'christmas']) test(`${theme} demo uses portrait film artwork inside its seasonal frames`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/?featured=0&layout=desktop&showcase=${theme}#/home`);
  const row = page.locator(`#homeTab [data-home-row="showcase-${theme}"]`);
  const posters = row.locator('.tvl-seasonal-poster');
  await expect(posters).toHaveCount(5);
  await row.locator('.tvl-home-row-card').first().focus();
  await expect.poll(() => posters.evaluateAll(images => images.every(image => {
    const poster = image as HTMLImageElement;
    return poster.complete && poster.naturalWidth > 0;
  }))).toBe(true);
  const dimensions = await posters.evaluateAll(images => images.map(image => {
    const poster = image as HTMLImageElement;
    const bounds = poster.getBoundingClientRect();
    const scale = Math.min(bounds.width / poster.naturalWidth, bounds.height / poster.naturalHeight);
    return {
      source: new URL(poster.currentSrc).pathname,
      naturalRatio: poster.naturalWidth / poster.naturalHeight,
      displayedRatio: bounds.width / bounds.height,
      // object-fit:contain keeps titles visible: a landscape fixture used to
      // occupy only a shallow strip even though its element was portrait.
      filledHeight: poster.naturalHeight * scale / bounds.height,
    };
  }));
  for (const poster of dimensions) {
    expect(poster.source).toMatch(/\/demo\/assets\/posters\/.+\.svg$/);
    expect(poster.naturalRatio).toBeCloseTo(2 / 3);
    expect(poster.displayedRatio).toBeLessThan(1);
    expect(poster.filledHeight).toBeGreaterThan(.95);
  }
});
