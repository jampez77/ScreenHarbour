import type { Item, MediaApi } from './types';
import { button, el, picture, replace } from './dom';
import { attachRemote } from './remote';
import { emptyHomeCollections, parseHomeCollections, orderHomeItems, homeCollectionTabs, homeTabLabel, maxHomeCollectionTabs, maxSeasonalRows, validSeasonDate, isSeasonActive, shuffleHomeItems, defaultSeasonalAppearance, type HomeCollectionRow, type HomeCollectionTab, type HomeItemSort, type HomeSeasonalAppearance, type HomeSeasonalArtStyle } from './home-collection-settings';
import { createHomeCollectionStore, HomeCollectionSyncError, type HomeCollectionStore } from './home-collection-store';
import { cachedHomeRows, nativeHomeRows, type HomeAnchor } from './home-row-placement';
import { homeRowCard } from './home-row-card';
import { homeRowTabs } from './home-row-tabs';
import { getAllWatchlistItems, subscribeWatchlist } from './watchlist';
import { decorateSeasonalRow } from './home-seasonal-appearance';
import { dailyAdvent } from './home-advent';

const watchlistSource = '@watchlist';
const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthDays = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const seasonDateLabel = (value: string): string => validSeasonDate(value) ? `${Number(value.slice(3))} ${months[Number(value.slice(0, 2)) - 1]}` : 'Choose a date';


type OrderEntry = { row: HomeCollectionRow } | { anchor: HomeAnchor };
export function combinedHomeOrder(rows: HomeCollectionRow[], anchors: HomeAnchor[]): OrderEntry[] {
  const known = new Set(anchors.map(anchor => anchor.key));
  return [
    ...rows.filter(row => row.placement === 'start').map(row => ({ row })),
    ...anchors.flatMap(anchor => [...rows.filter(row => row.placement === anchor.key).map(row => ({ row })), { anchor }] as OrderEntry[]),
    ...rows.filter(row => row.placement !== 'start' && !known.has(row.placement)).map(row => ({ row })),
  ];
}

/** A single editor beside a compact row list; edits are a local draft until saved. */
export class HomeCollectionEditor {
  readonly element = el('section', 'tvl-home-editor tvl-keyboard');
  private sidebar = el('nav', 'tvl-home-editor-sidebar');
  private workspace = el('div', 'tvl-home-editor-workspace');
  private preview?: HTMLElement;
  private disposePreviewAppearance?: () => void;
  private status = el('p', 'tvl-home-editor-status');
  private saveButton: HTMLButtonElement;
  private draft = emptyHomeCollections();
  private key: string;
  private store: HomeCollectionStore;
  private saving = false;
  private loadingSettings = false;
  private anchors: HomeAnchor[];
  private collections: Item[] = [];
  private selectedId = '';
  private selectedTabs = new Map<string, string>();
  private previewShuffleOrders = new Map<string, string[]>();
  private tab: 'content' | 'order' | 'position' | 'appearance' = 'content';
  private search = '';
  private items = new Map<string, Item[]>();
  private loading = new Set<string>();
  private errors = new Set<string>();
  private visibleItems = 60;
  private disposed = false;
  private ready = false;
  private removeRemote: () => void;
  private removeWatchlist: () => void;
  private watchlistRevision = 0;

