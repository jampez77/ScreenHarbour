import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HomeCollectionStore, HomeCollectionSyncError, boundedHomeSettings, type HomeCollectionSnapshot, type HomeCollectionTransport } from '../src/home-collection-store.ts';
import { createHomeCollectionTransport } from '../src/home-collection-transport.ts';
import { homeCollectionKey, parseHomeCollections, defaultSeasonalAppearance } from '../src/home-collection-settings.ts';

const rows = (title: string) => parseHomeCollections({ version: 1, rows: [{ id: 'row', kind: 'items', title, collectionIds: ['collection'], ranked: true }] });
const empty = () => ({ version: 1 as const, rows: [] });
class MemoryStorage {
  data = new Map<string, string>(); writes = 0;
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.writes++; this.data.set(key, value); }
}
class Server implements HomeCollectionTransport {
  current = true; writes = 0; revision = 0;
  snapshot: HomeCollectionSnapshot = { Revision: null, Settings: null };
  isCurrent = () => this.current;
  async load() { return structuredClone(this.snapshot); }
  async save(settings: ReturnType<typeof rows>, revision: string | null) {
    if (revision !== this.snapshot.Revision) throw new HomeCollectionSyncError('conflict', 'Changed on another device');
    this.writes++; this.snapshot = { Revision: String(++this.revision), Settings: structuredClone(settings) };
    return structuredClone(this.snapshot);
  }
}
const key = homeCollectionKey('stable-server-id', 'user-a');
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };

