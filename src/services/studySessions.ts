import type { Card, EntityId, StudySessionSource } from '../types';
import { db } from '../db/database';
import { takeRandom } from '../utils/random';

export async function loadStudyCards(deckId: EntityId, source: StudySessionSource): Promise<Card[]> {
  const cards = await db.cards.where('deckId').equals(deckId).toArray();
  const now = new Date();

  switch (source) {
    case 'all':
      return cards.sort(sortByDueThenUpdated);
    case 'lapsed':
      return cards
        .filter((card) => card.lapses > 0 || card.ease <= 1.8)
        .sort(sortByDueThenUpdated);
    case 'random':
      return takeRandom(cards, Math.min(cards.length, 20));
    case 'mistakes': {
      const mistakeLogs = await db.reviewLogs
        .where('deckId')
        .equals(deckId)
        .and((log) => log.rating === 'again' || log.rating === 'hard')
        .reverse()
        .limit(50)
        .toArray();
      const mistakeIds = new Set(mistakeLogs.map((log) => log.cardId));
      return cards.filter((card) => mistakeIds.has(card.id)).sort(sortByDueThenUpdated);
    }
    case 'due':
    default:
      return cards
        .filter((card) => new Date(card.dueAt) <= now)
        .sort(sortByDueThenUpdated);
  }
}

export function sortByDueThenUpdated(a: Card, b: Card): number {
  const due = a.dueAt.localeCompare(b.dueAt);
  if (due !== 0) return due;
  return b.updatedAt.localeCompare(a.updatedAt);
}
