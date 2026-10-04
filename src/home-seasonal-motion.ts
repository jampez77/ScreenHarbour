/** Seasonal expansion commits layout once; only visual layers animate afterward. */
const motions = new Map<HTMLElement, Animation>();
const measureRows = new WeakMap<HTMLElement, () => void>();
let followFrame = 0;

export function seasonalHeaderClearance(): number {
  const header = document.querySelector('.skinHeader:not(.osdHeader)')?.getBoundingClientRect();
  return Math.max(80, header && header.bottom < window.innerHeight / 2 ? header.bottom + 12 : 0);
}

/** Remote row order follows final layout, not temporary expansion transforms. */
export function seasonalNavigationTop(node: HTMLElement): number {
  let top = node.getBoundingClientRect().top;
  if (!motions.size) return top;
  for (let parent: HTMLElement | null = node; parent; parent = parent.parentElement) {
    if (!motions.has(parent)) continue;
    // Content/row motions are translations only. Leave native transforms and
    // CSS ordering alone, and remove only the offset owned by this animation.
    const matrix = getComputedStyle(parent).transform.match(/^matrix(3d)?\((.+)\)$/);
    if (matrix) top -= Number(matrix[2].split(',')[matrix[1] ? 13 : 5]) || 0;
  }
  return top;
}

function scrollOwners(node: HTMLElement): HTMLElement[] {
  const owners: HTMLElement[] = [];
  for (let parent = node.parentElement; parent; parent = parent.parentElement) {
    if (parent.scrollHeight > parent.clientHeight && /(auto|scroll|overlay)/.test(getComputedStyle(parent).overflowY)) owners.push(parent);
  }
  if (document.scrollingElement instanceof HTMLElement && !owners.includes(document.scrollingElement)) owners.push(document.scrollingElement);
  return owners;
}

/** CSS smooth scrolling also applies to scrollTop and behavior:auto. Temporarily
 * suppress it, preserving both the original declaration and its priority. */
function instant(owners: HTMLElement[], action: () => void): void {
  const nodes = Array.from(new Set([...owners, document.documentElement, document.body]));
  const saved = nodes.map(node => ({ node, value: node.style.getPropertyValue('scroll-behavior'), priority: node.style.getPropertyPriority('scroll-behavior') }));
  for (const { node } of saved) node.style.setProperty('scroll-behavior', 'auto', 'important');
  try {
    // Cancel any smooth movement queued by the native focus controller first.
    for (const owner of owners) owner.scrollTop = owner.scrollTop;
    action();
  } finally {
    for (const { node, value, priority } of saved) {
      if (value) node.style.setProperty('scroll-behavior', value, priority);
      else node.style.removeProperty('scroll-behavior');
    }
  }
}

function alignSelection(active: HTMLElement, finish = false, vertical = true): void {
  if (!active.isConnected || !active.closest('#homeTab')) return;
  let delta = 0;
  if (vertical) {
    const row = active.closest<HTMLElement>('.tvl-seasonal-row');
    const fullscreen = row?.dataset.seasonalExpansion === 'fullscreen' && row.classList.contains('tvl-seasonal-expanded')
      && !!active.closest('.tvl-home-row-card');
    const clearance = seasonalHeaderClearance();
    const rect = fullscreen ? row!.getBoundingClientRect() : active.getBoundingClientRect();
    delta = fullscreen ? rect.top - clearance : rect.top < clearance ? rect.top - clearance
      : rect.bottom > window.innerHeight - 16 ? rect.bottom - window.innerHeight + 16 : 0;
    // Legacy scrollTop stores whole pixels. Keep a small safe edge instead of
    // leaving a fractional part of the focus ring underneath the header.
    delta = delta < 0 ? Math.floor(delta) - (fullscreen ? 0 : 1) : fullscreen ? Math.floor(delta) : delta > 0 ? Math.ceil(delta) + 1 : 0;
  }
  // Horizontal focus within an already aligned scene needs only its scroller.
  const owners = vertical && (finish || Math.abs(delta) >= 1) ? scrollOwners(active) : [];
  const cards = active.closest<HTMLElement>('.tvl-home-row-cards');
  instant(cards ? [cards, ...owners] : owners, () => {
    for (const owner of owners) {
      if (Math.abs(delta) < 1) break;
      const before = owner.scrollTop; owner.scrollTop += delta; delta -= owner.scrollTop - before;
    }
    if (cards) {
      const item = active.getBoundingClientRect(), strip = cards.getBoundingClientRect();
      if (item.left < strip.left + 6) cards.scrollLeft += item.left - strip.left - 6;
      else if (item.right > strip.right - 8) cards.scrollLeft += item.right - strip.right + 8;
    }
  });
}

/** Used after preventScroll focus so native card centering cannot undo the scene. */
export function scrollSeasonalSelectionIntoView(node: HTMLElement): boolean {
  if (!node.closest('.tvl-seasonal-row .tvl-home-row-card') || node.closest('.tvl-home-preview')) return false;
  const row = node.closest<HTMLElement>('.tvl-seasonal-row');
  // A neighbour may still be translating after another row closes. Its
  // intermediate rectangle is not a new scroll target; completion aligns it.
  // Its horizontal coordinates are stable, so Right/Left still reveal the
  // selected poster immediately while vertical motion finishes.
  alignSelection(node, false, !row || !motions.has(row)); return true;
}