test('fresh TV never writes its empty defaults; desktop migrates populated rows once and TV receives them', async () => {
  const server = new Server(), tvStorage = new MemoryStorage(), desktopStorage = new MemoryStorage();
  desktopStorage.setItem(key, JSON.stringify(rows('Desktop rows')));
  const tv = new HomeCollectionStore(key, tvStorage, server), desktop = new HomeCollectionStore(key, desktopStorage, server);
  assert.deepEqual(await tv.load(), empty()); assert.equal(server.writes, 0);
  assert.equal((await desktop.load()).rows[0].title, 'Desktop rows'); assert.equal(server.writes, 1);
  assert.equal((await tv.load()).rows[0].title, 'Desktop rows');
  await desktop.load(); await tv.load(); assert.equal(server.writes, 1);
});
test('racing first-device migrations use conditional create and both load the winner', async () => {
  const server = new Server(), a = new MemoryStorage(), b = new MemoryStorage();
  a.setItem(key, JSON.stringify(rows('First'))); b.setItem(key, JSON.stringify(rows('Second')));
  const results = await Promise.all([new HomeCollectionStore(key, a, server).load(), new HomeCollectionStore(key, b, server).load()]);
  assert.equal(server.writes, 1); assert.deepEqual(results[0], results[1]);
});
test('migration requires a confirmed server copy and retains local rows if the response is absent', async () => {
  const storage = new MemoryStorage(); storage.setItem(key, JSON.stringify(rows('Legacy')));
  const store = new HomeCollectionStore(key, storage, { isCurrent: () => true,
    load: async () => ({ Revision: null, Settings: null }), save: async () => ({ Revision: null, Settings: null }) });
  await assert.rejects(store.load(), /did not confirm/); assert.equal(store.cached.rows[0].title, 'Legacy');
  await assert.rejects(store.save(rows('Draft')), /Load the saved/);
});
test('saved empty settings are authoritative and cannot resurrect another device’s old rows', async () => {
  const server = new Server(), storage = new MemoryStorage(); storage.setItem(key, JSON.stringify(rows('Old rows')));
  const editor = new HomeCollectionStore(key, storage, server); await editor.load(); await editor.save(empty());
  const oldDevice = new MemoryStorage(); oldDevice.setItem(key, JSON.stringify(rows('Old TV rows')));
  assert.deepEqual(await new HomeCollectionStore(key, oldDevice, server).load(), empty()); assert.equal(server.writes, 2);
  const offline = new HomeCollectionStore(key, storage, { ...server, isCurrent: () => true, load: async () => { throw new Error('offline'); }, save: server.save.bind(server) });
  assert.deepEqual(offline.cached, empty()); await assert.rejects(offline.load(), /offline/); assert.deepEqual(offline.cached, empty());
});
test('concurrent editor save rejects stale revision and preserves local cache and draft', async () => {
  const server = new Server(); await server.save(rows('Original'), null);
  const a = new HomeCollectionStore(key, new MemoryStorage(), server), storageB = new MemoryStorage();
  const b = new HomeCollectionStore(key, storageB, server); await a.load(); await b.load();
  await a.save(rows('Saved elsewhere')); const before = storageB.getItem(key), draft = rows('My draft');
  await assert.rejects(b.save(draft), error => error instanceof HomeCollectionSyncError && error.kind === 'conflict');
  assert.equal(storageB.getItem(key), before); assert.equal(draft.rows[0].title, 'My draft');
  await assert.rejects(b.save(draft), /Load the saved/); assert.equal((await b.load()).rows[0].title, 'Saved elsewhere');
});
test('failed save never updates cache or claims success and can retry the same revision', async () => {
  const server = new Server(), storage = new MemoryStorage(); await server.save(rows('Original'), null);
  let fail = true;
  const transport = { isCurrent: server.isCurrent, load: server.load.bind(server), save: async (...args: Parameters<Server['save']>) => { if (fail) throw new Error('offline'); return server.save(...args); } };
  const store = new HomeCollectionStore(key, storage, transport); await store.load();
  await assert.rejects(store.save(rows('Draft')), /offline/); assert.equal(store.cached.rows[0].title, 'Original');
  fail = false; assert.equal((await store.save(rows('Draft'))).rows[0].title, 'Draft');
});
test('account changes and disposed views cannot adopt delayed reads or delayed writes', async () => {
  const pending = deferred<HomeCollectionSnapshot>(), storage = new MemoryStorage(); let current = true;
  const store = new HomeCollectionStore(key, storage, { isCurrent: () => current, load: () => pending.promise, save: async () => { throw new Error('unexpected write'); } });
  const load = store.load(); current = false; pending.resolve({ Revision: '1', Settings: rows('Other session') });
  await assert.rejects(load, error => error instanceof HomeCollectionSyncError && error.kind === 'stale'); assert.equal(storage.writes, 0);
  const server = new Server(); await server.save(rows('Original'), null);
  const late = deferred<HomeCollectionSnapshot>();
  const editor = new HomeCollectionStore(key, storage, { isCurrent: () => true, load: server.load.bind(server), save: () => late.promise });
  await editor.load(); const writes = storage.writes, saving = editor.save(rows('Later')); editor.destroy();
  late.resolve({ Revision: '2', Settings: rows('Later') }); await assert.rejects(saving, /account changed/); assert.equal(storage.writes, writes);
});
test('already stale sessions perform no transport operations and block saves before loading', async () => {
  const server = new Server(); server.current = false;
  const store = new HomeCollectionStore(key, new MemoryStorage(), server);
  await assert.rejects(store.load(), /account changed/); await assert.rejects(store.save(rows('No')), /account changed/); assert.equal(server.writes, 0);
  server.current = true; await assert.rejects(store.save(rows('No')), /Load the saved/); assert.equal(server.writes, 0);
});
test('cached rows survive offline reads, malformed responses and unavailable browser storage', async () => {
  const storage = new MemoryStorage(); storage.setItem(key, JSON.stringify(rows('Cached')));
  const store = new HomeCollectionStore(key, storage, { isCurrent: () => true, load: async () => ({ Revision: 'broken', Settings: { version: 2, rows: [] } } as any), save: async () => { throw new Error('unexpected'); } });
  assert.equal(store.cached.rows[0].title, 'Cached'); await assert.rejects(store.load(), /invalid/); assert.equal(store.cached.rows[0].title, 'Cached');
  const server = new Server(); await server.save(rows('On server'), null);
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const sync = new HomeCollectionStore(key, blocked, server); await sync.load(); assert.equal((await sync.save(rows('Saved'))).rows[0].title, 'Saved');
  const local = new HomeCollectionStore(key, blocked); await local.load(); await assert.rejects(local.save(rows('Local')), /could not be saved/);
});
test('stable server/user keys isolate cache while legacy URL data can seed the same server account', async () => {
  const server = new Server(), storage = new MemoryStorage(); const old = homeCollectionKey('http://old-host:8096', 'user-a');
  storage.setItem(old, JSON.stringify(rows('Migrated URL')));
  const store = new HomeCollectionStore(key, storage, server, [old]); await store.load();
  assert.equal(storage.getItem(key) && JSON.parse(storage.getItem(key)!).rows[0].title, 'Migrated URL');
  assert.deepEqual(new HomeCollectionStore(homeCollectionKey('stable-server-id', 'user-b'), storage).cached, empty());
  assert.deepEqual(new HomeCollectionStore(homeCollectionKey('other-server-id', 'user-a'), storage).cached, empty());
});
test('settings size uses UTF-8 bytes and rejects oversize before any save request', async () => {
  assert.throws(() => boundedHomeSettings({ version: 1, rows: [], ignored: '😀'.repeat(140000) }), /too large/);
  const server = new Server(), store = new HomeCollectionStore(key, new MemoryStorage(), server); await store.load();
  await assert.rejects(store.save({ version: 1, rows: [], ignored: 'x'.repeat(524288) } as any), /too large/); assert.equal(server.writes, 0);
});
test('native transport uses current authentication with no caller-selected user and translates conflicts', async () => {
  const calls: any[] = []; let current = true;
  const transport = createHomeCollectionTransport({ getUrl: path => '/jellyfin/' + path, getJSON: async url => { calls.push(url); return { Revision: null, Settings: null }; }, ajax: async options => { calls.push(options); throw { status: 409 }; } }, () => current);
  await transport.load(); await assert.rejects(transport.save(rows('Draft'), null), error => error instanceof HomeCollectionSyncError && error.kind === 'conflict');
  assert.equal(calls[0], '/jellyfin/TvItemLayout/HomeCollections'); assert.equal(calls[1].type, 'PUT');
  assert.equal(calls[1].headers['X-ScreenHarbour-Home-Rows'], '6');
  assert.deepEqual(Object.keys(JSON.parse(calls[1].data)).sort(), ['Revision', 'Settings']); assert.equal(calls[1].url.includes('user'), false);
  current = false; await assert.rejects(transport.load(), /account changed/); assert.equal(calls.length, 2);
});
test('native transport explains server size rejection and does not hide failed authorization', async () => {
  for (const [status, message] of [[413, /Reduce custom item orders/], [401, /Sign in again/], [404, /Update ScreenHarbour/]] as const) {
    const transport = createHomeCollectionTransport({ getUrl: path => path, getJSON: async () => { throw { status }; }, ajax: async () => { throw { status }; } }, () => true);
    await assert.rejects(transport.load(), message); await assert.rejects(transport.save(rows('Draft'), null), message);
  }
});
test('appearance survives native transport and cached reload, then can be explicitly removed', async () => {
  const settings = parseHomeCollections({ version: 1, rows: [{ id: 'seasonal', kind: 'seasonal', children: [
    { id: 'halloween', kind: 'items', collectionIds: ['horror'], season: { start: '10-01', end: '10-31' },
      appearance: { ...defaultSeasonalAppearance('halloween'), background: 'parallax', reveal: 'curtains', rankStyle: 'nightmare' } },
  ] }] });
  let saved = { Revision: 'first', Settings: settings };
  const transport = createHomeCollectionTransport({ getUrl: path => path, getJSON: async () => saved, ajax: async options => {
    assert.equal(options.headers['X-ScreenHarbour-Home-Rows'], '6');
    const request = JSON.parse(options.data); assert.equal(request.Revision, saved.Revision);
    saved = { Revision: saved.Revision + '-next', Settings: request.Settings }; return saved;
  } }, () => true);
  const storage = new MemoryStorage(), store = new HomeCollectionStore(key, storage, transport);
  assert.deepEqual(await store.load(), settings);
  assert.deepEqual(await store.save(settings), settings);
  assert.deepEqual(new HomeCollectionStore(key, storage, transport).cached, settings);
  const plain = parseHomeCollections(settings); delete plain.rows[0].children![0].appearance;
  assert.deepEqual(await store.save(plain), plain);
  assert.equal(saved.Settings.rows[0].children![0].appearance, undefined);
  assert.equal(new HomeCollectionStore(key, storage, transport).cached.rows[0].children![0].appearance, undefined);
});
