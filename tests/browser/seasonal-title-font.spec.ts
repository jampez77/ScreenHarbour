import { expect, test } from '@playwright/test';
import { buildSync } from 'esbuild';

const helper = buildSync({ entryPoints: ['src/home-seasonal-font.ts'], bundle: true, write: false,
  format: 'iife', globalName: 'SeasonalTitleFonts', target: 'chrome79' }).outputFiles[0].text;

test('all seasonal title fonts decode locally and only selected styles are downloaded', async ({ page }) => {
  const requests: string[] = [], failures: string[] = [];
  page.on('request', request => { if (request.resourceType() === 'font') requests.push(request.url()); });
  page.on('requestfailed', request => failures.push(request.url()));
  page.on('pageerror', error => failures.push(error.message));
  await page.route('**/font-verification', route => route.fulfill({ contentType: 'text/html',
    body: '<!doctype html><html><head></head><body style="background:#14141c;color:#f9e1a7"></body></html>' }));
  await page.goto('/font-verification');
  await page.addScriptTag({ content: helper });
  expect(requests).toHaveLength(0);
  const results = await page.evaluate(async () => {
    const results: Array<{ key: string; family: string; loaded: boolean }> = [];
    for (const theme of ['halloween', 'christmas'] as const) {
      for (const style of ['classic', 'storybook', 'photoreal', ...(theme === 'halloween' ? ['nightmare'] : [])]) {
        const title = document.createElement('h2');
        title.textContent = theme === 'halloween' ? 'Spooky Season • Fright Night' : 'Christmas Movies • Noël';
        title.style.cssText = 'font-family:var(--tvl-seasonal-title-font);font-weight:var(--tvl-seasonal-title-weight);font-size:42px;margin:20px;';
        document.body.append(title);
        await (window as any).SeasonalTitleFonts.applySeasonalTitleFont(title, theme, style);
        const computed = getComputedStyle(title);
        results.push({ key: `${theme}-${style}`, family: computed.fontFamily,
          loaded: document.fonts.check(`${computed.fontWeight} 42px ${computed.fontFamily.split(',')[0]}`) });
      }
    }
    return results;
  });
  expect(results.every(result => result.loaded)).toBe(true);
  expect(new Set(results.map(result => result.family)).size).toBe(7);
  expect(requests).toHaveLength(7);
  for (const url of requests) expect(url).toContain('http://127.0.0.1:4173/assets/seasonal-fonts/');
  expect(failures).toEqual([]);
});