  constructor(private api: MediaApi, private onClose: (restore: boolean) => void) {
    this.store = createHomeCollectionStore(api); this.key = this.store.key; this.draft = this.store.cached;
    const home = document.querySelector<HTMLElement>('#indexPage #homeTab, #homeTab');
    const native = home ? nativeHomeRows(home) : [];
    this.anchors = native.length ? native.map(({ key, label }) => ({ key, label })) : cachedHomeRows(this.key);
    this.selectedId = this.draft.rows[0]?.id || '';
    this.element.setAttribute('role', 'dialog'); this.element.setAttribute('aria-modal', 'true');
    this.element.setAttribute('aria-label', 'Customize Home rows');
    this.sidebar.setAttribute('aria-label', 'Your Home rows');
    const panel = el('div', 'tvl-home-editor-panel');
    const header = el('header', 'tvl-home-editor-header');
    const title = el('div'); title.append(el('p', 'tvl-home-editor-eyebrow', 'PERSONALISE HOME'), el('h1', '', 'Your Home rows'));
    const actions = el('div', 'tvl-home-editor-actions');
    const cancel = button('Cancel', 'close', '', () => this.close()); cancel.dataset.editorFocus = 'cancel';
    this.saveButton = button('Save rows', 'check', 'tvl-primary', () => { void this.save(); }); this.saveButton.disabled = true; this.saveButton.dataset.editorFocus = 'save';
    actions.append(cancel, this.saveButton); header.append(title, actions);
    this.status.setAttribute('role', 'status'); this.status.textContent = 'Loading collections…';
    const layout = el('div', 'tvl-home-editor-layout'); layout.append(this.sidebar, this.workspace);
    panel.append(header, el('p', 'tvl-home-editor-intro', this.store.synced ? 'Saved rows follow this Jellyfin account across your devices.' : 'This preview saves choices on this device.'), this.status, layout);
    this.element.append(panel);
    this.removeRemote = attachRemote(this.element, () => this.close());
    this.removeWatchlist = subscribeWatchlist(api, () => {
      this.watchlistRevision++; this.items.delete(watchlistSource); this.errors.delete(watchlistSource); this.loading.delete(watchlistSource);
      const row = this.selectedRow();
      if (row?.kind === 'watchlist') { if (this.tab === 'order') this.redraw(); else this.renderPreview(row); }
    });
  }
  async load(): Promise<void> {
    this.element.querySelector<HTMLElement>('[data-editor-focus="cancel"]')?.focus({ preventScroll: true });
    await this.loadCollections();
  }
  private async loadCollections(): Promise<void> {
    if (this.disposed || this.loadingSettings || this.saving) return;
    this.loadingSettings = true; this.ready = false; this.saveButton.disabled = true;
    this.disposePreviewAppearance?.(); this.disposePreviewAppearance = undefined;
    this.status.textContent = 'Loading collections and saved rows…'; replace(this.sidebar); replace(this.workspace);
    try {
      const [collections, settings] = await Promise.all([this.api.getCollectionList(), this.store.load()]); if (this.disposed) return;
      this.draft = settings; this.selectedId = this.draft.rows[0]?.id || '';
      this.collections = collections; this.ready = true; this.saveButton.disabled = false;
      this.status.textContent = collections.length ? '' : 'No collections are available for this account yet.'; this.redraw();
    } catch (error) {
      if (this.disposed) return;
      replace(this.workspace, button('Retry collections', '', 'tvl-primary', () => { void this.loadCollections(); }));
      this.status.textContent = error instanceof HomeCollectionSyncError ? error.message : 'Collections and saved rows could not be loaded. Check your connection and try again.';
    } finally { this.loadingSettings = false; }
  }
  private control(label: string, focus: string, action: () => void, className = ''): HTMLButtonElement {
    const control = button(label, '', className, action); control.dataset.editorFocus = focus; return control;
  }
  private selectedRow(): HomeCollectionRow | undefined {
    return this.draft.rows.flatMap(row => [row, ...(row.children || [])]).find(row => row.id === this.selectedId);
  }
  private parentOf(row: HomeCollectionRow): HomeCollectionRow | undefined {
    return this.draft.rows.find(group => group.kind === 'seasonal' && group.children?.includes(row));
  }
  private name(row: HomeCollectionRow): string {
    if (row.kind === 'seasonal') return 'Seasonal group';
    return row.title.trim() || (row.kind === 'watchlist' ? 'Watchlist' : row.kind === 'collections' ? 'Collections' : this.collections.find(item => item.Id === homeCollectionTabs(row)[0].collectionId)?.Name || 'New collection row');
  }
  private source(row: HomeCollectionRow): HomeCollectionTab | undefined {
    return row.tabs?.find(tab => tab.id === this.selectedTabs.get(row.id)) || row.tabs?.[0];
  }
  private sourceCollection(row: HomeCollectionRow): string { const source = this.source(row); return source ? source.collectionId : row.collectionIds[0] || ''; }
  private chooseSource(row: HomeCollectionRow, id: string, focus: string): void {
    this.selectedTabs.set(row.id, id); this.search = ''; this.visibleItems = 60; this.redraw(focus);
  }
  private sourceSwitch(row: HomeCollectionRow, preview = false): HTMLElement | undefined {
    if (!row.tabs?.length) return;
    const prefix = preview ? 'tvl-home-preview' : 'tvl-home-edit';
    const strip = homeRowTabs(row.tabs.map(tab => ({ id: tab.id, label: homeTabLabel(tab, this.collections.find(item => item.Id === tab.collectionId)) })), this.source(row)!.id,
      id => this.chooseSource(row, id, `${prefix}:${id}`), prefix);
    strip.querySelectorAll<HTMLElement>('[data-source-tab]').forEach(control => { control.dataset.editorFocus = `${prefix}:${control.dataset.sourceTab}`; });
    return strip;
  }
  private redraw(focus?: string): void {
    const restore = focus || (document.activeElement as HTMLElement)?.dataset.editorFocus;
    this.disposePreviewAppearance?.(); this.disposePreviewAppearance = undefined;
    replace(this.sidebar); replace(this.workspace); this.preview = undefined;
    const sidebarEntry = (row: HomeCollectionRow, child = false) => {
      const entry = this.control(this.name(row), `row:${row.id}`, () => {
        this.selectedId = row.id; this.search = ''; this.visibleItems = 60;
        if (child && this.tab === 'position') this.tab = 'content';
        this.redraw(`row:${row.id}`);
      }, `tvl-home-row-choice${child ? ' tvl-home-season-choice' : ''}`);
      entry.dataset.editorRow = row.id;
      entry.setAttribute('aria-pressed', String(row.id === this.selectedId));
      entry.append(el('small', '', row.kind === 'seasonal' ? `${row.children?.length || 0} seasonal row${row.children?.length === 1 ? '' : 's'} · one Home position`
        : child && row.season ? `${seasonDateLabel(row.season.start)} – ${seasonDateLabel(row.season.end)}`
        : row.kind === 'watchlist' ? 'Saved movies and TV shows' : row.kind === 'collections' ? `${row.collectionIds.length} selected collections`
        : `${row.ranked ? 'Ranked' : 'Poster'} item row${row.tabs ? ` · ${row.tabs.length} tabs` : ''}`));
      this.sidebar.append(entry);
    };
    for (const row of this.draft.rows) { sidebarEntry(row); if (row.kind === 'seasonal') row.children?.forEach(child => sidebarEntry(child, true)); }
    const add = el('div', 'tvl-home-editor-add');
    for (const kind of ['collections', 'items', 'watchlist', 'seasonal'] as const) {
      const control = this.control(kind === 'seasonal' ? 'Add seasonal group' : kind === 'watchlist' ? 'Add Watchlist row' : kind === 'collections' ? 'Add Collections row' : 'Add collection items row', `add:${kind}`, () => {
        const row = this.newRow(kind);
        this.draft.rows.push(row); this.selectedId = row.id; this.tab = 'content'; this.search = ''; this.redraw(kind === 'seasonal' ? 'add-season:items' : 'title');
      }); control.disabled = this.draft.rows.length >= 12; add.append(control);
    }
    this.sidebar.append(add);
    const row = this.selectedRow();
    if (!row) this.workspace.append(el('h2', '', 'Make Home your own'), el('p', '', 'Add your Watchlist, favourite collections, or seasonal rows that appear at the right time of year.'));
    else {
      const parent = this.parentOf(row);
      if (!parent && this.tab === 'appearance') this.tab = 'content';
      if (parent) {
        this.workspace.append(this.control('Back to seasonal group', 'season:back', () => { this.selectedId = parent.id; this.tab = 'content'; this.redraw(`row:${parent.id}`); }, 'tvl-home-season-back'));
        if (this.tab === 'position') this.tab = 'content';
      }
      const heading = el('div', 'tvl-home-editor-heading');
      heading.append(el('h2', '', this.name(row)), this.control(row.kind === 'seasonal' ? 'Remove seasonal group' : 'Remove row', 'remove', () => {
        const siblings = parent ? parent.children! : this.draft.rows;
        const index = siblings.indexOf(row); siblings.splice(index, 1);
        this.selectedId = parent?.id || siblings[Math.min(index, siblings.length - 1)]?.id || ''; this.tab = 'content';
        this.redraw(this.selectedId ? `row:${this.selectedId}` : 'add:collections');
      }));
      const tabs = el('nav', 'tvl-home-editor-tabs'); tabs.setAttribute('aria-label', 'Row settings');
      const choices = row.kind === 'seasonal' ? [['content', 'Seasonal rows'], ['position', 'Home position']] as const
        : parent ? [['content', 'Content'], ['order', 'Item order'], ['appearance', 'Appearance']] as const
        : [['content', 'Content'], ['order', 'Item order'], ['position', 'Home position']] as const;
      if (row.kind === 'seasonal' && this.tab === 'order') this.tab = 'content';
      for (const [tab, label] of choices) {
        const control = this.control(label, `tab:${tab}`, () => { this.tab = tab; this.redraw(`tab:${tab}`); }); control.setAttribute('aria-pressed', String(this.tab === tab)); tabs.append(control);
      }
      this.workspace.append(heading, tabs);
      if (row.kind === 'seasonal') {
        const content = el('div', 'tvl-home-editor-row'); this.workspace.append(content);
        if (this.tab === 'position') this.renderPosition(row, content); else this.renderSeasons(row, content);
      } else {
        if (parent && this.tab === 'content') this.renderSeasonDates(row, this.workspace);
        const content = el('div', 'tvl-home-editor-row'); content.setAttribute('role', 'group'); content.setAttribute('aria-label', row.kind === 'watchlist' ? 'Watchlist row' : row.kind === 'collections' ? 'Collections row' : 'Collection items row');
        this.preview = el('aside', 'tvl-home-preview'); this.preview.setAttribute('aria-label', 'Home row preview'); this.preview.tabIndex = -1; this.preview.dataset.editorFocus = 'preview';
        const body = el('div', 'tvl-home-editor-body'); body.append(content, this.preview); this.workspace.append(body);
        const sourceSwitch = row.kind === 'items' && this.tab !== 'appearance' ? this.sourceSwitch(row) : undefined;
        if (this.tab === 'appearance') this.renderAppearance(row, content);
        else if (sourceSwitch) {
          content.append(sourceSwitch); const sourcePanel = el('div'); sourcePanel.id = 'tvl-home-edit-items'; sourcePanel.setAttribute('role', 'tabpanel'); sourcePanel.setAttribute('aria-labelledby', `tvl-home-edit-tab-${encodeURIComponent(this.source(row)!.id)}`); content.append(sourcePanel);
          if (this.tab === 'content') this.renderContent(row, sourcePanel);
          else if (this.tab === 'order') this.renderOrder(row, sourcePanel);
          else this.renderPosition(row, sourcePanel);
        }
        else if (this.tab === 'content') this.renderContent(row, content);
        else if (this.tab === 'order') this.renderOrder(row, content);
        else this.renderPosition(row, content);
        this.renderPreview(row);
      }
    }
    if (restore) {
      const target = Array.from(this.element.querySelectorAll<HTMLElement>('[data-editor-focus]')).find(node => node.dataset.editorFocus === restore && !node.hasAttribute('disabled'))
        || this.workspace.querySelector<HTMLElement>('.tvl-home-editor-tabs [aria-pressed="true"]') || this.sidebar.querySelector<HTMLElement>('button:not(:disabled)');
      target?.focus({ preventScroll: true });
    }
  }
  private newRow(kind: HomeCollectionRow['kind']): HomeCollectionRow {
    const row: HomeCollectionRow = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, kind,
      title: kind === 'watchlist' ? 'Watchlist' : kind === 'collections' ? 'Collections' : '',
      collectionIds: [], ranked: false, placement: 'end', itemSort: 'collection', itemOrder: [] };
    if (kind === 'seasonal') row.children = [];
    return row;
  }
  private renderAppearance(row: HomeCollectionRow, content: HTMLElement): void {
    content.classList.add('tvl-home-seasonal-appearance-editor');
    content.append(el('p', 'tvl-home-editor-help', 'Give this seasonal row its own scenery and reveal. All choices are optional and apply only while this row is in season.'));
    const themes = el('div', 'tvl-home-seasonal-themes'); themes.setAttribute('role', 'group'); themes.setAttribute('aria-label', 'Seasonal theme');
    for (const [theme, name] of [['normal', 'Normal'], ['halloween', 'Halloween'], ['christmas', 'Christmas']] as const) {
      const choice = this.control(name, `appearance:theme:${theme}`, () => {
        if (theme === 'normal') delete row.appearance;
        else row.appearance = row.appearance ? { ...row.appearance, theme } : defaultSeasonalAppearance(theme);
        if (theme === 'christmas' && row.appearance) {
          for (const key of ['backgroundStyle', 'frameStyle', 'coverStyle', 'rankStyle'] as const) {
            if (row.appearance[key] === 'nightmare') delete row.appearance[key];
          }
        }
        if (theme === 'halloween' && row.appearance?.reveal === 'advent') {
          row.appearance.reveal = 'none'; delete row.appearance.adventUnlock;
        }
        this.redraw(`appearance:theme:${theme}`);
      }, `tvl-home-seasonal-theme tvl-home-seasonal-theme-${theme}`);
      choice.setAttribute('aria-pressed', String((row.appearance?.theme || 'normal') === theme));
      themes.append(choice);
    }
    content.append(el('h3', '', 'Theme'), themes);
    if (!row.appearance) {
      content.append(el('p', 'tvl-home-editor-help', 'Normal keeps the standard Home row, with no scenery, frames or reveal.'));
      return;
    }
    const appearance = row.appearance;
    const option = <Key extends 'background' | 'expansion' | 'reveal'>(key: Key, labelText: string, choices: readonly (readonly [HomeSeasonalAppearance[Key], string])[], help: string) => {
      const label = el('label', 'tvl-home-seasonal-select', labelText), select = el('select');
      select.dataset.editorFocus = `appearance:${key}`;
      for (const [value, text] of choices) { const item = el('option', '', text); item.value = value; select.append(item); }
      select.value = appearance[key];
      select.addEventListener('change', () => {
        appearance[key] = select.value as HomeSeasonalAppearance[Key];
        if (key === 'reveal') {
          if (appearance.reveal === 'advent') appearance.adventUnlock = 'daily';
          else delete appearance.adventUnlock;
        }
        if (key === 'expansion') this.renderPreview(row); else this.redraw(`appearance:${key}`);
      });
      label.append(select); content.append(label, el('p', 'tvl-home-seasonal-setting-help', help));
    };
    let nightmareNoteShown = false;
    const artStyle = (key: 'backgroundStyle' | 'frameStyle' | 'coverStyle', name: string) => {
      const label = el('label', 'tvl-home-seasonal-select tvl-home-seasonal-art-style', name), select = el('select');
      select.dataset.editorFocus = `appearance:${key}`;
      const styles: [HomeSeasonalArtStyle, string][] = [['classic', 'Illustrated'], ['storybook', 'Playful / family'], ['photoreal', key === 'coverStyle' && appearance.reveal === 'advent' ? 'Gilded winter wood' : 'Photorealistic']];
      if (appearance.theme === 'halloween') styles.push(['nightmare', 'Nightmare — very scary']);
      for (const [value, text] of styles) { const option = el('option', '', text); option.value = value; select.append(option); }
      select.value = appearance[key] || 'classic';
      select.addEventListener('change', () => {
        if (select.value === 'classic') delete appearance[key]; else appearance[key] = select.value as HomeSeasonalArtStyle;
        this.redraw(`appearance:${key}`);
      });
      label.append(select); content.append(label);
      if (appearance[key] === 'nightmare' && !nightmareNoteShown) {
        content.append(el('p', 'tvl-home-seasonal-setting-help', 'Nightmare is designed for adult horror collections.'));
        nightmareNoteShown = true;
      }
    };
    option('background', 'Background', [['none', 'None'], ['static', 'Static scenery'], ['parallax', 'Parallax scenery']], 'Static scenery stays still. Parallax scenery moves gently behind the items as the row scrolls.');
    if (appearance.background !== 'none') artStyle('backgroundStyle', 'Scenery style');
    option('expansion', 'Height when focused', [['none', 'Standard height'], ['medium', 'Roomier · up to 1.5×'], ['large', 'Immersive · up to 2×'], ['fullscreen', 'Full screen']], 'Returns to normal when focus leaves. Full screen fills the available screen space and enlarges the title in a font matching the scenery style. Posters keep their size.');
    const frameLabel = el('label', 'tvl-home-seasonal-frame-toggle');
    const frame = el('input'); frame.type = 'checkbox'; frame.checked = appearance.frame; frame.dataset.editorFocus = 'appearance:frame';
    frame.addEventListener('change', () => { appearance.frame = frame.checked; this.redraw('appearance:frame'); });
    frameLabel.append(frame, el('span', '', 'Themed item frames')); content.append(frameLabel);
    if (appearance.frame) artStyle('frameStyle', 'Frame style');
    if (row.kind === 'items' && row.ranked) {
      const label = el('label', 'tvl-home-seasonal-select tvl-home-seasonal-art-style', 'Rank number style'), select = el('select');
      select.dataset.editorFocus = 'appearance:rankStyle';
      const styles = [['match', 'Match frame style'], ['standard', 'Standard numbers'], ['classic', 'Illustrated'], ['storybook', 'Playful / family'], ['photoreal', 'Textured']];
      if (appearance.theme === 'halloween') styles.push(['nightmare', 'Nightmare — very scary']);
      for (const [value, text] of styles) { const option = el('option', '', text); option.value = value; select.append(option); }
      select.value = appearance.rankStyle || 'match';
      select.addEventListener('change', () => {
        if (select.value === 'match') delete appearance.rankStyle;
        else appearance.rankStyle = select.value as HomeSeasonalAppearance['rankStyle'];
        this.redraw('appearance:rankStyle');
      });
      label.append(select); content.append(label);
      if (appearance.rankStyle === 'nightmare' && !nightmareNoteShown) {
        content.append(el('p', 'tvl-home-seasonal-setting-help', 'Nightmare is designed for adult horror collections.'));
        nightmareNoteShown = true;
      }
    } else if (row.kind === 'items') {
      content.append(el('p', 'tvl-home-seasonal-setting-help', 'Enable Ranked artwork in Content to theme the rank numbers.'));
    }
    const reveals: [HomeSeasonalAppearance['reveal'], string][] = [['none', 'Always visible'], ['doors', 'Opening doors'], ['shutters', 'Opening window shutters'], ['curtains', 'Drawing curtains']];
    if (appearance.theme === 'christmas' && row.kind === 'items') reveals.push(['advent', 'Advent calendar doors']);
    option('reveal', 'Item reveal', reveals, 'Doors, shutters or curtains hide the artwork and title until that item is focused or hovered. They close when you move away.');
    if (appearance.reveal === 'advent') {
      const label = el('label', 'tvl-home-seasonal-select', 'Door opening'), select = el('select');
      select.dataset.editorFocus = 'appearance:adventUnlock';
      for (const [value, text] of [['daily', 'Daily from season start'], ['focus', 'Open any door on focus']]) {
        const choice = el('option', '', text); choice.value = value; select.append(choice);
      }
      select.value = appearance.adventUnlock || 'focus';
      select.addEventListener('change', () => { appearance.adventUnlock = select.value as 'daily' | 'focus'; this.redraw('appearance:adventUnlock'); });
      const openingHelp = dailyAdvent(row)
        ? 'Door 1 opens on the season start date, with one more film available each day. Start on 1 December for a traditional advent calendar. Films follow Item order; Shuffle on load is ignored so each film keeps its door number.'
        : 'Every door can open when focused or hovered, with no daily restriction. Film positions follow Item order unless Shuffle on load is enabled.';
      label.append(select); content.append(label, el('p', 'tvl-home-seasonal-setting-help', `${openingHelp} Preview doors always open, whatever today’s date.`));
      artStyle('coverStyle', 'Advent door style');
    } else if (appearance.reveal === 'doors' || appearance.reveal === 'shutters') artStyle('coverStyle', 'Door or shutter style');
  }
  private renderSeasons(group: HomeCollectionRow, content: HTMLElement): void {
    content.append(el('p', 'tvl-home-editor-help', 'Give seasonal rows one shared Home position. Only rows whose dates are active appear, in the order below. The group has no heading and takes no space when none are active.'));
    const list = el('ol', 'tvl-home-season-list'); list.setAttribute('aria-label', 'Seasonal rows');
    const children = group.children ||= [];
    children.forEach((row, index) => {
      const line = el('li'); line.dataset.seasonRow = row.id;
      const choose = this.control(this.name(row), `season:edit:${row.id}`, () => { this.selectedId = row.id; this.tab = 'content'; this.search = ''; this.visibleItems = 60; this.redraw('title'); }, 'tvl-home-season-edit');
      choose.setAttribute('aria-label', `Edit ${this.name(row)}`);
      choose.append(el('small', '', row.season ? `${seasonDateLabel(row.season.start)} – ${seasonDateLabel(row.season.end)} every year` : 'Choose season dates'));
      line.append(choose);
      const actions = el('div', 'tvl-home-editor-actions');
      for (const [delta, direction] of [[-1, 'up'], [1, 'down']] as const) {
        const move = this.control(`Move ${this.name(row)} ${direction}`, `season:move:${row.id}:${delta}`, () => {
          [children[index], children[index + delta]] = [children[index + delta], children[index]];
          this.redraw(`season:move:${row.id}:${-delta}`);
        }); move.setAttribute('aria-label', `Move ${this.name(row)} ${direction}`); move.querySelector('span')!.textContent = delta < 0 ? '↑' : '↓';
        move.disabled = index + delta < 0 || index + delta >= children.length; actions.append(move);
      }
      const remove = this.control(`Remove ${this.name(row)}`, `season:remove:${row.id}`, () => { children.splice(index, 1); this.redraw('add-season:items'); });
      actions.append(remove); line.append(actions); list.append(line);
    });
    content.append(list);
    if (!children.length) content.append(el('p', 'tvl-home-season-empty', 'Add a row for Halloween, Christmas, or any season you choose.'));
    const add = el('div', 'tvl-home-season-add'); add.setAttribute('role', 'group'); add.setAttribute('aria-label', 'Add a seasonal row');
    for (const [kind, label] of [['collections', 'Add seasonal collections row'], ['items', 'Add seasonal collection items row'], ['watchlist', 'Add seasonal Watchlist row']] as const) {
      const control = this.control(label, `add-season:${kind}`, () => {
        const row = this.newRow(kind), month = new Date().getMonth() + 1;
        const monthText = String(month).padStart(2, '0');
        row.season = { start: `${monthText}-01`, end: `${monthText}-${monthDays[month - 1]}` };
        row.placement = group.placement; children.push(row); this.selectedId = row.id; this.tab = 'content'; this.search = ''; this.redraw('title');
      }); control.disabled = children.length >= maxSeasonalRows; add.append(control);
    }
    content.append(add);
  }
  private renderSeasonDates(row: HomeCollectionRow, content: HTMLElement): void {
    const dates = el('section', 'tvl-home-season-dates'); dates.setAttribute('aria-label', 'Season dates');
    const summary = el('p', 'tvl-home-editor-help', 'Shown every year, including both dates. An end date before the start continues into the following year.');
    dates.append(summary);
    const fields = el('div', 'tvl-home-season-date-fields');
    for (const [key, title] of [['start', 'Start'], ['end', 'End']] as const) {
      const value = row.season?.[key] || '', month = Number(value.slice(0, 2)), day = Number(value.slice(3));
      const field = el('fieldset'); field.append(el('legend', '', title));
      const monthLabel = el('label', '', 'Month'), monthInput = el('select'); monthInput.setAttribute('aria-label', `${title} month`); monthInput.dataset.editorFocus = `season:${key}:month`;
      months.forEach((name, index) => { const option = el('option', '', name); option.value = String(index + 1); monthInput.append(option); });
      monthInput.value = month >= 1 && month <= 12 ? String(month) : '1';
      const dayLabel = el('label', '', 'Day'), dayInput = el('select'); dayInput.setAttribute('aria-label', `${title} day`); dayInput.dataset.editorFocus = `season:${key}:day`;
      for (let number = 1; number <= (monthDays[month - 1] || 31); number++) { const option = el('option', '', String(number)); option.value = String(number); dayInput.append(option); }
      dayInput.value = day >= 1 && day <= (monthDays[month - 1] || 31) ? String(day) : '1';
      const update = (focus: string) => {
        const nextMonth = Number(monthInput.value), nextDay = Math.min(Number(dayInput.value), monthDays[nextMonth - 1]);
        row.season ||= { start: '01-01', end: '12-31' };
        row.season[key] = `${String(nextMonth).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`;
        this.redraw(focus);
      };
      monthInput.addEventListener('change', () => update(monthInput.dataset.editorFocus!));
      dayInput.addEventListener('change', () => update(dayInput.dataset.editorFocus!));
      monthLabel.append(monthInput); dayLabel.append(dayInput); field.append(monthLabel, dayLabel); fields.append(field);
    }
    dates.append(fields); content.append(dates);
  }
  private renderContent(row: HomeCollectionRow, content: HTMLElement): void {
    const label = el('label', '', 'Row title'); const title = el('input'); title.type = 'text'; title.maxLength = 80;
    title.value = row.title; title.placeholder = row.kind === 'watchlist' ? 'Watchlist' : row.kind === 'collections' ? 'Collections' : 'Collection name'; title.dataset.editorFocus = 'title';
    title.addEventListener('input', () => {
      row.title = title.value;
      this.workspace.querySelector('h2')!.textContent = this.name(row);
      this.sidebar.querySelector('.tvl-home-row-choice[aria-pressed="true"]>span')!.textContent = this.name(row);
      this.renderPreview(row);
    }); label.append(title); content.append(label);
    if (row.kind === 'watchlist') {
      content.append(el('p', 'tvl-home-editor-help', 'Movies and TV shows saved to your Watchlist appear together here. Add titles from their details or while watching a trailer.')); return;
    }
    if (row.kind === 'items') {
      const rank = this.control('Ranked artwork', 'ranked', () => {
        row.ranked = !row.ranked; rank.setAttribute('aria-pressed', String(row.ranked)); this.renderPreview(row);
        if (!this.parentOf(row)) this.sidebar.querySelector('.tvl-home-row-choice[aria-pressed="true"]>small')!.textContent = `${row.ranked ? 'Ranked' : 'Poster'} item row${row.tabs ? ` · ${row.tabs.length} tabs` : ''}`;
      });
      rank.setAttribute('aria-pressed', String(row.ranked)); content.append(rank, el('p', 'tvl-home-editor-help', 'Large number images beside the posters, following your chosen item order.'));
      if (!row.tabs) {
        content.append(this.control('Add collection tabs', 'add-tabs', () => {
          row.tabs = [{ ...homeCollectionTabs(row)[0], label: 'Movies', itemOrder: row.itemOrder.slice() }, { id: `tab-${Date.now()}`, label: 'Shows', collectionId: '', itemSort: 'collection', itemOrder: [] }];
          this.selectedTabs.set(row.id, row.tabs[1].id); this.search = ''; this.redraw('tab-label');
        }), el('p', 'tvl-home-editor-help', 'Show several collections in one row, with a switch such as Movies / Shows.'));
      } else {
        const source = this.source(row)!;
        const tabLabel = el('label', '', 'Tab label'); const input = el('input'); input.type = 'text'; input.maxLength = 40; input.value = source.label; input.placeholder = 'Collection name'; input.dataset.editorFocus = 'tab-label';
        input.addEventListener('input', () => {
          source.label = input.value;
          const control = Array.from(this.workspace.querySelectorAll<HTMLElement>('.tvl-home-editor-row [data-source-tab]')).find(node => node.dataset.sourceTab === source.id);
          if (control) control.querySelector('span')!.textContent = homeTabLabel(source, this.collections.find(item => item.Id === source.collectionId));
          this.renderPreview(row);
        }); tabLabel.append(input); content.append(tabLabel);
        const actions = el('div', 'tvl-home-editor-actions');
        const add = this.control('Add tab', 'add-tab', () => {
          const tab: HomeCollectionTab = { id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, label: '', collectionId: '', itemSort: 'collection', itemOrder: [] };
          row.tabs!.push(tab); this.selectedTabs.set(row.id, tab.id); this.search = ''; this.redraw('tab-label');
        }); add.disabled = row.tabs.length >= maxHomeCollectionTabs;
        const remove = this.control('Remove tab', 'remove-tab', () => {
          const at = row.tabs!.indexOf(source); row.tabs!.splice(at, 1);
          const remaining = row.tabs![Math.min(at, row.tabs!.length - 1)]; this.selectedTabs.set(row.id, remaining.id);
          if (row.tabs!.length === 1) { row.collectionIds = remaining.collectionId ? [remaining.collectionId] : []; row.itemSort = remaining.itemSort; row.itemOrder = remaining.itemOrder.slice(); delete row.tabs; }
          this.search = ''; this.redraw(row.tabs ? 'tab-label' : 'add-tabs');
        }); remove.disabled = row.tabs.length < 2;
        actions.append(add, remove);
        const at = row.tabs.indexOf(source);
        for (const [delta, label] of [[-1, 'Move tab left'], [1, 'Move tab right']] as const) {
          const move = this.control(label, `tab-move:${delta}`, () => {
            [row.tabs![at], row.tabs![at + delta]] = [row.tabs![at + delta], row.tabs![at]];
            this.redraw(`tab-move:${-delta}`);
          }); move.disabled = at + delta < 0 || at + delta >= row.tabs.length; actions.append(move);
        }
        content.append(actions, el('p', 'tvl-home-editor-help', 'Each tab keeps its own collection and item order. The first tab opens by default.'));
      }
    }
    content.append(el('h3', '', row.kind === 'collections' ? 'Choose collections' : 'Choose one collection'));
    const search = el('input'); search.type = 'search'; search.placeholder = 'Find collections'; search.setAttribute('aria-label', 'Find collections'); search.value = this.search; search.dataset.editorFocus = 'collection-search';
    const choices = el('div', 'tvl-home-collection-choices'); choices.setAttribute('role', 'group'); choices.setAttribute('aria-label', row.kind === 'collections' ? 'Choose collections' : 'Choose one collection');
    const drawChoices = () => {
      replace(choices);
      for (const collection of this.collections.filter(item => item.Name.toLocaleLowerCase().includes(this.search.toLocaleLowerCase()))) {
        const selected = row.kind === 'items' ? this.sourceCollection(row) === collection.Id : row.collectionIds.includes(collection.Id);
        const choice = this.control(collection.Name, `choose:${collection.Id}`, () => {
          if (this.ready) this.status.textContent = '';
          if (row.kind === 'items') {
            const source = this.source(row);
            if (source) { if (source.collectionId !== collection.Id) { source.collectionId = collection.Id; source.itemOrder = []; } }
            else if (row.collectionIds[0] !== collection.Id) { row.collectionIds = [collection.Id]; row.itemOrder = []; }
          }
          else if (selected) row.collectionIds = row.collectionIds.filter(id => id !== collection.Id);
          else if (row.collectionIds.length < 40) row.collectionIds.push(collection.Id);
          this.redraw(`choose:${collection.Id}`);
        }, 'tvl-home-collection-choice'); choice.setAttribute('aria-pressed', String(selected));
        choice.prepend(picture(this.api.image(collection, 'thumb'), 'tvl-home-choice-art')); choices.append(choice);
      }
      if (!choices.childElementCount) choices.append(el('p', '', 'No matching collections.'));
    };
    search.addEventListener('input', () => { this.search = search.value; drawChoices(); }); drawChoices(); content.append(search, choices);
  }
  private async loadItems(id: string): Promise<void> {
    if (this.loading.has(id)) return;
    this.loading.add(id); this.errors.delete(id);
    const revision = this.watchlistRevision;
    const current = () => !this.disposed && (id !== watchlistSource || revision === this.watchlistRevision);
    try { const items = await (id === watchlistSource ? getAllWatchlistItems(this.api) : this.api.getCollectionItems(id)); if (current()) this.items.set(id, items); }
    catch { if (current()) this.errors.add(id); }
    finally {
      if (!current()) return;
      this.loading.delete(id);
      const row = this.selectedRow();
      if (row && (row.kind === 'items' && this.sourceCollection(row) === id || row.kind === 'watchlist' && id === watchlistSource)) {
        if (this.tab === 'order') this.redraw();
        else this.renderPreview(row);
      }
    }
  }
  private renderPreview(row: HomeCollectionRow): void {
    if (!this.preview || this.disposed || row.id !== this.selectedId) return;
    this.disposePreviewAppearance?.(); this.disposePreviewAppearance = undefined;
    // Only the preview changes on data arrival or typing. If its retry control
    // disappears, keep focus on this persistent panel instead of the page body.
    const focusedSource = this.preview.contains(document.activeElement) && (document.activeElement as HTMLElement)?.dataset.sourceTab;
    if (this.preview.contains(document.activeElement)) this.preview.focus({ preventScroll: true });
    replace(this.preview);
    const header = el('div', 'tvl-home-preview-header');
    header.append(el('p', 'tvl-home-editor-eyebrow', 'HOME PREVIEW'), el('span', 'tvl-home-preview-draft', 'Unsaved draft'));
    this.preview.append(header);
    const sequence = combinedHomeOrder(this.draft.rows, this.anchors);
    const parent = this.parentOf(row), positionedRow = parent || row;
    const at = sequence.findIndex(entry => 'row' in entry && entry.row === positionedRow);
    const label = (entry: OrderEntry) => 'row' in entry ? this.name(entry.row) : entry.anchor.label;
    const before = this.anchors.length ? at > 0 ? `After ${label(sequence[at - 1])}` : 'Top of Home'
      : positionedRow.placement === 'start' ? 'Top of Home' : positionedRow.placement === 'end' ? 'After existing Home rows' : 'Home position preview';
    if (parent && row.season) this.preview.append(el('p', 'tvl-home-preview-season', `${seasonDateLabel(row.season.start)} – ${seasonDateLabel(row.season.end)} every year · ${isSeasonActive(row.season) ? 'Visible today' : 'Hidden today; preview only'}`));
    this.preview.append(el('p', 'tvl-home-preview-neighbour', parent ? `${before} · shared seasonal position` : before));
    const section = el('section', 'tvl-home-collection-row'); section.setAttribute('aria-label', this.name(row));
    section.append(el('h3', 'tvl-home-row-title', this.name(row)));
    const sourceSwitch = row.kind === 'items' ? this.sourceSwitch(row, true) : undefined;
    if (sourceSwitch) section.append(sourceSwitch);
    const panel = el('div'); panel.id = 'tvl-home-preview-items';
    if (sourceSwitch) { panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', `tvl-home-preview-tab-${encodeURIComponent(this.source(row)!.id)}`); }
    const cards = el('div', 'tvl-home-row-cards'); cards.setAttribute('role', 'list'); cards.setAttribute('aria-label', 'Preview items'); panel.append(cards); section.append(panel);
    const after = this.anchors.length ? at < sequence.length - 1 ? `Before ${label(sequence[at + 1])}` : 'End of Home' : 'Visit Home once to see neighbouring rows.';
    this.preview.append(section, el('p', 'tvl-home-preview-neighbour', after));
    if (focusedSource) Array.from(this.preview.querySelectorAll<HTMLElement>('[data-source-tab]')).find(control => control.dataset.sourceTab === focusedSource)?.focus({ preventScroll: true });
    const status = (message: string) => {
      cards.classList.add('tvl-home-preview-pending');
      const text = el('p', 'tvl-home-preview-message', message); text.setAttribute('aria-live', 'polite'); cards.append(text);
    };
    const selectedIds = row.kind === 'items' ? [this.sourceCollection(row)].filter(Boolean) : row.collectionIds;
    const chosen = selectedIds.map(id => this.collections.find(item => item.Id === id)).filter((item): item is Item => !!item);
    if (row.kind !== 'watchlist' && !chosen.length) {
      status(selectedIds.length ? 'The selected collection is unavailable. Choose another in Content.' : row.kind === 'items' ? 'Choose a collection to preview its items.' : 'Choose collections to see them here.');
      return;
    }
    let items = chosen;
    if (row.kind === 'items' || row.kind === 'watchlist') {
      const id = row.kind === 'watchlist' ? watchlistSource : chosen[0].Id;
      if (this.errors.has(id)) {
        status(row.kind === 'watchlist' ? 'Your Watchlist could not be loaded.' : 'The preview could not load these collection items.');
        cards.append(this.control('Retry preview', 'retry-preview', () => { void this.loadItems(id); this.renderPreview(row); })); return;
      }
      if (!this.items.has(id)) { status('Loading preview…'); void this.loadItems(id); return; }
      items = orderHomeItems(this.items.get(id)!, this.source(row) || row);
    }
    if (row.shuffle && !dailyAdvent(row)) {
      const key = `${row.id}:${this.source(row)?.id || ''}`;
      let order = this.previewShuffleOrders.get(key);
      if (!order || order.length !== items.length || items.some(item => !order!.includes(item.Id))) {
        order = shuffleHomeItems(items).map(item => item.Id); this.previewShuffleOrders.set(key, order);
      }
      const positions = new Map(order.map((id, index) => [id, index]));
      items = [...items].sort((a, b) => positions.get(a.Id)! - positions.get(b.Id)!);
    }
    items.slice(0, 60).forEach((item, index) => {
      const entry = el('div', 'tvl-home-row-entry'); entry.setAttribute('role', 'listitem');
      const card = homeRowCard(this.api, item, row.ranked ? index + 1 : undefined, row.appearance ? () => {} : undefined, row, index);
      if (row.appearance) card.dataset.editorFocus = `preview:item:${item.Id}`;
      entry.append(card); cards.append(entry);
    });
    if (!items.length) { status(row.kind === 'watchlist' ? 'Your Watchlist is empty. Save a movie or TV show to see it here.' : 'This collection is empty. Items added to it will appear here.'); return; }
    this.disposePreviewAppearance = decorateSeasonalRow(section, cards, row);
    if (row.appearance) this.preview.append(this.control('Focus preview', 'preview:focus', () => {
      cards.querySelector<HTMLElement>('.tvl-home-row-card')?.focus();
    }, 'tvl-home-seasonal-preview-focus'));
    const footer = el('div', 'tvl-home-preview-footer');
    const noun = row.kind === 'collections' ? 'collection' : 'item';
    footer.append(el('p', 'tvl-home-preview-count', items.length > 60 ? `First 60 of ${items.length} items${row.kind === 'watchlist' ? '' : ' · Home also shows View full collection'}` : `${items.length} ${noun}${items.length === 1 ? '' : 's'}`));
    if (items.length > 1) {
      const actions = el('div', 'tvl-home-preview-scroll'); actions.setAttribute('role', 'group'); actions.setAttribute('aria-label', 'Scroll the preview');
      for (const [direction, glyph] of [[-1, '←'], [1, '→']] as const) {
        const scroll = this.control(direction < 0 ? 'Previous preview items' : 'Next preview items', `preview:${direction}`, () => { cards.scrollBy({ left: cards.clientWidth * .8 * direction, behavior: 'auto' }); });
        scroll.setAttribute('aria-label', direction < 0 ? 'Previous preview items' : 'Next preview items'); scroll.querySelector('span')!.textContent = glyph; actions.append(scroll);
      }
      footer.append(actions);
    }
    this.preview.append(footer, el('p', 'tvl-home-preview-note', dailyAdvent(row) ? 'Films follow Item order. Preview doors always open; Home follows the season dates.' : row.shuffle ? 'Sample shuffled order. A fresh Home visit reshuffles; Back from an item keeps the current order.' : 'Updates as you edit. Save rows to apply to Home.'));
  }
  private renderOrder(row: HomeCollectionRow, content: HTMLElement): void {
    const shuffle = this.control('Shuffle on load', 'shuffle', () => {
      row.shuffle = !row.shuffle; shuffle.setAttribute('aria-pressed', String(row.shuffle)); this.renderPreview(row);
    }); shuffle.setAttribute('aria-pressed', String(!!row.shuffle));
    shuffle.disabled = dailyAdvent(row);
    content.append(shuffle, el('p', 'tvl-home-editor-help', dailyAdvent(row) ? 'Daily advent doors use the item order below. Shuffle on load is ignored so each film keeps its door number.' : 'Shuffle on a fresh Home visit. Back from an item keeps the current order. Your saved order below stays unchanged.'));
    content.append(el('p', 'tvl-home-editor-help', 'This changes the order in this Home row only. Other views keep their existing order.'));
    let items: Item[];
    if (row.kind === 'collections') items = row.collectionIds.map(id => this.collections.find(item => item.Id === id)).filter((item): item is Item => !!item);
    else {
      const id = row.kind === 'watchlist' ? watchlistSource : this.sourceCollection(row);
      if (row.kind !== 'watchlist' && (!id || !this.collections.some(item => item.Id === id))) { content.append(el('p', '', 'Choose an accessible collection in Content first.')); return; }
      const sorts: [HomeItemSort, string][] = [['collection', row.kind === 'watchlist' ? 'Watchlist order' : 'Collection order'], ['title', 'Title A–Z'], ['title-desc', 'Title Z–A'], ['newest', 'Newest year first'], ['oldest', 'Oldest year first'], ['custom', 'Custom order']];
      const options = el('div', 'tvl-home-sort-options'); options.setAttribute('role', 'group'); options.setAttribute('aria-label', 'Sort items');
      for (const [sort, label] of sorts) {
        const source = this.source(row) || row;
        const control = this.control(label, `sort:${sort}`, () => { source.itemSort = sort; this.redraw(`sort:${sort}`); }); control.setAttribute('aria-pressed', String(source.itemSort === sort)); options.append(control);
      }
      content.append(options);
      if (this.errors.has(id)) { content.append(this.control(row.kind === 'watchlist' ? 'Retry Watchlist' : 'Retry collection items', 'retry-items', () => { void this.loadItems(id); this.redraw('tab:order'); })); return; }
      if (!this.items.has(id)) { content.append(el('p', '', row.kind === 'watchlist' ? 'Loading Watchlist…' : 'Loading collection items…')); void this.loadItems(id); return; }
      items = orderHomeItems(this.items.get(id)!, this.source(row) || row);
    }
    if (!items.length) { content.append(el('p', '', 'No items to arrange yet.')); return; }
    const list = el('ol', 'tvl-home-item-order'); list.setAttribute('aria-label', 'Items in display order');
    items.slice(0, this.visibleItems).forEach((item, index) => {
      const line = el('li'); line.dataset.orderedItem = item.Id;
      line.append(el('span', 'tvl-home-item-number', String(index + 1)), picture(this.api.image(item, 'thumb'), 'tvl-home-order-art'), el('span', 'tvl-home-order-name', item.Name));
      const actions = el('div', 'tvl-home-editor-actions');
      for (const [delta, direction] of [[-1, 'earlier'], [1, 'later']] as const) {
        const control = this.control(`Move ${item.Name} ${direction}`, `move:${item.Id}:${direction}`, () => {
          const ordered = items.map(item => item.Id); [ordered[index], ordered[index + delta]] = [ordered[index + delta], ordered[index]];
          if (row.kind === 'collections') row.collectionIds = ordered; else { const source = this.source(row) || row; source.itemSort = 'custom'; source.itemOrder = ordered.slice(0, 2000); }
          this.visibleItems = Math.max(this.visibleItems, index + delta + 1);
          const focusDirection = index + delta === 0 ? 'later' : index + delta === items.length - 1 ? 'earlier' : direction;
          this.redraw(`move:${item.Id}:${focusDirection}`);
        }, 'tvl-home-move-item'); control.setAttribute('aria-label', `Move ${item.Name} ${direction}`); control.querySelector('span')!.textContent = delta < 0 ? '↑' : '↓';
        control.disabled = index + delta < 0 || index + delta >= Math.min(items.length, 2000); actions.append(control);
      }
      line.append(actions); list.append(line);
    }); content.append(list);
    if (items.length > this.visibleItems) content.append(this.control('Show more items', 'more-items', () => {
      const firstNew = items[this.visibleItems]; this.visibleItems += 60;
      this.redraw(firstNew ? `move:${firstNew.Id}:earlier` : 'tab:order');
    }));
  }
  private renderPosition(row: HomeCollectionRow, content: HTMLElement): void {
    content.append(el('p', 'tvl-home-editor-help', 'Move this row between your existing Home sections. Jellyfin and Featured keep control of their own rows.'));
    if (!this.anchors.length) content.append(el('p', '', 'Visit Home once to see its available sections here.'));
    const quick = el('div', 'tvl-home-editor-actions');
    quick.append(this.control('Move to top', 'position:top', () => { row.placement = 'start'; this.draft.rows = [row, ...this.draft.rows.filter(item => item !== row)]; this.redraw('position:top'); }),
      this.control('Move to bottom', 'position:bottom', () => { row.placement = 'end'; this.draft.rows = [...this.draft.rows.filter(item => item !== row), row]; this.redraw('position:bottom'); })); content.append(quick);
    const sequence = combinedHomeOrder(this.draft.rows, this.anchors);
    const list = el('ol', 'tvl-home-position-order'); list.setAttribute('aria-label', 'Home row order');
    sequence.forEach((entry, index) => {
      const line = el('li');
      if ('anchor' in entry) { line.className = 'tvl-home-native-position'; line.append(el('span', '', entry.anchor.label), el('small', '', 'Existing Home row')); }
      else {
        line.dataset.positionRow = entry.row.id; line.classList.toggle('tvl-home-position-selected', entry.row === row);
        line.append(this.control(this.name(entry.row), `position:${entry.row.id}`, () => { this.selectedId = entry.row.id; this.redraw(`position:${entry.row.id}`); }));
        if (entry.row === row) {
          for (const [delta, label] of [[-1, 'Move row up'], [1, 'Move row down']] as const) {
            const control = this.control(label, `position:move:${delta}`, () => {
              [sequence[index], sequence[index + delta]] = [sequence[index + delta], sequence[index]];
              sequence.forEach((entry, i) => { if ('row' in entry) entry.row.placement = sequence.slice(i + 1).find((next): next is {anchor: HomeAnchor} => 'anchor' in next)?.anchor.key || 'end'; });
              this.draft.rows = sequence.flatMap(entry => 'row' in entry ? [entry.row] : []); this.redraw(index + delta === 0 ? 'position:move:1' : index + delta === sequence.length - 1 ? 'position:move:-1' : `position:move:${delta}`);
            }); control.disabled = index + delta < 0 || index + delta >= sequence.length; line.append(control);
          }
        }
      }
      list.append(line);
    }); content.append(list);
  }
  private async save(): Promise<void> {
    if (!this.ready || this.disposed || this.saving) return;
    const datedRows = this.draft.rows.flatMap(row => row.kind === 'seasonal' ? row.children || [] : []);
    const invalidSeason = datedRows.find(row => !row.season || !validSeasonDate(row.season.start) || !validSeasonDate(row.season.end));
    if (invalidSeason) { this.status.textContent = 'Choose a valid start and end date for each seasonal row.'; this.selectedId = invalidSeason.id; this.tab = 'content'; this.redraw('season:start:month'); return; }
    const next = parseHomeCollections(this.draft);
    const invalid = next.rows.flatMap(row => row.kind === 'seasonal' ? row.children || [] : [row]).find(row => row.kind !== 'watchlist' && (row.tabs ? row.tabs.some(tab => !tab.collectionId) : !row.collectionIds.length));
    if (invalid) { this.status.textContent = 'Choose at least one collection for each row and each tab, or remove the empty entry.'; this.selectedId = invalid.id; this.tab = 'content'; if (invalid.tabs) this.selectedTabs.set(invalid.id, invalid.tabs.find(tab => !tab.collectionId)!.id); this.redraw('title'); return; }
    this.saving = true; this.status.textContent = this.store.synced ? 'Saving Home rows to Jellyfin…' : 'Saving Home rows…';
    const controls = Array.from(this.element.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input,button,select,textarea'))
      .map(control => ({ control, disabled: control.disabled }));
    controls.forEach(({ control }) => { control.disabled = true; });
    try { await this.store.save(next); this.saving = false; if (!this.disposed) this.close(); }
    catch (error) {
      if (this.disposed) return;
      this.status.textContent = error instanceof Error ? error.message : 'Home rows could not be saved. Try again.';
      if (error instanceof HomeCollectionSyncError && error.kind === 'conflict') {
        this.ready = false;
        this.status.append(button('Reload saved rows', '', '', () => {
          this.saveButton.disabled = true; this.status.textContent = 'Loading saved rows…'; void this.loadCollections();
        }));
      }
    } finally {
      this.saving = false;
      if (!this.disposed) { controls.forEach(({ control, disabled }) => { control.disabled = disabled; }); this.saveButton.disabled = !this.ready; }
    }
  }
  private close(restore = true): void {
    if (this.disposed || this.saving && restore) return;
    this.disposed = true; this.disposePreviewAppearance?.(); this.disposePreviewAppearance = undefined;
    this.store.destroy(); this.removeRemote(); this.removeWatchlist(); this.element.remove(); this.onClose(restore);
  }
  destroy(): void { this.close(false); }
}
