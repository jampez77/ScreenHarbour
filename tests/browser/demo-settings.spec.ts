import { expect, test } from '@playwright/test';

const route = '/?featured=0&layout=desktop#/mypreferencesmenu';

test('demo Settings has usable cards, local icons and a clear route back to Home', async ({ page }) => {
  await page.goto(route);
  const settings = page.locator('.demo-settings-page');
  const heading = settings.getByRole('heading', { name: 'Settings', exact: true });
  const cards = settings.locator('.tvl-settings-providers>.listItem-border');
  await expect(cards).toHaveCount(3);
  const bounds = await cards.evaluateAll(nodes => nodes.map(node => {
    const rect = node.getBoundingClientRect();
    const center = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    const icon = node.querySelector('.listItemIcon')!;
    return { x: rect.x, y: rect.y, width: rect.width, right: rect.right, hit: !!center && node.contains(center),
      iconFont: getComputedStyle(icon).fontSize, iconMask: getComputedStyle(icon, '::before').maskImage };
  }));
  const title = await heading.boundingBox();
  for (const [index, card] of bounds.entries()) {
    expect(card.x).toBeGreaterThan(20); expect(card.right).toBeLessThan(1440);
    expect(card.width).toBeGreaterThan(250); expect(card.y).toBeGreaterThan(title!.y + title!.height);
    expect(card.hit).toBe(true); expect(card.iconFont).toBe('0px'); expect(card.iconMask).not.toBe('none');
    if (index) { expect(card.x).toBeGreaterThan(bounds[index - 1].right); expect(card.y).toBe(bounds[0].y); }
  }
  await settings.getByRole('link', { name: 'Back to Home', exact: true }).click();
  await expect(page).toHaveURL(/#\/home$/);
  await expect(page.locator('#homeTab')).toBeVisible();
});

test('each demo Settings card opens its working editor and can return', async ({ page }) => {
  await page.goto('/?featured=0&layout=desktop#/details?id=movie-tide');
  await page.getByRole('navigation', { name: 'Preview media type', exact: true }).getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.locator('[data-demo-type="settings"]')).toHaveAttribute('aria-current', 'page');
  for (const [selector, role, editorName] of [
    ['.tvl-settings-collections-link', 'dialog', 'Customize Home rows'],
    ['.tvl-settings-provider-link', 'region', 'Streaming service settings'],
    ['.tvl-settings-loading-link', 'dialog', 'Loading screen settings'],
  ] as const) {
    await page.locator(selector).click();
    const dialog = page.getByRole(role, { name: editorName, exact: true });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.locator(selector)).toBeVisible();
  }
});

test('demo Settings fits a narrow screen and exposes the desktop and TV layouts', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(route);
  await expect(page.locator('.tvl-settings-collections-link')).toBeVisible();
  const boxes = await page.locator('.tvl-settings-providers>.listItem-border').evaluateAll(nodes => nodes.map(node => {
    const rect = node.getBoundingClientRect(); return { x: rect.x, right: rect.right, y: rect.y, bottom: rect.bottom };
  }));
  for (const [index, box] of boxes.entries()) {
    expect(box.x).toBeGreaterThan(15); expect(box.right).toBeLessThan(390);
    if (index) expect(box.y).toBeGreaterThan(boxes[index - 1].bottom);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole('link', { name: 'TV preview', exact: true }).click();
  await expect(page).toHaveURL(/layout=tv/);
  await expect(page.locator('.tvl-settings-collections-link')).toHaveCount(0);
  await expect(page.locator('.tvl-settings-provider-link')).toBeVisible();
  await page.getByRole('link', { name: 'Desktop preview', exact: true }).click();
  await expect(page.locator('.tvl-settings-collections-link')).toBeVisible();
});
