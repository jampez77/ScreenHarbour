import { el } from './dom';
import type { HomeCollectionRow } from './home-collection-settings';
import { seasonalAssetUrl } from './seasonal-asset-url';
import { seasonalBackground, seasonalDoor, seasonalFrame } from './home-seasonal-art';
import { adventDoorArt } from './home-advent-art';
import { adventDoorState } from './home-advent';
import { seasonalRankImage } from './home-seasonal-rank';

type AdventCard = { row: HomeCollectionRow; index: number; caption: HTMLElement | null; title: string; label: string; opensAt?: number; opensLabel?: string };
const adventCards = new WeakMap<HTMLElement, AdventCard>();
const pendingBackgrounds = new WeakMap<HTMLElement, () => void>();
const dateChangeEvent = 'tvl-seasonal-date-change';

function refreshAdventCard(card: HTMLElement, reveal = false): boolean {
  const data = adventCards.get(card);
  if (!data) return true;
  const state = adventDoorState(data.row, data.index);
  const locked = state.locked && !card.closest('.tvl-home-preview');
  if (locked && state.opens && data.opensAt !== state.opens.getTime()) {
    data.opensAt = state.opens.getTime();
    data.opensLabel = state.opens.toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
  }
  const opens = state.opens ? data.opensLabel : undefined;
  if (card.dataset.adventLocked !== String(locked)) card.dataset.adventLocked = String(locked);
  card.classList.toggle('tvl-advent-locked', locked);
  if (locked) card.classList.remove('tvl-seasonal-item-open');
  if (locked) {
    if (card.getAttribute('aria-disabled') !== 'true') card.setAttribute('aria-disabled', 'true');
  } else if (card.hasAttribute('aria-disabled')) card.removeAttribute('aria-disabled');
  const caption = locked ? opens ? `Opens ${opens}` : 'Not available yet' : data.title;
  if (data.caption && data.caption.textContent !== caption) data.caption.textContent = caption;
  const label = locked ? `Advent door ${state.day}. ${opens ? `Opens ${opens}` : 'Not available yet'}`
    : reveal ? `Advent door ${state.day}: ${data.label}` : `Advent door ${state.day}`;
  if (card.getAttribute('aria-label') !== label) card.setAttribute('aria-label', label);
  return !locked;
}

/** Refresh dates in place, preserving focus, scroll position and loaded artwork. */
export function refreshSeasonalDate(section: HTMLElement): void {
  section.dispatchEvent(new Event(dateChangeEvent));
}

function decoration(className: string, src: string): HTMLImageElement {
  const image = el('img', className); image.src = src; image.alt = ''; image.draggable = false;
  image.setAttribute('aria-hidden', 'true'); return image;
}

