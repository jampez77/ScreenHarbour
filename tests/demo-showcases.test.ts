import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoAdventDate, demoShowcaseSettings, demoUserForShowcase, readDemoShowcase, seedDemoShowcase } from '../demo/showcases.ts';
import { activeHomeRows, homeCollectionKey, parseHomeCollections } from '../src/home-collection-settings.ts';

test('showcases are opt-in and have separate preferences from the normal demo and each other', () => {
  assert.equal(readDemoShowcase(''), undefined);
  assert.equal(readDemoShowcase('?showcase=unknown'), undefined);
  assert.equal(demoUserForShowcase(undefined), 'demo');
  const store = new Map<string, string>();
  const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value); } };
  const server = 'https://demo.example';
  const normalKey = homeCollectionKey(server, 'demo');
  store.set(normalKey, 'ordinary visitor settings');
  seedDemoShowcase(storage, server, undefined);
  assert.equal(store.size, 1);
  for (const showcase of ['latest', 'halloween', 'christmas', 'advent'] as const) {
    assert.equal(readDemoShowcase(`?layout=tv&showcase=${showcase}`), showcase);
    seedDemoShowcase(storage, server, showcase);
    const key = homeCollectionKey(server, demoUserForShowcase(showcase));
    const empty = JSON.stringify({ version: 1, rows: [] });
    store.set(key, empty);
    seedDemoShowcase(storage, server, showcase);
    assert.equal(store.get(key), empty, 'a saved empty configuration must not be reseeded');
  }
  assert.equal(store.size, 5);
  assert.equal(store.get(normalKey), 'ordinary visitor settings');
});

test('latest follows annual dates while theme previews stay available all year using validated production settings', () => {
  const latest = demoShowcaseSettings('latest');
  for (const showcase of ['latest', 'halloween', 'christmas', 'advent'] as const) {
    const settings = demoShowcaseSettings(showcase);
    assert.deepEqual(parseHomeCollections(settings), settings);
    assert.equal(settings.rows[0].title, 'Trending Movies');
    for (const child of settings.rows[1].children!) {
      assert.equal(child.appearance?.expansion, 'fullscreen');
      assert.equal(child.appearance?.background, 'parallax');
      assert.equal(child.appearance?.frame, true);
      assert.equal(child.ranked, true);
    }
  }
  assert.deepEqual(activeHomeRows(latest, new Date(2026, 6, 1)).map(row => row.id), ['showcase-trending']);
  assert.deepEqual(activeHomeRows(latest, new Date(2026, 9, 15)).map(row => row.id), ['showcase-trending', 'showcase-halloween']);
  assert.deepEqual(activeHomeRows(latest, new Date(2026, 11, 15)).map(row => row.id), ['showcase-trending', 'showcase-christmas']);
  for (const month of [0, 6, 11]) for (const theme of ['halloween', 'christmas'] as const) {
    assert.deepEqual(activeHomeRows(demoShowcaseSettings(theme), new Date(2026, month, 15)).map(row => row.id), ['showcase-trending', `showcase-${theme}`]);
  }
  assert.equal(demoShowcaseSettings('christmas').rows[1].children![0].appearance?.adventUnlock, 'focus');
});

test('dated Advent uses December dates and a bounded independent preview calendar', () => {
  const today = new Date(2026, 6, 15, 12);
  const row = demoShowcaseSettings('advent').rows[1].children![0];
  assert.deepEqual(row.season, { start: '12-01', end: '12-24' });
  assert.equal(row.appearance?.adventUnlock, 'daily');
  assert.equal(demoAdventDate('', today).getDate(), 3);
  assert.equal(demoAdventDate('?adventDay=24', today).getDate(), 24);
  for (const day of ['0', '25', '-1', '1.5', 'bad']) assert.equal(demoAdventDate(`?adventDay=${day}`, today).getDate(), 3);
  assert.equal(demoAdventDate('', today).getMonth(), 11);
  assert.equal(today.getMonth(), 6);
});
