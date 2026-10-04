import type { Item, MediaApi } from './types';

type ChannelCache = { key: string; expires: number; request: Promise<Map<string, Item>> };
type Artwork = { channelId: string; image: HTMLImageElement; pending?: () => void };
let channels: ChannelCache | undefined;
const identity = (id: string) => /^[\da-f]{32}$|^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id) ? id.replace(/-/g, '').toLowerCase() : id;
export function clearHomeChannelArtwork(): void { channels = undefined; }

function channelList(api: MediaApi): ChannelCache {
  const key = JSON.stringify([api.serverId, api.userId]);
  if (channels?.key === key && channels.expires > Date.now()) return channels;
  const entry: ChannelCache = { key, expires: Date.now() + 300_000, request: Promise.resolve(new Map()) };
  channels = entry;
  entry.request = api.getChannels().then(items => new Map(items.filter(item => item.Type === 'TvChannel').map(item => [identity(item.Id), item])))
    .catch(() => { entry.expires = Date.now() + 30_000; return new Map(); });
  return entry;
}

function nativeImage(art: HTMLElement): boolean {
  // A lazy URL is real programme artwork even before the scroller loads it.
  // Do not put a channel logo over an image that is simply off screen.
  if (art.getAttribute('data-src')?.trim() || /url\(\s*["']?[^"')\s]/i.test(art.style.backgroundImage)) return true;
  return Array.from(art.querySelectorAll<HTMLImageElement>('img:not(.tvl-home-channel-logo)'))
    .some(image => !!(image.getAttribute('src') || image.getAttribute('data-src')));
}

/** Decorate native Home cards without rebuilding their links, progress or focus. */
export class HomeChannelArtwork {
  private observer: MutationObserver;
  private frame?: number;
  private disposed = false;
  private suspended = false;
  private requested = false;
  private cacheExpires = 0;
  private retryTimer?: number;
  private lookup?: Map<string, Item>;
  private artwork = new Map<HTMLElement, Artwork>();

  constructor(private api: MediaApi) {
    this.observer = new MutationObserver(records => {
      if (records.some(record => record.type === 'childList'
        || (record.target as Element).matches('.card, .cardImageContainer, .cardImageContainer img:not(.tvl-home-channel-logo)'))) this.schedule();
    });
    this.observe();
    this.schedule();
  }

  private observe(): void {
    this.observer.observe(document.body, { childList: true, subtree: true, attributes: true,
      attributeFilter: ['style', 'data-src', 'src', 'data-channelid', 'data-id', 'data-type'] });
  }

  private schedule(): void {
    if (this.disposed || this.suspended || this.frame !== undefined) return;
    this.frame = requestAnimationFrame(() => { this.frame = undefined; this.update(); });
  }

  private remove(art: HTMLElement): void {
    this.artwork.get(art)?.image.remove(); this.artwork.delete(art);
    art.classList.remove('tvl-home-channel-fallback');
  }

  private update(): void {
    if (this.disposed || this.suspended) return;
    window.clearTimeout(this.retryTimer); this.retryTimer = undefined;
    const host = document.querySelector('#indexPage #homeTab, #homeTab');
    const missing = new Map<HTMLElement, string>();
    for (const card of Array.from(host?.querySelectorAll<HTMLElement>('.card[data-type="Program"], .card[data-type="TvChannel"]') || [])) {
      const channelId = card.dataset.type === 'TvChannel' ? card.dataset.id : card.dataset.channelid;
      const art = card.querySelector<HTMLElement>('.cardImageContainer');
      if (channelId && art && !nativeImage(art)) missing.set(art, identity(channelId));
    }
    for (const [art, state] of this.artwork) {
      if (missing.get(art) !== state.channelId) this.remove(art);
    }
    if (!missing.size) return;
    const unresolved = () => [...missing.keys()].some(art => !this.artwork.has(art) || !this.artwork.get(art)!.image.isConnected);
    if (!this.lookup || unresolved() && this.cacheExpires <= Date.now()) {
      if (!this.requested) {
        this.requested = true;
        const cached = channelList(this.api);
        void cached.request.then(items => {
          if (this.disposed) return;
          this.lookup = items; this.cacheExpires = cached.expires; this.requested = false;
          if (this.suspended) return;
          for (const [art, state] of this.artwork) if (!state.image.isConnected) this.remove(art);
          this.schedule();
        });
      }
      if (!this.lookup) return;
    }
    for (const [art, channelId] of missing) {
      if (this.artwork.has(art)) continue;
      const channel = this.lookup.get(channelId);
      if (!channel) continue;
      // Primary is the native channel-logo image. Never use a channel's
      // programme backdrop as a substitute for its logo.
      const primary = channel.ImageTags?.Primary ? this.api.image({ ...channel,
        ImageTags: { Primary: channel.ImageTags.Primary }, BackdropImageTags: [] }, 'poster') : null;
      const urls = [...new Set([this.api.image(channel, 'logo'), primary].filter((url): url is string => !!url))];
      if (!urls.length) continue;
      const image = document.createElement('img'); image.className = 'tvl-home-channel-logo'; image.alt = '';
      image.setAttribute('aria-hidden', 'true'); image.draggable = false; image.hidden = true;
      const state: Artwork = { channelId, image }; this.artwork.set(art, state);
      const current = () => {
        const card = art.closest<HTMLElement>('.card');
        const id = card?.dataset.type === 'TvChannel' ? card.dataset.id : card?.dataset.type === 'Program' ? card.dataset.channelid : undefined;
        return !this.disposed && !this.suspended && this.artwork.get(art) === state && art.isConnected && !!id && identity(id) === channelId && !nativeImage(art);
      };
      const loaded = () => {
        if (this.disposed) return;
        if (this.suspended) { state.pending = loaded; return; }
        if (!current()) { this.schedule(); return; }
        image.hidden = false; art.classList.add('tvl-home-channel-fallback');
      };
      const failed = () => {
        if (this.disposed) return;
        if (this.suspended) { state.pending = failed; return; }
        if (!current()) return;
        const next = urls.shift();
        if (next) image.src = next;
        else { image.remove(); art.classList.remove('tvl-home-channel-fallback'); }
      };
      image.addEventListener('load', loaded);
      image.addEventListener('error', failed);
      image.src = urls.shift()!; art.append(image);
    }
    // Retry unresolved channels after the shared cache expires, including a
    // temporarily failed lookup, without tying retries to unrelated mutations.
    if (!this.requested && unresolved()) {
      this.retryTimer = window.setTimeout(() => { this.retryTimer = undefined; this.schedule(); }, Math.max(100, this.cacheExpires - Date.now() + 1));
    }
  }

  /** Stop off-route observation without discarding decoded channel logos. */
  suspend(): void {
    if (this.disposed || this.suspended) return;
    this.suspended = true; this.observer.disconnect();
    window.clearTimeout(this.retryTimer); this.retryTimer = undefined;
    if (this.frame !== undefined) { cancelAnimationFrame(this.frame); this.frame = undefined; }
  }

  resume(): void {
    if (this.disposed || !this.suspended) return;
    this.suspended = false; this.observe();
    for (const state of this.artwork.values()) {
      const pending = state.pending; state.pending = undefined; pending?.();
    }
    this.schedule();
  }

  destroy(): void {
    this.suspend(); this.disposed = true;
    for (const art of this.artwork.keys()) this.remove(art);
  }
}
