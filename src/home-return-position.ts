export type HomeItemAnchor = { top: number; left: number };

/** Keep the item in its original viewport slot even if native rows above it
 * change height, or Jellyfin replaces the element that owns vertical scroll. */
export function restoreHomeItemAnchor(target: HTMLElement, anchor: HomeItemAnchor, horizontal = true): void {
  const rect = target.getBoundingClientRect();
  let delta = rect.top - anchor.top;
  const cards = horizontal ? target.closest<HTMLElement>('.tvl-home-row-cards') : null;
  const across = cards ? rect.left - anchor.left : 0;
  if (Math.abs(delta) < 1 && Math.abs(across) < 1) return;

  const owners: HTMLElement[] = [];
  if (Math.abs(delta) >= 1) {
    for (let node = target.parentElement; node; node = node.parentElement) {
      if (node.scrollHeight > node.clientHeight && /(auto|scroll|overlay)/.test(getComputedStyle(node).overflowY)) owners.push(node);
    }
    if (document.scrollingElement instanceof HTMLElement && !owners.includes(document.scrollingElement)) owners.push(document.scrollingElement);
  }
  const styles = Array.from(new Set([...owners, ...(cards ? [cards] : []), document.documentElement, document.body]))
    .map(node => ({ node, value: node.style.getPropertyValue('scroll-behavior'), priority: node.style.getPropertyPriority('scroll-behavior') }));
  styles.forEach(({ node }) => node.style.setProperty('scroll-behavior', 'auto', 'important'));
  try {
    for (const node of owners) {
      if (Math.abs(delta) < 1) break;
      const before = node.scrollTop; node.scrollTop += Math.round(delta); delta -= node.scrollTop - before;
    }
    if (cards && Math.abs(across) >= 1) cards.scrollLeft += Math.round(across);
  } finally {
    styles.forEach(({ node, value, priority }) => {
      if (value) node.style.setProperty('scroll-behavior', value, priority);
      else node.style.removeProperty('scroll-behavior');
    });
  }
}
