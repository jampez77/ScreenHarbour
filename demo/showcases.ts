import { homeCollectionKey, type HomeCollectionRow, type HomeCollectionSettings } from '../src/home-collection-settings';

export type DemoShowcase = 'latest' | 'halloween' | 'christmas' | 'advent';
export const showcaseCollectionId = 'collection-showcase-films';

export function readDemoShowcase(search: string): DemoShowcase | undefined {
  const value = new URLSearchParams(search).get('showcase');
  return value === 'latest' || value === 'halloween' || value === 'christmas' || value === 'advent' ? value : undefined;
}

/** Only the Advent example supplies a seasonal calendar; playback and the browser clock stay real. */
export function demoAdventDate(search: string, today = new Date()): Date {
  const day = Number(new URLSearchParams(search).get('adventDay') || 3);
  return new Date(today.getFullYear(), 11, Number.isInteger(day) && day >= 1 && day <= 24 ? day : 3, 12);
}

/** Sample accounts have their own preferences; visiting a link never replaces normal demo edits. */
export function demoUserForShowcase(showcase: DemoShowcase | undefined): string {
  return showcase ? `demo-showcase-${showcase}-v1` : 'demo';
}

export function demoShowcaseSettings(showcase: DemoShowcase): HomeCollectionSettings {
  const items = (id: string, title: string): HomeCollectionRow => ({ id, title, kind: 'items',
    collectionIds: [showcaseCollectionId], ranked: true, placement: 'start', itemSort: 'collection', itemOrder: [] });
  const halloween: HomeCollectionRow = { ...items('showcase-halloween', 'Halloween film night'), shuffle: true,
    season: { start: '10-01', end: '10-31' }, appearance: { theme: 'halloween', background: 'parallax',
      backgroundStyle: 'classic', expansion: 'fullscreen', frame: true, frameStyle: 'classic',
      reveal: 'doors', coverStyle: 'classic', rankStyle: 'classic' } };
  const christmas: HomeCollectionRow = { ...items('showcase-christmas', 'Christmas countdown'),
    season: { start: '12-01', end: '12-31' }, appearance: { theme: 'christmas', background: 'parallax',
      backgroundStyle: 'photoreal', expansion: 'fullscreen', frame: true, frameStyle: 'photoreal',
      reveal: 'advent', coverStyle: 'photoreal', rankStyle: 'photoreal', adventUnlock: 'focus' } };
  const advent: HomeCollectionRow = { ...christmas, id: 'showcase-advent', title: 'Christmas Advent calendar',
    season: { start: '12-01', end: '12-24' }, appearance: { ...christmas.appearance!, adventUnlock: 'daily' } };
  const children = showcase === 'latest' ? [halloween, christmas]
    : [showcase === 'halloween' ? halloween : showcase === 'advent' ? advent : christmas];
  // Dedicated visual previews remain usable in any month. The latest showcase
  // uses ordinary October/December schedules, through the production date logic.
  if (showcase === 'halloween' || showcase === 'christmas') children[0].season = { start: '01-01', end: '12-31' };
  return { version: 1, rows: [items('showcase-trending', 'Trending Movies'), {
    ...items('showcase-seasons', ''), kind: 'seasonal', ranked: false, collectionIds: [], children
  }] };
}

export function seedDemoShowcase(storage: Pick<Storage, 'getItem' | 'setItem'>, server: string, showcase: DemoShowcase | undefined): void {
  if (!showcase) return;
  const key = homeCollectionKey(server, demoUserForShowcase(showcase));
  // An explicitly saved empty configuration is a visitor choice too.
  if (storage.getItem(key) === null) storage.setItem(key, JSON.stringify(demoShowcaseSettings(showcase)));
}
