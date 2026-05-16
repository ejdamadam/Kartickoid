import type { Card, EntityId, StudySessionSource } from '../types';
import { db } from '../db/database';
import { takeRandom } from '../utils/random';

export interface StudyFilter {
  deckIds: EntityId[];
  tags: string[];
}

export interface StudySessionOptions {
  limit?: number;
  order?: 'default' | 'random';
}

export async function loadStudyCards(
  filter: StudyFilter, 
  source: StudySessionSource,
  options: StudySessionOptions = {}
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

  let selected: Card[];

  switch (source) {
    case 'all':
      selected = cards.sort(sortByDueThenUpdated);
      break;
    case 'lapsed':
      selected = cards
        .filter((card) => card.lapses > 0 || card.ease <= 1.8)
        .sort(sortByDueThenUpdated);
      break;
    case 'random':
      selected = takeRandom(cards, Math.min(cards.length, options.limit || 20));
      break;
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
      selected = cards.filter((card) => mistakeIds.has(card.id)).sort(sortByDueThenUpdated);
      break;
    }
    case 'new':
      selected = cards
        .filter((card) => card.repetitions === 0 && card.lapses === 0)
        .sort(sortByDueThenUpdated);
      break;
    case 'due':
    default:
      selected = cards
        .filter((card) => new Date(card.dueAt) <= now)
        .sort(sortByDueThenUpdated);
      break;
  }

  const ordered = options.order === 'random' && source !== 'random'
    ? takeRandom(selected, selected.length)
    : selected;

  return options.limit && options.limit > 0 ? ordered.slice(0, options.limit) : ordered;
}

export function sortByDueThenUpdated(a: Card, b: Card): number {
  const due = a.dueAt.localeCompare(b.dueAt);
  if (due !== 0) return due;
  return b.updatedAt.localeCompare(a.updatedAt);
}
