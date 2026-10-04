import assert from 'node:assert/strict';
import { test } from 'node:test';
import { homeCollectionKey, parseHomeCollections, rankImage, orderHomeItems, homeCollectionTabs, homeTabLabel,
  activeHomeRows, validSeasonDate, isSeasonActive, maxSeasonalRows, shuffleHomeItems, defaultSeasonalAppearance,
  parseSeasonalAppearance } from '../src/home-collection-settings.ts';

test('home collection preferences reject corrupt data, bound choices and preserve chosen order',()=>{
  assert.deepEqual(parseHomeCollections({version:2,rows:[]}),{version:1,rows:[]});
  const settings=parseHomeCollections({version:1,rows:[
    {id:'row',kind:'collections',title:' Collections ',collectionIds:['second','first','second',null],ranked:true},
    {id:'row',kind:'items',collectionIds:['hidden']},
    {id:'single',kind:'items',collectionIds:['a','b'],ranked:true},
  ]});
  assert.deepEqual(settings.rows,[{id:'row',kind:'collections',title:'Collections',collectionIds:['second','first'],ranked:false,placement:'end',itemSort:'collection',itemOrder:[]},{id:'single',kind:'items',title:'',collectionIds:['a'],ranked:true,placement:'end',itemSort:'collection',itemOrder:[]}]);
});
test('server and user storage scopes cannot overlap',()=>{
  assert.notEqual(homeCollectionKey('server-a','alice'),homeCollectionKey('server-a','bob'));
  assert.notEqual(homeCollectionKey('server-a','alice'),homeCollectionKey('server-b','alice'));
  assert.notEqual(homeCollectionKey('a:b','c'),homeCollectionKey('a','b:c'));
});
test('rank artwork contains vector outlines, including multiple digits, rather than caption text',()=>{
  const svg=decodeURIComponent(rankImage(10).split(',')[1]);
  assert.equal((svg.match(/<path /g)||[]).length,2);assert.match(svg,/viewBox="0 0 174 140"/);assert.doesNotMatch(svg,/<text/);
});

test('item sorting is stable, leaves source untouched and appends newly added items after custom choices',()=>{
  const items=[{Id:'b',Name:'Beta',ProductionYear:2023},{Id:'a',Name:'Alpha',ProductionYear:2025},{Id:'c',Name:'Gamma'},{Id:'d',Name:'Delta',ProductionYear:2025}];
  const ids=(sort: Parameters<typeof orderHomeItems>[1]['itemSort'], itemOrder:string[]=[])=>orderHomeItems(items,{itemSort:sort,itemOrder}).map(item=>item.Id);
  assert.deepEqual(ids('title'),['a','b','d','c']);
  assert.deepEqual(ids('newest'),['a','d','b','c']);
  assert.deepEqual(ids('oldest'),['b','a','d','c']);
  assert.deepEqual(ids('custom',['removed','d','b']),['d','b','a','c']);
  assert.deepEqual(items.map(item=>item.Id),['b','a','c','d']);
});
test('legacy row preferences gain defaults and invalid new settings are bounded',()=>{
  const rows=parseHomeCollections({version:1,rows:[{id:'a',kind:'items',collectionIds:['x'],itemSort:'unsupported',placement:'javascript:bad',itemOrder:['a','a',null,'b']}, {id:'b',kind:'items',collectionIds:['y'],itemSort:'custom',placement:'native:next up:1',itemOrder:['z','x']}]}).rows;
  assert.equal(rows[0].itemSort,'collection');assert.equal(rows[0].placement,'end');assert.deepEqual(rows[0].itemOrder,['a','b']);
  assert.equal(rows[1].placement,'native:next up:1');assert.equal(rows[1].itemSort,'custom');
});

