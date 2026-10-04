import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultSeasonalAppearance, homeCollectionKey, parseHomeCollections, parseSeasonalAppearance } from '../src/home-collection-settings.ts';
import { HomeCollectionStore, type HomeCollectionSnapshot } from '../src/home-collection-store.ts';
import { createHomeCollectionTransport } from '../src/home-collection-transport.ts';

const appearance = { ...defaultSeasonalAppearance('christmas'), reveal: 'advent' as const, coverStyle: 'photoreal' as const, rankStyle: 'storybook' as const };
const settings = (value: unknown = appearance, kind = 'items') => parseHomeCollections({ version: 1, rows: [
  { id: 'ordinary', kind: 'items', title: 'Keep this', collectionIds: ['ordinary-id'], itemSort: 'title' },
  { id: 'seasonal', kind: 'seasonal', placement: 'native:resume', children: [
    { id: 'advent', kind, title: 'A Christmas film a day', collectionIds: ['christmas-id'], ranked: true,
      season: { start: '12-01', end: '01-06' }, appearance: value, shuffle: true,
      itemSort: 'custom', itemOrder: ['film-3', 'film-1', 'film-2'], tabs: [
        { id: 'family', label: 'Family', collectionId: 'family-id', itemSort: 'custom', itemOrder: ['film-3', 'film-1'] },
        { id: 'classics', label: 'Classics', collectionId: 'classic-id', itemSort: 'oldest', itemOrder: [] }
      ] },
  ] }
] });

test('advent settings round trip optional, focus and daily choices without rewriting other row settings', () => {
  for (const value of [appearance, { ...appearance, adventUnlock: 'focus' }, { ...appearance, adventUnlock: 'daily' }]) {
    const parsed = settings(value);
    assert.deepEqual(parsed.rows[1].children![0].appearance, value);
    assert.deepEqual(parseHomeCollections(JSON.parse(JSON.stringify(parsed))), parsed);
    assert.equal(parsed.rows[0].title, 'Keep this');
    assert.equal(parsed.rows[1].placement, 'native:resume');
    assert.equal(parsed.rows[1].children![0].tabs![1].collectionId, 'classic-id');
    assert.equal(parsed.rows[1].children![0].shuffle, true);
  }
  assert.equal(Object.hasOwn(parseSeasonalAppearance(appearance)!, 'adventUnlock'), false);
});

test('invalid advent combinations remove only the decoration and preserve configured content', () => {
  for (const value of [
    ...[null, undefined, 1, true, {}, [], '', 'today', 'https://example.test'].map(adventUnlock => ({ ...appearance, adventUnlock })),
    { ...appearance, theme: 'halloween' },
    ...['none', 'doors', 'curtains', 'shutters'].map(reveal => ({ ...appearance, reveal, adventUnlock: 'daily' })),
  ]) {
    assert.equal(parseSeasonalAppearance(value), undefined);
    const child = settings(value).rows[1].children![0];
    assert.equal(child.appearance, undefined);
    assert.equal(child.title, 'A Christmas film a day');
    assert.equal(child.tabs![1].collectionId, 'classic-id');
    assert.deepEqual(child.season, { start: '12-01', end: '01-06' });
  }
  for (const kind of ['collections', 'watchlist']) {
    const child = settings(appearance, kind).rows[1].children![0];
    assert.equal(child.kind, kind); assert.equal(child.appearance, undefined);
  }
  const ordinary = parseHomeCollections({ version: 1, rows: [{ id: 'plain', kind: 'items', appearance }] });
  assert.equal(ordinary.rows[0].appearance, undefined);
});

test('advent choices survive native sync and cache reload with account isolation and stale-write protection', async () => {
  const original = settings({ ...appearance, adventUnlock: 'daily' });
  let saved: HomeCollectionSnapshot = { Revision: 'initial', Settings: original };
  let current = true, writes = 0;
  const transport = createHomeCollectionTransport({ getUrl: path => '/jellyfin/' + path,
    getJSON: async () => structuredClone(saved), ajax: async options => {
      assert.equal(options.headers['X-ScreenHarbour-Home-Rows'], '6');
      assert.equal(options.url, '/jellyfin/TvItemLayout/HomeCollections');
      const request = JSON.parse(options.data);
      assert.deepEqual(Object.keys(request).sort(), ['Revision', 'Settings']);
      if (request.Revision !== saved.Revision) throw { status: 409 };
      saved = { Revision: 'saved-' + ++writes, Settings: request.Settings }; return structuredClone(saved);
    } }, () => current);
  const entries = new Map<string, string>();
  const storage = { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); } };
  const key = homeCollectionKey('server', 'parents');
  const editor = new HomeCollectionStore(key, storage, transport), stale = new HomeCollectionStore(key, storage, transport);
  assert.deepEqual(await editor.load(), original); await stale.load();
  const draft = settings({ ...appearance, adventUnlock: 'focus' });
  assert.deepEqual(await editor.save(draft), draft);
  assert.deepEqual(new HomeCollectionStore(key, storage, transport).cached, draft);
  const cache = storage.getItem(key);
  await assert.rejects(stale.save(original), /changed on another device/);
  assert.equal(storage.getItem(key), cache); assert.deepEqual(saved.Settings, draft); assert.equal(writes, 1);
  assert.deepEqual(new HomeCollectionStore(homeCollectionKey('server', 'kids'), storage).cached.rows, []);
  current = false;
  await assert.rejects(editor.save(original), /account changed/);
  assert.equal(storage.getItem(key), cache); assert.equal(writes, 1);
});
