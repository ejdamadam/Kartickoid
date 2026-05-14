import type { Card, Rating } from '../types';
import { nowIso } from '../utils/date';

const DAY_MS = 24 * 60 * 60 * 1000;
const TEN_MINUTES_MS = 10 * 60 * 1000;

export function scheduleCard(card: Card, rating: Rating, now = new Date()): Card {
  let intervalDays = card.intervalDays;
  let ease = card.ease;
  let repetitions = card.repetitions;
  let lapses = card.lapses;
  let dueAt: Date;

  switch (rating) {
    case 'again':
      repetitions = 0;
      intervalDays = 0;
      lapses += 1;
      ease = Math.max(1.3, ease - 0.2);
      dueAt = new Date(now.getTime() + TEN_MINUTES_MS);
      break;
    case 'hard':
      intervalDays = Math.max(1, Math.round(intervalDays * 1.2));
      ease = Math.max(1.3, ease - 0.15);
      repetitions += 1;
      dueAt = new Date(now.getTime() + intervalDays * DAY_MS);
      break;
    case 'good':
      if (repetitions === 0) intervalDays = 1;
      else if (repetitions === 1) intervalDays = 3;
      else intervalDays = Math.max(1, Math.round(intervalDays * ease));
      repetitions += 1;
      dueAt = new Date(now.getTime() + intervalDays * DAY_MS);
      break;
    case 'easy':
      if (repetitions === 0) intervalDays = 4;
      else intervalDays = Math.max(1, Math.round(intervalDays * ease * 1.3));
      ease += 0.15;
      repetitions += 1;
      dueAt = new Date(now.getTime() + intervalDays * DAY_MS);
      break;
    default:
      dueAt = now;
  }

  return {
    ...card,
    intervalDays,
    ease: Number(ease.toFixed(2)),
    repetitions,
    lapses,
    dueAt: dueAt.toISOString(),
    updatedAt: nowIso()
  };
}

export const ratingLabels: Record<Rating, string> = {
  again: 'Znovu',
  hard: 'Těžké',
  good: 'Dobré',
  easy: 'Snadné'
};