test('optional tabs retain independent source order and expose a compatible first collection',()=>{
  const row=parseHomeCollections({version:1,rows:[{id:'platform',kind:'items',collectionIds:['old'],ranked:true,itemSort:'title',tabs:[
    {id:'movies',label:' Movies ',collectionId:'films',itemSort:'collection',itemOrder:[]},
    {id:'shows',label:'Shows',collectionId:'series',itemSort:'custom',itemOrder:['show2','show1']},
  ]}]}).rows[0];
  assert.deepEqual(row.collectionIds,['films']);assert.equal(row.itemSort,'collection');assert.equal(row.ranked,true);
  assert.equal(homeCollectionTabs(row)[0].label,'Movies');assert.deepEqual(row.tabs?.[1].itemOrder,['show2','show1']);
  assert.equal(homeTabLabel(row.tabs![1],{Id:'series',Name:'Netflix Series'}),'Shows');
  assert.deepEqual(orderHomeItems([{Id:'z',Name:'Zulu'},{Id:'a',Name:'Alpha'}],row.tabs![0]).map(item=>item.Id),['z','a']);
});

test('tab preferences reject malformed entries, bound arrays and never affect collection-card rows',()=>{
  const tabs=Array.from({length:10},(_,i)=>({id:`tab-${i}`,label:'x'.repeat(100),collectionId:`collection-${i}`,itemSort:'unsafe',itemOrder:['a','a',null,'b']}));
  const row=parseHomeCollections({version:1,rows:[{id:'row',kind:'items',tabs}]}).rows[0];
  assert.equal(row.tabs?.length,6);assert.equal(row.tabs?.[0].label.length,40);assert.equal(row.tabs?.[0].itemSort,'collection');assert.deepEqual(row.tabs?.[0].itemOrder,['a','b']);
  const invalid=parseHomeCollections({version:1,rows:[{id:'row',kind:'items',collectionIds:['original'],tabs:[null,{id:'same',collectionId:'one'},{id:'same',collectionId:'two'},{id:'bad',collectionId:9}]},{id:'cards',kind:'collections',collectionIds:['one','two'],tabs}]}).rows;
  assert.equal(invalid[0].tabs?.length,1);assert.deepEqual(invalid[0].collectionIds,['one']);assert.equal(invalid[1].tabs,undefined);
  const legacy=parseHomeCollections({version:1,rows:[{id:'legacy',kind:'items',collectionIds:['old'],itemSort:'title'}]}).rows[0];
  assert.equal(legacy.tabs,undefined);assert.equal(homeCollectionTabs(legacy)[0].collectionId,'old');assert.equal(homeCollectionTabs(legacy)[0].itemSort,'title');
});


test('watchlist rows keep presentation settings without collection sources or ranks', () => {
  const row = parseHomeCollections({ version: 1, rows: [{ id: 'saved', kind: 'watchlist', title: ' Watch next ',
    collectionIds: ['forged'], ranked: true, placement: 'native:next up:1', itemSort: 'custom', itemOrder: ['movie', 'show', 'movie'],
    tabs: [{ id: 'tab', collectionId: 'forged' }] }] }).rows[0];
  assert.deepEqual(row, { id: 'saved', kind: 'watchlist', title: 'Watch next', collectionIds: [], ranked: false,
    placement: 'native:next up:1', itemSort: 'custom', itemOrder: ['movie', 'show'] });
});

test('season dates accept real calendar days, including leap day, and reject malformed dates', () => {
  for (const date of ['01-01', '02-28', '02-29', '04-30', '12-31']) assert.equal(validSeasonDate(date), true, date);
  for (const date of [undefined, null, 101, '', '1-01', '01-1', '2026-10-01', '00-01', '13-01', '01-00', '01-32', '04-31', '02-30', ' 10-01', '10-01\n']) assert.equal(validSeasonDate(date), false, String(date));
});