/** Ordinary decorations preserve item actions; future advent doors stay focusable but closed. */
export function decorateSeasonalCard(card: HTMLElement, row: HomeCollectionRow, index: number): void {
  const appearance = row.appearance;
  const art = card.querySelector<HTMLElement>('.tvl-home-row-art');
  if (!appearance || !art) return;
  card.dataset.seasonalTheme = appearance.theme;
  card.dataset.seasonalReveal = appearance.reveal;
  card.dataset.seasonalCoverStyle = appearance.coverStyle || 'classic';
  card.dataset.seasonalFrameStyle = appearance.frameStyle || 'classic';
  if (appearance.frame) {
    art.dataset.seasonalFrame = appearance.theme;
    // Fit only the original poster inside the frame. Reveal layers and the
    // frame itself keep their full-size geometry, including in the preview.
    art.querySelector('img')?.classList.add('tvl-seasonal-poster');
  }
  if (appearance.reveal !== 'none') {
    const cover = el('span', 'tvl-seasonal-cover'); cover.setAttribute('aria-hidden', 'true');
    if (appearance.reveal === 'advent') {
      const flap = el('span', 'tvl-seasonal-advent-flap');
      flap.append(decoration('tvl-seasonal-advent-art', adventDoorArt(index + 1, appearance.coverStyle)),
        decoration('tvl-seasonal-advent-number', seasonalRankImage(index + 1, 'christmas', appearance.coverStyle)));
      cover.append(flap);
      const caption = card.querySelector<HTMLElement>('.tvl-home-row-caption');
      adventCards.set(card, { row, index, caption, title: caption?.textContent || '', label: card.getAttribute('aria-label') || '' });
      card.dataset.adventDay = String(index + 1);
      refreshAdventCard(card);
      // Capture before the normal card action. aria-disabled deliberately does
      // not remove future doors from TV directional navigation.
      card.addEventListener('click', event => {
        if (!refreshAdventCard(card, card.classList.contains('tvl-seasonal-item-open'))) {
          event.preventDefault(); event.stopImmediatePropagation();
        }
      }, true);
    } else for (const side of ['left', 'right'] as const) {
      const panel = el('span', `tvl-seasonal-panel tvl-seasonal-panel-${side}`);
      if (appearance.reveal === 'doors' || appearance.reveal === 'shutters') {
        const photo = appearance.coverStyle === 'photoreal' || appearance.coverStyle === 'nightmare';
        const src = photo ? seasonalAssetUrl(`${appearance.theme === 'halloween' ? 'halloween-nightmare' : 'christmas-photoreal'}-door.webp`)
          : seasonalDoor(appearance.theme, side, appearance.coverStyle);
        panel.append(decoration(`tvl-seasonal-door-art${photo ? ' tvl-seasonal-full-door' : ''}`, src));
      }
      cover.append(panel);
    }
    if (appearance.theme === 'christmas' && appearance.reveal === 'doors') {
      cover.append(el('span', 'tvl-seasonal-door-number', String(index + 1)));
    }
    art.append(cover);
  }
  if (appearance.frame) {
    const photo = appearance.frameStyle === 'photoreal' || appearance.frameStyle === 'nightmare';
    const src = photo ? seasonalAssetUrl(`${appearance.theme === 'halloween' ? 'halloween-nightmare' : 'christmas-photoreal'}-frame.webp`)
      : seasonalFrame(appearance.theme, appearance.frameStyle);
    art.append(decoration('tvl-seasonal-frame', src));
  }
  if (appearance.reveal === 'shutters') {
    const window = el('span', 'tvl-seasonal-window'); window.setAttribute('aria-hidden','true'); art.append(window);
  }
  if (appearance.frame && (appearance.frameStyle === 'photoreal' || appearance.frameStyle === 'nightmare')) {
    // Photo frames have transparent exterior margins and shaped openings. Keep
    // the poster, fallback and every reveal layer inside that opening, while
    // the frame itself and the card's focus outline retain their full extent.
    art.dataset.seasonalFrameShape = appearance.theme;
    const aperture = el('span', 'tvl-seasonal-aperture');
    for (const child of Array.from(art.children)) {
      if (!child.classList.contains('tvl-seasonal-frame')) aperture.append(child);
    }
    art.prepend(aperture);
  }
}

/** Older webOS Chromium serializes custom-property numbers to six significant
 * digits. Comparing its CSS text with a full floating-point result can rewrite
 * the same style forever through Home's mutation observer. */
function seasonalPixels(section: HTMLElement, property: string, value: number): void {
  if (!Number.isFinite(value)) return;
  const next = Math.round(Math.max(0, value) * 100) / 100;
  const stored = section.style.getPropertyValue(property).trim();
  const current = /^\d+(?:\.\d+)?px$/.test(stored) ? parseFloat(stored) : NaN;
  // Keep subpixel sizing while accepting the legacy CSSOM's numeric precision.
  const tolerance = Math.max(.005, next * .000005);
  if (!Number.isFinite(current) || Math.abs(current - next) > tolerance) section.style.setProperty(property, `${next}px`);
}

/** Measure once mounted so expansion reveals a fixed scene instead of stretching it. */
export function refreshSeasonalBackdrop(section: HTMLElement): void {
  if (!section.classList.contains('tvl-seasonal-row') || !section.isConnected) return;
  const startBackground = pendingBackgrounds.get(section);
  if (startBackground) { pendingBackgrounds.delete(section); startBackground(); }
  const style = getComputedStyle(section);
  const base = Math.max(0, Math.round(section.getBoundingClientRect().height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)));
  if (!Number.isFinite(base)) return;
  const factor = section.dataset.seasonalExpansion === 'large' ? 1 : section.dataset.seasonalExpansion === 'medium' ? .5 : 0;
  const extra = Math.max(0, Math.min(base * factor, window.innerHeight * .78 - base));
  seasonalPixels(section, '--tvl-seasonal-art-height', Math.round(base + extra + 2 * parseFloat(getComputedStyle(document.documentElement).fontSize)));
  seasonalPixels(section, '--tvl-seasonal-space', extra / 2);
}

