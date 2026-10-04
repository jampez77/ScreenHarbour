import { type Page } from '@playwright/test';

export const collectionRowsSettingsLink = (page: Page) => page.getByRole('link', {
  name: 'Collection rows Home collections and seasonal rows', exact: true
});

/** Open the editor through the desktop Settings navigation used by customers. */
export async function openCollectionRowsFromSettings(page: Page): Promise<void> {
  await page.evaluate(() => { location.hash = '/mypreferencesmenu'; });
  await collectionRowsSettingsLink(page).click();
}