test('season visibility uses inclusive local dates and repeats each year', () => {
  const season = { start: '10-01', end: '10-31' };
  assert.equal(isSeasonActive(season, new Date(2026, 8, 30, 23, 59, 59)), false);
  assert.equal(isSeasonActive(season, new Date(2026, 9, 1)), true);
  assert.equal(isSeasonActive(season, new Date(2026, 9, 31, 23, 59, 59)), true);
  assert.equal(isSeasonActive(season, new Date(2026, 10, 1)), false);
  assert.equal(isSeasonActive(season, new Date(2031, 9, 20)), true);
  assert.equal(isSeasonActive({ start: '10-31', end: '10-31' }, new Date(2026, 9, 30)), false);
  assert.equal(isSeasonActive({ start: '10-31', end: '10-31' }, new Date(2026, 9, 31)), true);
  assert.equal(isSeasonActive(undefined), false);
  assert.equal(isSeasonActive({ start: '12-32', end: '01-31' }), false);
  assert.equal(isSeasonActive(season, new Date('invalid')), false);
});

test('seasons can cross New Year, and leap-day-only rows appear only on February 29', () => {
  const winter = { start: '12-20', end: '01-05' };
  for (const date of [new Date(2026, 11, 20), new Date(2026, 11, 31), new Date(2027, 0, 1), new Date(2027, 0, 5)]) assert.equal(isSeasonActive(winter, date), true);
  for (const date of [new Date(2026, 11, 19), new Date(2027, 0, 6), new Date(2027, 5, 1)]) assert.equal(isSeasonActive(winter, date), false);
  const leapDay = { start: '02-29', end: '02-29' };
  assert.equal(isSeasonActive(leapDay, new Date(2028, 1, 29)), true);
  assert.equal(isSeasonActive(leapDay, new Date(2027, 1, 28)), false);
  assert.equal(isSeasonActive(leapDay, new Date(2027, 2, 1)), false);
});

test('seasonal groups preserve child capabilities and flatten only active children at the group position', () => {
  const settings = parseHomeCollections({ version: 1, rows: [
    { id: 'before', kind: 'collections', collectionIds: ['regular'] },
    { id: 'seasonal', kind: 'seasonal', title: 'Hidden group name', collectionIds: ['ignored'], ranked: true, itemSort: 'title', itemOrder: ['ignored'], shuffle: true,
      placement: 'native:continue watching:1', children: [
        { id: 'halloween', kind: 'items', title: ' Halloween ', ranked: true, shuffle: true, placement: 'start', season: { start: '10-01', end: '10-31', ignored: true },
          tabs: [{ id: 'films', label: 'Films', collectionId: 'spooky-films', itemSort: 'custom', itemOrder: ['second', 'first'] }, { id: 'shows', label: 'Shows', collectionId: 'spooky-shows' }] },
        { id: 'autumn', kind: 'collections', title: 'Autumn collections', collectionIds: ['leaves', 'cozy'], itemSort: 'title-desc', season: { start: '09-01', end: '11-30' } },
        { id: 'christmas', kind: 'watchlist', title: 'Christmas watchlist', itemSort: 'newest', season: { start: '12-01', end: '12-31' } },
      ] },
    { id: 'after', kind: 'watchlist', title: 'Watch later' },
  ] });
  const group = settings.rows[1];
  assert.equal(group.title, ''); assert.deepEqual(group.collectionIds, []); assert.equal(group.ranked, false);
  assert.equal(group.itemSort, 'collection'); assert.deepEqual(group.itemOrder, []); assert.equal(group.shuffle, undefined);
  const spooky = group.children![0];
  assert.equal(spooky.title, 'Halloween'); assert.equal(spooky.ranked, true); assert.equal(spooky.shuffle, true);
  assert.deepEqual(spooky.season, { start: '10-01', end: '10-31' });
  assert.deepEqual(spooky.collectionIds, ['spooky-films']); assert.deepEqual(spooky.itemOrder, ['second', 'first']);
  assert.equal(spooky.tabs?.length, 2); assert.equal(group.children![1].itemSort, 'title-desc'); assert.equal(group.children![2].kind, 'watchlist');
  const october = activeHomeRows(settings, new Date(2026, 9, 15));
  assert.deepEqual(october.map(row => row.id), ['before', 'halloween', 'autumn', 'after']);
  assert.equal(october[1].placement, group.placement); assert.equal(october[2].placement, group.placement);
  assert.equal(spooky.placement, 'start', 'flattening must not change saved settings');
  assert.deepEqual(activeHomeRows(settings, new Date(2026, 11, 15)).map(row => row.id), ['before', 'christmas', 'after']);
  assert.deepEqual(activeHomeRows(settings, new Date(2026, 5, 15)).map(row => row.id), ['before', 'after']);
  assert.deepEqual(parseHomeCollections(settings), settings, 'normalized settings must round-trip unchanged');
});

