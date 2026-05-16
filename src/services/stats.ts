import { db } from '../db/database';
import type { Card, Deck, ReviewLog } from '../types';
import { startOfTodayIso } from '../utils/date';

export interface StatsOverview {
  reviewedToday: number;
  streak: number;
  dueCount: number;
  totalCards: number;
  successRate: number;
  hardestCards: Array<{ card: Card; misses: number }>;
  weeklyActivity: Array<{ label: string; count: number }>;
  recentLogs: ReviewLog[];
  ratingDistribution: Record<string, number>;
  deckActivity: DeckActivityStats[];
}

export interface DeckStats {
  cardCount: number;
  practicedCards: number;
  correctAnswers: number;
  wrongAnswers: number;
  successRate: number;
  hardCards: number;
  lastReviewedAt?: string;
  ratingDistribution: Record<string, number>;
  weeklyActivity: Array<{ label: string; count: number }>;
  totalRepetitions: number;
}

export interface DeckActivityStats {
  deckId: string;
  deckName: string;
  cardCount: number;
  practicedCards: number;
  answeredCount: number;
  correctAnswers: number;
  wrongAnswers: number;
  successRate: number;
  hardCards: number;
  lastReviewedAt?: string;
}

export async function getStatsOverview(): Promise<StatsOverview> {
  const [decks, cards, logs] = await Promise.all([
    db.decks.toArray(),
    db.cards.toArray(),
    db.reviewLogs.orderBy('reviewedAt').reverse().toArray()
  ]);
  const now = new Date();
  const today = startOfTodayIso();
  const successful = logs.filter((log) => log.rating === 'good' || log.rating === 'easy').length;
  const mistakeCounts = new Map<string, number>();
  const ratingDistribution: Record<string, number> = { again: 0, hard: 0, good: 0, easy: 0 };

  logs.forEach((log) => {
    if (log.rating === 'again' || log.rating === 'hard') {
      mistakeCounts.set(log.cardId, (mistakeCounts.get(log.cardId) ?? 0) + 1);
    }
    ratingDistribution[log.rating] = (ratingDistribution[log.rating] ?? 0) + 1;
  });

  return {
    reviewedToday: logs.filter((log) => log.reviewedAt >= today).length,
    streak: calculateStreak(logs),
    dueCount: cards.filter((card) => new Date(card.dueAt) <= now).length,
    totalCards: cards.length,
    successRate: logs.length === 0 ? 0 : Math.round((successful / logs.length) * 100),
    hardestCards: cards
      .map((card) => ({ card, misses: mistakeCounts.get(card.id) ?? 0 }))
      .filter((item) => item.misses > 0)
      .sort((a, b) => b.misses - a.misses)
      .slice(0, 5),
    weeklyActivity: buildWeeklyActivity(logs),
    recentLogs: logs.slice(0, 8),
    ratingDistribution,
    deckActivity: buildDeckActivityStats(decks, cards, logs)
  };
}

export async function getDeckStats(deckId: string): Promise<DeckStats> {
  const [cards, logs] = await Promise.all([
    db.cards.where('deckId').equals(deckId).toArray(),
    db.reviewLogs.where('deckId').equals(deckId).toArray()
  ]);

  const summary = buildSingleDeckStats(deckId, cards, logs);
  const totalRepetitions = cards.reduce((acc, card) => acc + card.repetitions, 0);
  const ratingDistribution = buildRatingDistribution(logs);

  return {
    cardCount: summary.cardCount,
    practicedCards: summary.practicedCards,
    correctAnswers: summary.correctAnswers,
    wrongAnswers: summary.wrongAnswers,
    successRate: summary.successRate,
    hardCards: summary.hardCards,
    lastReviewedAt: summary.lastReviewedAt,
    ratingDistribution,
    weeklyActivity: buildWeeklyActivity(logs),
    totalRepetitions
  };
}

export function buildDeckActivityStats(decks: Deck[], cards: Card[], logs: ReviewLog[]): DeckActivityStats[] {
  return decks.map((deck) => {
    const deckCards = cards.filter((card) => card.deckId === deck.id);
    const deckLogs = logs.filter((log) => log.deckId === deck.id);
    return {
      deckId: deck.id,
      deckName: deck.name,
      ...buildSingleDeckStats(deck.id, deckCards, deckLogs)
    };
  });
}

function buildSingleDeckStats(deckId: string, cards: Card[], logs: ReviewLog[]): Omit<DeckActivityStats, 'deckId' | 'deckName'> {
  const cardIds = new Set(cards.map((card) => card.id));
  const practicedIds = new Set(logs.map((log) => log.cardId).filter((id) => cardIds.has(id)));
  const correctAnswers = logs.filter((log) => log.rating === 'good' || log.rating === 'easy').length;
  const wrongAnswers = logs.filter((log) => log.rating === 'again' || log.rating === 'hard').length;
  const answeredCount = correctAnswers + wrongAnswers;
  const lastReviewedAt = logs.map((log) => log.reviewedAt).sort().at(-1);

  return {
    cardCount: cards.length,
    practicedCards: practicedIds.size,
    answeredCount,
    correctAnswers,
    wrongAnswers,
    successRate: answeredCount === 0 ? 0 : Math.round((correctAnswers / answeredCount) * 100),
    hardCards: cards.filter((card) => card.deckId === deckId && (card.lapses > 0 || card.ease <= 1.8)).length,
    lastReviewedAt
  };
}

function buildRatingDistribution(logs: ReviewLog[]): Record<string, number> {
  const ratingDistribution: Record<string, number> = { again: 0, hard: 0, good: 0, easy: 0 };
  logs.forEach((log) => {
    ratingDistribution[log.rating] = (ratingDistribution[log.rating] ?? 0) + 1;
  });
  return ratingDistribution;
}

function calculateStreak(logs: ReviewLog[]): number {
  const days = new Set(logs.map((log) => log.reviewedAt.slice(0, 10)));
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function buildWeeklyActivity(logs: ReviewLog[]): Array<{ label: string; count: number }> {
  const formatter = new Intl.DateTimeFormat('cs-CZ', { weekday: 'short' });
  return Array.from({ length: 7 }, (_, offset) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - offset));
    const key = date.toISOString().slice(0, 10);
    return {
      label: formatter.format(date),
      count: logs.filter((log) => log.reviewedAt.slice(0, 10) === key).length
    };
  });
}
