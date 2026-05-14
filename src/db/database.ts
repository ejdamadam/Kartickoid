import Dexie, { type Table } from 'dexie';
import type { AppMeta, Card, Deck, DeckSummary, EntityId, Media, ReviewLog } from '../types';
import { DB_NAME, DB_VERSION } from './schema';
import { createId } from '../utils/id';
import { nowIso, startOfTodayIso } from '../utils/date';

export class FlashcardDatabase extends Dexie {
  decks!: Table<Deck, EntityId>;
  cards!: Table<Card, EntityId>;
  media!: Table<Media, EntityId>;
  reviewLogs!: Table<ReviewLog, EntityId>;
  appMeta!: Table<AppMeta, string>;

  constructor() {
    super(DB_NAME);

    this.version(1).stores({
      decks: 'id, updatedAt',
      cards: 'id, deckId, dueAt, updatedAt, *tags',
      media: 'id, cardId',
      reviewLogs: 'id, cardId, deckId, reviewedAt',
      appMeta: 'key'
    });

    this.version(DB_VERSION).stores({
      decks: 'id, updatedAt',
      cards: 'id, deckId, dueAt, updatedAt, *tags',
      media: 'id, cardId',
      reviewLogs: 'id, cardId, deckId, reviewedAt',
      appMeta: 'key'
    }).upgrade(async (transaction) => {
      await transaction.table('appMeta').put({
        key: 'schemaVersion',
        value: DB_VERSION,
        updatedAt: nowIso()
      });
    });
  }
}

export const db = new FlashcardDatabase();

export function createDeckInput(name: string, description: string): Deck {
  const timestamp = nowIso();
  return {
    id: createId('deck'),
    name: name.trim(),
    description: description.trim(),
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createCardInput(deckId: EntityId, frontText: string, backText: string, tags: string[]): Card {
  const timestamp = nowIso();
  return {
    id: createId('card'),
    deckId,
    frontText: frontText.trim(),
    backText: backText.trim(),
    imageIds: [],
    tags,
    createdAt: timestamp,
    updatedAt: timestamp,
    dueAt: timestamp,
    intervalDays: 0,
    ease: 2.5,
    repetitions: 0,
    lapses: 0
  };
}

export async function getDeckSummaries(): Promise<DeckSummary[]> {
  const [decks, cards, logs] = await Promise.all([
    db.decks.orderBy('updatedAt').reverse().toArray(),
    db.cards.toArray(),
    db.reviewLogs.toArray()
  ]);
  const now = new Date();
  const today = startOfTodayIso();

  return decks.map((deck) => {
    const deckCards = cards.filter((card) => card.deckId === deck.id);
    const deckLogs = logs.filter((log) => log.deckId === deck.id);
    const lastReviewedAt = deckLogs
      .map((log) => log.reviewedAt)
      .sort()
      .at(-1);

    return {
      deck,
      cardCount: deckCards.length,
      dueCount: deckCards.filter((card) => new Date(card.dueAt) <= now).length,
      newCount: deckCards.filter((card) => card.repetitions === 0 && card.lapses === 0).length,
      reviewedToday: deckLogs.filter((log) => log.reviewedAt >= today).length,
      lastReviewedAt
    };
  });
}

export async function deleteDeckCascade(deckId: EntityId): Promise<void> {
  const cards = await db.cards.where('deckId').equals(deckId).toArray();
  const cardIds = cards.map((card) => card.id);

  await db.transaction('rw', db.decks, db.cards, db.media, db.reviewLogs, async () => {
    if (cardIds.length > 0) {
      await db.media.where('cardId').anyOf(cardIds).delete();
    }
    await db.reviewLogs.where('deckId').equals(deckId).delete();
    await db.cards.where('deckId').equals(deckId).delete();
    await db.decks.delete(deckId);
  });
}

export async function deleteCardCascade(cardId: EntityId): Promise<void> {
  await db.transaction('rw', db.cards, db.media, db.reviewLogs, async () => {
    await db.media.where('cardId').equals(cardId).delete();
    await db.reviewLogs.where('cardId').equals(cardId).delete();
    await db.cards.delete(cardId);
  });
}

export async function addMediaToCard(media: Media): Promise<void> {
  await db.transaction('rw', db.cards, db.media, async () => {
    await db.media.put(media);
    const card = await db.cards.get(media.cardId);
    if (!card) throw new Error('Kartička už neexistuje.');
    await db.cards.update(card.id, {
      imageIds: Array.from(new Set([...card.imageIds, media.id])),
      updatedAt: nowIso()
    });
  });
}

export async function removeMediaFromCard(mediaId: EntityId): Promise<void> {
  await db.transaction('rw', db.cards, db.media, async () => {
    const media = await db.media.get(mediaId);
    if (!media) return;
    const card = await db.cards.get(media.cardId);
    if (card) {
      await db.cards.update(card.id, {
        imageIds: card.imageIds.filter((id) => id !== mediaId),
        updatedAt: nowIso()
      });
    }
    await db.media.delete(mediaId);
  });
}