test('seasonal children need valid schedules, cannot nest groups, and share the root ID namespace', () => {
  const season = { start: '10-01', end: '10-31' };
  const settings = parseHomeCollections({ version: 1, rows: [
    { id: 'existing', kind: 'items', collectionIds: ['one'] },
    { id: 'group', kind: 'seasonal', children: [
      { id: 'missing', kind: 'items' },
      { id: 'invalid', kind: 'items', season: { start: '04-31', end: '10-31' } },
      { id: 'incomplete', kind: 'items', season: { start: '10-01' } },
      { id: 'nested', kind: 'seasonal', season, children: [{ id: 'hidden', kind: 'items', season }] },
      { id: 'existing', kind: 'items', season },
      { id: 'group', kind: 'items', season },
      { id: 'child', kind: 'items', season },
      { id: 'child', kind: 'collections', season },
    ] },
    { id: 'child', kind: 'items' },
    { id: 'another-group', kind: 'seasonal', children: [{ id: 'child', kind: 'watchlist', season }] },
  ] });
  assert.deepEqual(settings.rows.map(row => row.id), ['existing', 'group', 'another-group']);
  assert.deepEqual(settings.rows[1].children?.map(row => row.id), ['child']);
  assert.deepEqual(settings.rows[2].children, []);
  assert.deepEqual(activeHomeRows(settings, new Date(2026, 9, 15)).map(row => row.id), ['existing', 'child']);
  assert.deepEqual(activeHomeRows(settings, new Date(2026, 6, 15)).map(row => row.id), ['existing']);
});

test('seasonal limits bound both groups and children and normalize IDs before checking collisions', () => {
  const season = { start: '01-01', end: '12-31' };
  const rows = Array.from({ length: 15 }, (_, root) => ({ id: `group-${root}`, kind: 'seasonal', children:
    Array.from({ length: 20 }, (_, child) => ({ id: `child-${root}-${child}`, kind: 'collections', season })) }));
  const settings = parseHomeCollections({ version: 1, rows });
  assert.equal(settings.rows.length, 12); assert.equal(settings.rows[0].children?.length, maxSeasonalRows);
  assert.equal(activeHomeRows(settings, new Date(2026, 9, 15)).length, 12 * maxSeasonalRows);
  const longId = 'x'.repeat(100);
  const collision = parseHomeCollections({ version: 1, rows: [{ id: `${longId}root`, kind: 'items' },
    { id: 'group', kind: 'seasonal', children: [{ id: `${longId}child`, kind: 'items', season }] }] });
  assert.equal(collision.rows[0].id, longId); assert.deepEqual(collision.rows[1].children, []);
});

test('ordinary rows retain optional shuffle without acquiring seasonal fields', () => {
  const settings = parseHomeCollections({ version: 1, rows: [
    { id: 'shuffle', kind: 'items', shuffle: true, season: { start: '10-01', end: '10-31' }, children: [{ id: 'nested', kind: 'items' }] },
    { id: 'off', kind: 'collections', shuffle: false }, { id: 'invalid', kind: 'watchlist', shuffle: 'true' },
  ] });
  assert.equal(settings.rows[0].shuffle, true); assert.equal(settings.rows[0].season, undefined); assert.equal(settings.rows[0].children, undefined);
  assert.equal(settings.rows[1].shuffle, undefined); assert.equal(settings.rows[2].shuffle, undefined);
  assert.deepEqual(activeHomeRows(settings, new Date(2026, 5, 1)), settings.rows);
});

