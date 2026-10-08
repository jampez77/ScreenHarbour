import type { Item, MediaApi } from './types';
import { el, picture } from './dom';
import { decorateSeasonalCard } from './home-seasonal-appearance';
import type { HomeCollectionRow } from './home-collection-settings';
import { rankImage } from './home-collection-settings';
import { seasonalRankImage } from './home-seasonal-rank';

/** The same artwork and sizing for a saved Home row and its non-interactive draft. */
export function homeRowCard(api: MediaApi, item: Item, rank?: number, onSelect?: () => void, row?: HomeCollectionRow, index = 0): HTMLElement {
  const card = onSelect ? el('button') : el('div');
  card.className = `tvl-home-row-card${rank ? ' tvl-home-ranked' : ''}`;
  card.dataset.itemId = item.Id;
  card.setAttribute('aria-label', rank ? `Rank ${rank}: ${item.Name}` : item.Name);
  if (card instanceof HTMLButtonElement) {
    card.type = 'button'; card.addEventListener('click', onSelect!);
  } else card.setAttribute('role', 'img');
  if (rank) {
    const artwork = el('img', 'tvl-home-rank');
    const appearance = row?.appearance;
    const style = appearance?.rankStyle ?? appearance?.frameStyle ?? 'classic';
    artwork.src = appearance && style !== 'standard' ? seasonalRankImage(rank, appearance.theme, style) : rankImage(rank);
    artwork.alt = ''; artwork.setAttribute('aria-hidden', 'true'); card.append(artwork);
  }
  const cover = el('div', 'tvl-home-row-cover');
  cover.append(picture(api.image(item, 'poster'), 'tvl-home-row-art'), el('span', 'tvl-home-row-caption', item.Name));
  card.append(cover);
  if (row) decorateSeasonalCard(card, row, index, api.getSeasonalDate ? () => api.getSeasonalDate?.() : undefined);
  return card;
}