/** All listeners belong to this row; there are no per-row document observers. */
export function decorateSeasonalRow(section: HTMLElement, cards: HTMLElement, row: HomeCollectionRow): () => void {
  const appearance = row.appearance;
  if (!appearance) return () => {};
  section.classList.add('tvl-seasonal-row');
  section.dataset.seasonalTheme = appearance.theme;
  section.dataset.seasonalBackground = appearance.background;
  section.dataset.seasonalExpansion = appearance.expansion;
  const preview = () => !!section.closest('.tvl-home-preview');
  let hovered: HTMLElement | null = null, expanded = false, disposed = false;
  let backdrop: HTMLElement | undefined;
  let backdropObserver: IntersectionObserver | undefined;
  let backgroundLoaded = false;
  if (appearance.background !== 'none') {
    backdrop = el('div', 'tvl-seasonal-backdrop'); backdrop.setAttribute('aria-hidden', 'true');
    section.prepend(backdrop);
  }
  const loadBackground = () => {
    if (!backdrop || backgroundLoaded || disposed || !section.isConnected) return;
    backgroundLoaded = true;
    pendingBackgrounds.delete(section);
    backdropObserver?.disconnect(); backdropObserver = undefined;
    // Keep the row and its expansion geometry ready from the first paint, but
    // only request/decode its scenery as navigation approaches the row.
    backdrop.style.backgroundImage = `url("${seasonalBackground(appearance.theme, appearance.backgroundStyle)}")`;
    if (appearance.background === 'parallax') onScroll();
  };
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let scrollFrame = 0, settleFrame = 0, focusFrame = 0;
  let until = 0;
  const threeDimensional = appearance.reveal === 'doors' || appearance.reveal === 'shutters' || appearance.reveal === 'advent';
  const closing = new Map<HTMLElement, number>();
  const finishClosing = (card: HTMLElement) => {
    const timer = closing.get(card);
    if (timer !== undefined) window.clearTimeout(timer);
    closing.delete(card);
    if (!card.classList.contains('tvl-seasonal-item-open') && card.classList.contains('tvl-seasonal-reveal-active')) card.classList.remove('tvl-seasonal-reveal-active');
  };
  const updateReveal = (card: HTMLElement, open: boolean, wasOpen: boolean) => {
    if (threeDimensional && open) {
      const timer = closing.get(card);
      if (timer !== undefined) { window.clearTimeout(timer); closing.delete(card); }
      if (!card.classList.contains('tvl-seasonal-reveal-active')) card.classList.add('tvl-seasonal-reveal-active');
    }
    card.classList.toggle('tvl-seasonal-item-open', open);
    if (threeDimensional && !open && wasOpen) {
      if (reduced()) finishClosing(card);
      // transitionend normally releases the layer; the fallback also covers
      // interrupted transitions and clients that omit the event when hidden.
      else if (!closing.has(card)) closing.set(card, window.setTimeout(() => finishClosing(card), 500));
    }
  };
  const item = (target: EventTarget | null): HTMLElement | null => {
    const card = target instanceof Element ? target.closest<HTMLElement>('.tvl-home-row-card') : null;
    return card && cards.contains(card) ? card : null;
  };
  // Padding transitions can move the next focused row as the old one closes.
  // Keep the *current* selection visible, never refocus an earlier card.
  const keepSelectionVisible = () => {
    if (disposed || !section.isConnected || preview()) return;
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !active.closest('#homeTab') || active.closest('#homeTab') !== section.closest('#homeTab')) return;
    const header = document.querySelector('.skinHeader:not(.osdHeader)')?.getBoundingClientRect();
    const clearance = Math.max(80, header && header.bottom < window.innerHeight / 2 ? header.bottom + 12 : 0);
    let rect = active.getBoundingClientRect();
    if (rect.bottom > window.innerHeight - 16) active.scrollIntoView({block:'nearest',inline:'nearest',behavior:'auto'});
    rect = active.getBoundingClientRect();
    if (rect.top >= clearance) return;
    for (let parent = active.parentElement; parent && rect.top < clearance; parent = parent.parentElement) {
      if (parent.scrollHeight <= parent.clientHeight || !/(auto|scroll|overlay)/.test(getComputedStyle(parent).overflowY)) continue;
      parent.scrollTop += Math.floor(rect.top - clearance) - 1;
      rect = active.getBoundingClientRect();
    }
    if (rect.top < clearance) window.scrollBy(0, Math.floor(rect.top - clearance) - 1);
  };
  const settle = () => {
    cancelAnimationFrame(settleFrame);
    if (preview()) return;
    until = performance.now() + (reduced() ? 40 : 400);
    const follow = () => {
      if (disposed || !section.isConnected) return;
      keepSelectionVisible();
      if (performance.now() < until) settleFrame = requestAnimationFrame(follow);
    };
    settleFrame = requestAnimationFrame(follow);
  };
  const onTransition = (event: TransitionEvent) => {
    if (event.target === section && event.propertyName.startsWith('padding')) keepSelectionVisible();
    if (event.propertyName === 'transform' && event.target instanceof Element
      && event.target.matches('.tvl-seasonal-panel,.tvl-seasonal-advent-flap')) {
      const card = item(event.target);
      if (card && !card.classList.contains('tvl-seasonal-item-open')) finishClosing(card);
    }
  };
  const sync = () => {
    if (disposed) return;
    const focused = item(document.activeElement);
    // Remote focus can jump directly into a row before the observer delivers
    // its first callback. Mouse navigation and editor previews work likewise.
    if (focused || hovered) loadBackground();
    cards.querySelectorAll<HTMLElement>('.tvl-home-row-card[data-seasonal-theme]').forEach(card => {
      const reveal = card === focused || card === hovered;
      const wasOpen = card.classList.contains('tvl-seasonal-item-open');
      updateReveal(card, refreshAdventCard(card, reveal) && reveal, wasOpen);
    });
    const active = !!focused;
    section.classList.toggle('tvl-seasonal-focused', active);
    if (appearance.expansion === 'none' || active === expanded) return;
    if (active) refreshSeasonalBackdrop(section);
    expanded = active;
    section.classList.toggle('tvl-seasonal-expanded', active);
    if (focused || !active) settle();
  };
  const onFocus = () => { hovered = null; cancelAnimationFrame(focusFrame); sync(); };
  const onBlur = () => { hovered = null; cancelAnimationFrame(focusFrame); focusFrame = requestAnimationFrame(sync); };
  const onPointer = (event: PointerEvent) => {
    // TV focus and touch activation must not leave a synthetic hover open.
    if (event.pointerType !== 'mouse') return;
    hovered = item(event.target); sync();
  };
  const onLeave = () => { hovered = null; sync(); };
  const updateParallax = () => {
    scrollFrame = 0;
    if (!backdrop || !backgroundLoaded || disposed) return;
    const range = cards.scrollWidth - cards.clientWidth;
    const progress = range > 0 ? Math.max(0, Math.min(1, cards.scrollLeft / range)) : .5;
    backdrop.style.backgroundPosition = `${reduced() ? 50 : 35 + progress * 30}% center`;
  };
  const onScroll = () => { if (!scrollFrame) scrollFrame = requestAnimationFrame(updateParallax); };
  section.addEventListener('transitionend', onTransition);
  section.addEventListener(dateChangeEvent, sync);
  cards.addEventListener('focusin', onFocus);
  cards.addEventListener('focusout', onBlur);
  cards.addEventListener('pointerover', onPointer);
  cards.addEventListener('pointerleave', onLeave);
  if (appearance.background === 'parallax') { cards.addEventListener('scroll', onScroll, { passive: true }); onScroll(); }
  if (backdrop) {
    // Home may abandon a prepared row before mounting it. A weak initializer
    // lets that DOM be collected without an observer retaining the whole row.
    pendingBackgrounds.set(section, () => {
      if (disposed || backgroundLoaded) return;
      if (preview() || typeof IntersectionObserver !== 'function') loadBackground();
      else try {
        backdropObserver = new IntersectionObserver(entries => {
          if (entries.some(entry => entry.isIntersecting || entry.intersectionRatio > 0)) loadBackground();
        }, { rootMargin: '300px 0px' });
        backdropObserver.observe(section);
      } catch {
        // Older TV clients must retain their artwork if observation is missing
        // or fails, rather than waiting forever for an unavailable callback.
        backdropObserver?.disconnect(); backdropObserver = undefined;
        loadBackground();
      }
    });
  }
  refreshSeasonalBackdrop(section);
  sync();
  return () => {
    disposed = true; cancelAnimationFrame(scrollFrame); cancelAnimationFrame(settleFrame); cancelAnimationFrame(focusFrame);
    pendingBackgrounds.delete(section);
    backdropObserver?.disconnect(); backdropObserver = undefined;
    for (const timer of closing.values()) window.clearTimeout(timer);
    closing.clear();
    cards.querySelectorAll('.tvl-seasonal-reveal-active').forEach(card => card.classList.remove('tvl-seasonal-reveal-active'));
    section.removeEventListener('transitionend', onTransition);
    section.removeEventListener(dateChangeEvent, sync);
    cards.removeEventListener('focusin', onFocus); cards.removeEventListener('focusout', onBlur);
    cards.removeEventListener('pointerover', onPointer); cards.removeEventListener('pointerleave', onLeave);
    cards.removeEventListener('scroll', onScroll);
  };
}
