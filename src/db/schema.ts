import type { AppMeta, Card, Deck, Media, ReviewLog } from '../types';

export type DeckRecord = Deck;
export type CardRecord = Card;
export type MediaRecord = Media;
export type ReviewLogRecord = ReviewLog;
export type AppMetaRecord = AppMeta;

export const DB_NAME = 'local-flashcards-pwa';
export const DB_VERSION = 2;
