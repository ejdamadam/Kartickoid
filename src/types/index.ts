export type EntityId = string;

export type CardSide = 'front' | 'back';

export type Rating = 'again' | 'hard' | 'good' | 'easy';

export type StudyMode = 'learning' | 'test' | 'writing';

export type StudySessionSource = 'due' | 'all' | 'lapsed' | 'mistakes' | 'new' | 'random';

export interface Deck {
  id: EntityId;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface Card {
  id: EntityId;
  deckId: EntityId;
  frontText: string;
  backText: string;
  imageIds: EntityId[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
  dueAt: string;
  intervalDays: number;
  ease: number;
  repetitions: number;
  lapses: number;
}

export type MediaType = 'image' | 'audio';

export interface Media {
  id: EntityId;
  cardId: EntityId;
  deckId: EntityId;
  side: CardSide;
  blob: Blob;
  mimeType: string;
  type: MediaType;
  name: string;
  size?: number;
  durationSeconds?: number;
  createdAt: string;
}

export interface PendingCardMedia {
  id: EntityId;
  side: CardSide;
  blob: Blob;
  mimeType: string;
  type: MediaType;
  name: string;
  size?: number;
  durationSeconds?: number;
  createdAt: string;
}

export interface ReviewLog {
  id: EntityId;
  cardId: EntityId;
  deckId: EntityId;
  rating: Rating;
  reviewedAt: string;
}

export interface AppMeta {
  key: string;
  value: unknown;
  updatedAt: string;
}

export interface BackupHistoryEntry {
  id: EntityId;
  name: string;
  reason: 'manual' | 'share' | 'reset-safety';
  format?: 'json' | 'zip';
  blob: Blob;
  size: number;
  appVersion: string;
  schemaVersion: number;
  createdAt: string;
}

export interface DeckSummary {
  deck: Deck;
  cardCount: number;
  dueCount: number;
  newCount: number;
  reviewedToday: number;
  lastReviewedAt?: string;
}

export interface ExportMedia {
  id: EntityId;
  cardId: EntityId;
  deckId: EntityId;
  side: CardSide;
  dataUrl?: string;
  filePath?: string;
  mimeType: string;
  name: string;
  size?: number;
  durationSeconds?: number;
  createdAt: string;
}

export interface BackupFile {
  version?: 1 | 2 | 3;
  schemaVersion?: 1 | 2 | 3;
  appVersion?: string;
  exportDate?: string;
  exportId?: string;
  mediaIncludesBlobs?: boolean;
  mediaStorage?: 'json-base64' | 'zip-files';
  exportedAt: string;
  decks: Deck[];
  cards: Card[];
  media: ExportMedia[];
  reviewLogs: ReviewLog[];
  appMeta?: AppMeta[];
  source?: 'kartickoid' | 'kartoteka';
  schemaName?: 'kartickoid-backup' | 'kartoteka-backup';
}

export interface ParsedImportCard {
  frontText: string;
  backText: string;
  tags: string[];
  image?: string;
  errors: string[];
}

export interface ImportPreview {
  cards: ParsedImportCard[];
  skippedRows: number;
  warnings: string[];
}
