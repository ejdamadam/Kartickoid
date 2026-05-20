import type { AppMeta, BackupHistoryEntry, Card, Deck, DeckGroup, Media, ReviewLog } from '../types';

export type DeckRecord = Deck;
export type DeckGroupRecord = DeckGroup;
export type CardRecord = Card;
export type MediaRecord = Media;
export type ReviewLogRecord = ReviewLog;
export type AppMetaRecord = AppMeta;
export type BackupHistoryRecord = BackupHistoryEntry;

export const DB_NAME = 'local-flashcards-pwa';
export const DB_VERSION = 4;