function followSelection(): void {
  cancelAnimationFrame(followFrame);
  followFrame = requestAnimationFrame(() => {
    followFrame = 0;
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return;
    const row = active.closest<HTMLElement>('.tvl-seasonal-row');
    // A neighbour can still be visually moving into its final layout slot.
    // Do not scroll to that intermediate transform; completion settles once.
    if (motions.size && (row?.dataset.seasonalExpansion !== 'fullscreen' || motions.has(row))) return;
    if (row?.classList.contains('tvl-seasonal-expanded')) measureRows.get(row)?.();
    alignSelection(active, true);
  });
}

export function cancelSeasonalMotion(): void {
  cancelAnimationFrame(followFrame); followFrame = 0;
  for (const animation of motions.values()) animation.cancel();
  motions.clear();
}

function animate(node: HTMLElement, frames: Keyframe[], duration: number, done?: () => void): void {
  if (typeof node.animate !== 'function' || !duration) { done?.(); return; }
  const animation = node.animate(frames, { duration, easing: 'cubic-bezier(.22,.7,.25,1)', fill: 'both' });
  motions.set(node, animation);
  animation.onfinish = () => {
    if (motions.get(node) !== animation) return;
    motions.delete(node); animation.cancel(); done?.();
    if (!motions.size) followSelection();
  };
}

/** Read the current visual positions before cancelling an interrupted motion,
 * then set the final row size once and move the affected layers into place. */
export function changeSeasonalExpansion(section: HTMLElement, expanded: boolean, measure: () => void): void {
  measureRows.set(section, measure);
  const preview = !!section.closest('.tvl-home-preview');
  const home = section.closest('#homeTab');
  const contents = Array.from(section.children).filter((node): node is HTMLElement => node instanceof HTMLElement && !node.classList.contains('tvl-seasonal-backdrop'));
  const neighbours = home ? Array.from(home.querySelectorAll<HTMLElement>('.verticalSection,.tvl-home-collection-row,.ec-root'))
    .filter(node => node !== section && !node.contains(section) && !section.contains(node)) : [];
  const outerNeighbours = neighbours.filter(node => !neighbours.some(other => other !== node && other.contains(node)));
  const moving = Array.from(motions.keys()).filter(node => node.isConnected);
  const nodes = Array.from(new Set([...contents, ...outerNeighbours, ...moving.filter(node => node !== section && !node.matches('.tvl-seasonal-backdrop,.tvl-seasonal-scene'))]));
  const before = new Map(nodes.map(node => [node, node.getBoundingClientRect()]));
  const backdrop = section.querySelector<HTMLElement>('.tvl-seasonal-backdrop');
  const backdrops = Array.from(new Set([...moving.filter(node => node.classList.contains('tvl-seasonal-backdrop')), ...(backdrop ? [backdrop] : [])]));
  const oldScenes = new Map(backdrops.map(node => [node, node.getBoundingClientRect()]));
  // No per-frame layout changes or measurements: even rapid row changes start
  // from the current visual position and release the previous temporary layers.
  cancelSeasonalMotion();
  section.classList.toggle('tvl-seasonal-expanded', expanded);
  const active = document.activeElement;
  if (!preview && active instanceof HTMLElement) alignSelection(active, true);
  // Scrolling can move the native header out of the scene. Measure the newly
  // available height before capturing final animation geometry; repeat only
  // at the bounded follow-up points if the header updates asynchronously.
  if (expanded && !preview) measure();
  const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 260;
  const positions = new Map(nodes.filter(node => node.isConnected).map(node => [node, node.getBoundingClientRect()]));
  const offsets = new Map<HTMLElement, number>();
  for (const [node, next] of positions) {
    const old = before.get(node)!;
    if (!old.height || !next.height || old.bottom < 0 && next.bottom < 0 || old.top > window.innerHeight && next.top > window.innerHeight) continue;
    offsets.set(node, old.top - next.top);
  }
  const parentOffset = (node: HTMLElement): number => {
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      if (offsets.has(parent)) return offsets.get(parent)!;
    }
    return 0;
  };
  // Retarget interrupted child animations as well as neighbouring rows. A
  // collapsing previous row must not snap the new row's partly moved posters.
  for (const [node, offset] of offsets) {
    const delta = offset - parentOffset(node);
    if (Math.abs(delta) > 1) animate(node, [{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }], duration);
  }
  for (const backdrop of backdrops) {
    const scene = backdrop.querySelector<HTMLElement>('.tvl-seasonal-scene');
    const oldScene = oldScenes.get(backdrop);
    if (!scene || !oldScene?.height) continue;
    const next = backdrop.getBoundingClientRect();
    // Parent motions have already been installed; use their final slot here.
    const movingParent = parentOffset(backdrop);
    const finalTop = next.top - movingParent;
    const ratio = Math.max(.05, oldScene.height / Math.max(1, next.height));
    const delta = (oldScene.top + oldScene.height / 2) - (finalTop + next.height / 2) - movingParent;
    // Counter-scale the artwork inside the scaled clipping surface. This
    // reveals more of the fixed scene without stretching the image itself.
    const frames: Keyframe[] = [], inner: Keyframe[] = [];
    const horizontal = scene.style.transform || 'translateX(0)';
    for (let step = 0; step <= 20; step++) {
      const offset = step / 20, scale = ratio + (1 - ratio) * offset;
      frames.push({ offset, transform: `translateY(${delta * (1 - offset)}px) scaleY(${scale})` });
      inner.push({ offset, transform: `${horizontal} scaleY(${1 / scale})` });
    }
    animate(backdrop, frames, duration, () => { if (!preview) followSelection(); });
    animate(scene, inner, duration);
  }
  if (!preview) followSelection();
}

/** Late title fonts or resize change geometry once, then settle without a loop. */
export function settleSeasonalSelection(): void {
  if (document.activeElement instanceof HTMLElement) alignSelection(document.activeElement, true);
  followSelection();
}