test('shuffle returns a fresh permutation, supports deterministic randomness and leaves saved ordering untouched', () => {
  const items = [{ Id: 'a', Name: 'Alpha' }, { Id: 'b', Name: 'Beta' }, { Id: 'c', Name: 'Gamma' }, { Id: 'd', Name: 'Delta' }];
  const randomValues = [0.25, 0.75, 0];
  let calls = 0;
  const shuffled = shuffleHomeItems(items, () => randomValues[calls++]);
  assert.equal(calls, items.length - 1);
  assert.deepEqual(shuffled.map(item => item.Id), ['d', 'a', 'c', 'b']);
  assert.deepEqual(items.map(item => item.Id), ['a', 'b', 'c', 'd']);
  assert.notEqual(shuffled, items); assert.deepEqual(new Set(shuffled), new Set(items));
  assert.notDeepEqual(shuffleHomeItems(items, () => 0), shuffleHomeItems(items, () => 0.999));
  const single = [items[0]];
  assert.deepEqual(shuffleHomeItems(single), single); assert.notEqual(shuffleHomeItems(single), single);
  assert.deepEqual(shuffleHomeItems([], () => { throw new Error('No draw needed'); }), []);
});

test('seasonal appearance is optional, bounded and rejects incomplete or unknown options', () => {
  for (const theme of ['halloween', 'christmas'] as const) {
    const defaults = defaultSeasonalAppearance(theme);
    assert.deepEqual(defaults, { theme, background: 'static', expansion: 'medium', frame: true, reveal: 'none' });
    assert.notEqual(defaults, defaultSeasonalAppearance(theme));
    for (const background of ['none', 'static', 'parallax']) for (const expansion of ['none', 'medium', 'large', 'fullscreen'])
      for (const frame of [true, false]) for (const reveal of ['none', 'doors', 'curtains']) {
        const appearance = { theme, background, expansion, frame, reveal };
        assert.deepEqual(parseSeasonalAppearance(appearance), appearance);
        assert.notEqual(parseSeasonalAppearance(appearance), appearance);
      }
  }
  const valid = defaultSeasonalAppearance('halloween');
  for (const value of [undefined, null, false, [], 'halloween', {}, { ...valid, extra: true }, { ...valid, theme: 'custom' },
    { ...valid, background: 'url(https://example.test)' }, { ...valid, expansion: 2 }, { ...valid, expansion: 'full-screen' }, { ...valid, reveal: 'always' }, { ...valid, frame: 'true' }])
    assert.equal(parseSeasonalAppearance(value), undefined);
  for (const key of Object.keys(valid)) {
    const missing = { ...valid } as Record<string, unknown>; delete missing[key];
    assert.equal(parseSeasonalAppearance(missing), undefined, key);
  }
});

