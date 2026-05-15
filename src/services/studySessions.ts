import type { Card, EntityId, StudySessionSource } from '../types';
import { db } from '../db/database';
import { takeRandom } from '../utils/random';

export interface StudyFilter {
  deckIds: EntityId[];
  tags: string[];
}

export async function loadStudyCards(
  filter: StudyFilter, 
  source: StudySessionSource
): Promise<Card[]> {
  const { deckIds, tags } = filter;
  
  let collection = db.cards.toCollection();
  
  if (deckIds.length > 0) {
      collection = db.cards.where('deckId').anyOf(deckIds);
  }

  let cards = await collection.toArray();
  
  if (tags.length > 0) {
      cards = cards.filter(card => tags.some(tag => card.tags.includes(tag)));
  }

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
      let logCollection = db.reviewLogs.toCollection();
      if (deckIds.length > 0) {
          logCollection = db.reviewLogs.where('deckId').anyOf(deckIds);
      }
      
      const mistakeLogs = await logCollection
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