test('only seasonal children retain appearance, and bad appearance never removes the child', () => {
  const appearance = { ...defaultSeasonalAppearance('christmas'), background: 'parallax', reveal: 'doors' };
  const season = { start: '12-01', end: '01-06' };
  const settings = parseHomeCollections({ version: 1, rows: [
    { id: 'ordinary', kind: 'items', appearance },
    { id: 'seasonal', kind: 'seasonal', placement: 'native:resume', appearance, children: [
      { id: 'plain', kind: 'items', season },
      { id: 'decorated', kind: 'items', season, appearance, collectionIds: ['films'], ranked: true, shuffle: true },
      { id: 'collections', kind: 'collections', season, appearance },
      { id: 'watchlist', kind: 'watchlist', season, appearance },
      { id: 'invalid', kind: 'items', season, appearance: { ...appearance, frame: 'yes' }, collectionIds: ['still-here'] },
    ] },
  ] });
  assert.equal(settings.rows[0].appearance, undefined); assert.equal(settings.rows[1].appearance, undefined);
  const children = settings.rows[1].children!;
  assert.equal(children.length, 5); assert.equal(children[0].appearance, undefined);
  assert.deepEqual(children[1].appearance, appearance); assert.deepEqual(children[2].appearance, appearance);
  assert.deepEqual(children[3].appearance, appearance); assert.equal(children[4].appearance, undefined);
  assert.deepEqual(children[4].collectionIds, ['still-here']);
  const active = activeHomeRows(settings, new Date(2026, 11, 20));
  assert.deepEqual(active[2].appearance, appearance); assert.equal(active[2].placement, 'native:resume');
  assert.equal(active[2].ranked, true); assert.equal(active[2].shuffle, true);
  assert.deepEqual(activeHomeRows(settings, new Date(2026, 5, 1)).map(row => row.id), ['ordinary']);
  assert.deepEqual(parseHomeCollections(settings), settings);
});

test('full-screen seasonal rows preserve their content, dates and independent artwork choices through storage', () => {
  const appearance = { ...defaultSeasonalAppearance('halloween'), expansion: 'fullscreen', backgroundStyle: 'nightmare', frameStyle: 'photoreal', coverStyle: 'storybook', reveal: 'doors' };
  const settings = parseHomeCollections({ version: 1, rows: [{ id: 'seasonal', kind: 'seasonal', placement: 'native:continue watching:1', children: [
    { id: 'halloween', kind: 'items', title: 'Spooky season', collectionIds: ['horror-films'], season: { start: '10-01', end: '11-01' },
      ranked: true, shuffle: true, itemSort: 'custom', itemOrder: ['film-2', 'film-1'], appearance },
  ] }] });
  assert.deepEqual(settings.rows[0].children![0].appearance, appearance);
  const restored = parseHomeCollections(JSON.parse(JSON.stringify(settings)));
  assert.deepEqual(restored, settings);
  const active = activeHomeRows(restored, new Date(2026, 9, 4));
  assert.equal(active[0].appearance!.expansion, 'fullscreen');
  assert.equal(active[0].placement, 'native:continue watching:1');
  assert.deepEqual(active[0].collectionIds, ['horror-films']);
  assert.deepEqual(active[0].itemOrder, ['film-2', 'film-1']);
  assert.deepEqual(activeHomeRows(restored, new Date(2026, 5, 1)), []);
});

test('rank artwork choices persist without materializing an override for existing seasonal rows', () => {
  for (const theme of ['halloween', 'christmas'] as const) {
    const original = { ...defaultSeasonalAppearance(theme), frameStyle: 'photoreal' as const };
    assert.deepEqual(parseSeasonalAppearance(original), original);
    assert.equal(Object.hasOwn(parseSeasonalAppearance(original)!, 'rankStyle'), false);
    for (const rankStyle of ['standard', 'classic', 'storybook', 'photoreal', ...(theme === 'halloween' ? ['nightmare'] : [])]) {
      const appearance = { ...original, rankStyle };
      const settings = parseHomeCollections({ version: 1, rows: [{ id: 'seasonal', kind: 'seasonal', children: [
        { id: 'films', kind: 'items', collectionIds: ['collection-id'], ranked: true, season: { start: '01-01', end: '12-31' }, appearance },
      ] }] });
      assert.deepEqual(settings.rows[0].children![0].appearance, appearance);
      assert.deepEqual(parseHomeCollections(JSON.parse(JSON.stringify(settings))), settings);
    }
    for (const rankStyle of [null, undefined, 1, true, {}, [], '', 'automatic', 'https://example.test/image', ...(theme === 'christmas' ? ['nightmare'] : [])])
      assert.equal(parseSeasonalAppearance({ ...original, rankStyle }), undefined);
  }
});
