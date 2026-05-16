import { APP_VERSION } from '../app/version';
import { db } from '../db/database';
import type { AppMeta, BackupFile, BackupHistoryEntry, Card, Deck, EntityId, ExportMedia, Media, ReviewLog } from '../types';
import { createId } from '../utils/id';
import { nowIso } from '../utils/date';
import JSZip from 'jszip';

export type ImportMode = 'soft' | 'hard' | 'reset';

export interface ImportBackupOptions {
  mode?: ImportMode;
  importSettings?: boolean;
  createSafetySnapshot?: boolean;
}

export interface ImportBackupSummary {
  mode: ImportMode;
  decksAdded: number;
  decksUpdated: number;
  decksSkipped: number;
  cardsAdded: number;
  cardsUpdated: number;
  cardsSkipped: number;
  mediaAdded: number;
  mediaUpdated: number;
  mediaSkipped: number;
  reviewLogsAdded: number;
  reviewLogsUpdated: number;
  reviewLogsSkipped: number;
  settingsAdded: number;
  settingsUpdated: number;
  settingsSkipped: number;
  conflicts: number;
  duplicates: number;
  regeneratedIds: number;
  safetySnapshotCreated: boolean;
  settingsImported: boolean;
}

type ParsedBackup = Required<Pick<BackupFile, 'schemaVersion' | 'decks' | 'cards' | 'media' | 'reviewLogs'>> & {
  appMeta: AppMeta[];
  exportedAt: string;
};

const CURRENT_SCHEMA_VERSION = 3;
const SUPPORTED_SCHEMA_VERSIONS = new Set([1, 2, 3]);
const MAX_BACKUP_HISTORY = 8;

export async function exportDatabase(): Promise<BackupFile> {
  const [decks, cards, media, reviewLogs, appMeta] = await Promise.all([
    db.decks.toArray(),
    db.cards.toArray(),
    db.media.toArray(),
    db.reviewLogs.toArray(),
    db.appMeta.toArray()
  ]);

  const exportedMedia: ExportMedia[] = await Promise.all(media.map(async (item) => ({
    id: item.id,
    cardId: item.cardId,
    deckId: item.deckId,
    side: item.side,
    dataUrl: await blobToDataUrl(item.blob),
    mimeType: item.mimeType,
    name: item.name,
    size: item.size,
    durationSeconds: item.durationSeconds,
    createdAt: item.createdAt
  })));

  const exportedAt = nowIso();

  return {
    version: CURRENT_SCHEMA_VERSION,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    schemaName: 'kartickoid-backup',
    source: 'kartickoid',
    appVersion: APP_VERSION,
    exportDate: exportedAt,
    exportId: createId('export'),
    exportedAt,
    mediaIncludesBlobs: true,
    mediaStorage: 'json-base64',
    decks,
    cards,
    media: exportedMedia,
    reviewLogs,
    appMeta
  };
}

export async function downloadBackup(): Promise<void> {
  const backup = await exportDatabase();
  const entry = await createBackupHistoryEntry(backup, 'manual');
  await downloadBlobFile(entry.blob, entry.name);
}

export async function downloadBackupZip(): Promise<void> {
  const { blob, name } = await createBackupZipBlob();
  const entry = await createBackupHistoryBlobEntry(blob, name, 'manual', 'zip');
  await downloadBlobFile(entry.blob, entry.name);
}

export async function shareBackup(): Promise<'shared' | 'downloaded'> {
  const backup = await exportDatabase();
  const entry = await createBackupHistoryEntry(backup, 'share');
  const blob = entry.blob;
  const file = new File([blob], entry.name, { type: 'application/json' });

  if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
    await navigator.share({
      title: 'Kartičkoid JSON záloha',
      text: 'JSON záloha aplikace Kartičkoid.',
      files: [file]
    });
    return 'shared';
  }

  await downloadBlobFile(entry.blob, entry.name);
  return 'downloaded';
}

export async function downloadDeckBackup(deckId: EntityId, deckName: string): Promise<void> {
  const [deck, cards, media, reviewLogs, appMeta] = await Promise.all([
    db.decks.get(deckId),
    db.cards.where('deckId').equals(deckId).toArray(),
    db.media.toArray(),
    db.reviewLogs.where('deckId').equals(deckId).toArray(),
    db.appMeta.toArray()
  ]);
  if (!deck) throw new Error('Balíček nebyl nalezen.');

  const cardIds = new Set(cards.map((card) => card.id));
  const exportedMedia: ExportMedia[] = await Promise.all(media
    .filter((item) => cardIds.has(item.cardId))
    .map(async (item) => ({
      id: item.id,
      cardId: item.cardId,
      deckId: item.deckId,
      side: item.side,
      dataUrl: await blobToDataUrl(item.blob),
      mimeType: item.mimeType,
      name: item.name,
      size: item.size,
      durationSeconds: item.durationSeconds,
      createdAt: item.createdAt
    })));

  const exportedAt = nowIso();
  const backup: BackupFile = {
    version: CURRENT_SCHEMA_VERSION,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    schemaName: 'kartickoid-backup',
    source: 'kartickoid',
    appVersion: APP_VERSION,
    exportDate: exportedAt,
    exportId: createId('export'),
    exportedAt,
    mediaIncludesBlobs: true,
    mediaStorage: 'json-base64',
    decks: [deck],
    cards,
    media: exportedMedia,
    reviewLogs,
    appMeta
  };

  await downloadBackupFile(backup, `${deckName.toLowerCase().replace(/[^a-z0-9]+/gi, '-') || 'balicek'}-${new Date().toISOString().slice(0, 10)}.json`);
}

export async function getBackupHistory(): Promise<BackupHistoryEntry[]> {
  return db.backups.orderBy('createdAt').reverse().toArray();
}

export async function downloadBackupHistoryEntry(id: EntityId): Promise<void> {
  const entry = await db.backups.get(id);
  if (!entry) throw new Error('Záloha v historii nebyla nalezena.');
  await downloadBlobFile(entry.blob, entry.name);
}

export async function deleteBackupHistoryEntry(id: EntityId): Promise<void> {
  await db.backups.delete(id);
}

export async function restoreBackupHistoryEntry(id: EntityId): Promise<ImportBackupSummary> {
  const entry = await db.backups.get(id);
  if (!entry) throw new Error('Záloha v historii nebyla nalezena.');
  const parsed = await readBackupBlob(entry.blob, entry.name);
  return resetImport(parsed, true);
}

export async function importBackupFile(file: File, options: ImportBackupOptions = {}): Promise<ImportBackupSummary> {
  const mode = options.mode ?? 'hard';
  const parsed = await readBackupFile(file);

  if (mode === 'soft') return softImport(parsed);
  if (mode === 'reset') return resetImport(parsed, options.createSafetySnapshot !== false);
  return hardImport(parsed, Boolean(options.importSettings));
}

export function formatImportSummary(result: ImportBackupSummary): string {
  const modeLabel = result.mode === 'soft' ? 'Soft import' : result.mode === 'hard' ? 'Hard import' : 'Obnova ze zálohy';
  return [
    `${modeLabel} dokončen.`,
    `Sady: +${result.decksAdded}, aktualizováno ${result.decksUpdated}, přeskočeno ${result.decksSkipped}.`,
    `Kartičky: +${result.cardsAdded}, aktualizováno ${result.cardsUpdated}, přeskočeno ${result.cardsSkipped}.`,
    `Média/audio: +${result.mediaAdded}, aktualizováno ${result.mediaUpdated}, přeskočeno ${result.mediaSkipped}.`,
    `Historie/statistiky: +${result.reviewLogsAdded}, přeskočeno ${result.reviewLogsSkipped}.`,
    `Nastavení: +${result.settingsAdded}, aktualizováno ${result.settingsUpdated}, přeskočeno ${result.settingsSkipped}.`,
    `Konflikty: ${result.conflicts}, nalezené duplicity: ${result.duplicates}, přegenerovaná ID: ${result.regeneratedIds}.`,
    result.safetySnapshotCreated ? 'Před obnovou byl stažen bezpečnostní snapshot.' : ''
  ].filter(Boolean).join(' ');
}

async function softImport(parsed: ParsedBackup): Promise<ImportBackupSummary> {
  const summary = createSummary('soft', true);

  await db.transaction('rw', [db.decks, db.cards, db.media, db.reviewLogs, db.appMeta], async () => {
    const [localDecks, localCards, localMedia, localLogs, localMeta] = await Promise.all([
      db.decks.toArray(),
      db.cards.toArray(),
      db.media.toArray(),
      db.reviewLogs.toArray(),
      db.appMeta.toArray()
    ]);

    const deckById = new Map(localDecks.map((deck) => [deck.id, deck]));
    const deckByName = new Map(localDecks.map((deck) => [normalize(deck.name), deck]));
    const cardById = new Map(localCards.map((card) => [card.id, card]));
    const cardByContent = new Map(localCards.map((card) => [cardFallbackKey(card.deckId, card.frontText, card.backText), card]));
    const mediaById = new Map(localMedia.map((item) => [item.id, item]));
    const mediaByFallback = new Map(localMedia.map((item) => [mediaFallbackKey(item), item]));
    const logById = new Map(localLogs.map((log) => [log.id, log]));
    const logByFallback = new Map(localLogs.map((log) => [logFallbackKey(log), log]));
    const metaByKey = new Map(localMeta.map((item) => [item.key, item]));
    const deckMap = new Map<EntityId, EntityId>();
    const cardMap = new Map<EntityId, EntityId>();
    const mediaMap = new Map<EntityId, EntityId>();

    for (const importedDeck of parsed.decks) {
      const existing = deckById.get(importedDeck.id) ?? deckByName.get(normalize(importedDeck.name));
      if (!existing) {
        await db.decks.put(importedDeck);
        deckById.set(importedDeck.id, importedDeck);
        deckByName.set(normalize(importedDeck.name), importedDeck);
        deckMap.set(importedDeck.id, importedDeck.id);
        summary.decksAdded += 1;
        continue;
      }

      deckMap.set(importedDeck.id, existing.id);
      if (existing.id !== importedDeck.id) summary.duplicates += 1;
      if (isNewer(importedDeck.updatedAt, existing.updatedAt)) {
        const nextDeck = { ...importedDeck, id: existing.id };
        await db.decks.put(nextDeck);
        deckById.set(existing.id, nextDeck);
        deckByName.set(normalize(nextDeck.name), nextDeck);
        summary.decksUpdated += 1;
      } else {
        summary.decksSkipped += 1;
      }
    }

    for (const importedCard of parsed.cards) {
      const deckId = deckMap.get(importedCard.deckId);
      if (!deckId) {
        summary.conflicts += 1;
        continue;
      }

      const candidate = { ...importedCard, deckId, tags: importedCard.tags ?? [] };
      const existing = cardById.get(importedCard.id) ?? cardByContent.get(cardFallbackKey(deckId, candidate.frontText, candidate.backText));
      if (!existing) {
        const nextCard = { ...candidate, imageIds: [] };
        await db.cards.put(nextCard);
        cardById.set(nextCard.id, nextCard);
        cardByContent.set(cardFallbackKey(nextCard.deckId, nextCard.frontText, nextCard.backText), nextCard);
        cardMap.set(importedCard.id, nextCard.id);
        summary.cardsAdded += 1;
        continue;
      }

      cardMap.set(importedCard.id, existing.id);
      if (existing.id !== importedCard.id) summary.duplicates += 1;
      if (isNewer(candidate.updatedAt, existing.updatedAt)) {
        const nextCard = { ...candidate, id: existing.id, imageIds: existing.imageIds };
        await db.cards.put(nextCard);
        cardById.set(existing.id, nextCard);
        cardByContent.set(cardFallbackKey(nextCard.deckId, nextCard.frontText, nextCard.backText), nextCard);
        summary.cardsUpdated += 1;
      } else {
        summary.cardsSkipped += 1;
      }
    }

    for (const importedMedia of parsed.media) {
      const deckId = deckMap.get(importedMedia.deckId);
      const cardId = cardMap.get(importedMedia.cardId);
      if (!deckId || !cardId) {
        summary.conflicts += 1;
        continue;
      }

      const nextMedia = toMedia(importedMedia, cardId, deckId, importedMedia.id);
      const existing = mediaById.get(importedMedia.id) ?? mediaByFallback.get(mediaFallbackKey(nextMedia));
      if (!existing) {
        await db.media.put(nextMedia);
        mediaById.set(nextMedia.id, nextMedia);
        mediaByFallback.set(mediaFallbackKey(nextMedia), nextMedia);
        mediaMap.set(importedMedia.id, nextMedia.id);
        summary.mediaAdded += 1;
        continue;
      }

      mediaMap.set(importedMedia.id, existing.id);
      if (existing.id !== importedMedia.id) summary.duplicates += 1;
      if (isNewer(nextMedia.createdAt, existing.createdAt)) {
        const updatedMedia = { ...nextMedia, id: existing.id };
        await db.media.put(updatedMedia);
        mediaById.set(existing.id, updatedMedia);
        mediaByFallback.set(mediaFallbackKey(updatedMedia), updatedMedia);
        summary.mediaUpdated += 1;
      } else {
        summary.mediaSkipped += 1;
      }
    }

    for (const importedCard of parsed.cards) {
      const localCardId = cardMap.get(importedCard.id);
      if (!localCardId) continue;
      const existing = await db.cards.get(localCardId);
      if (!existing) continue;
      const importedMediaIds = parsed.media
        .filter((item) => item.cardId === importedCard.id)
        .map((item) => mediaMap.get(item.id))
        .filter(Boolean) as string[];
      const mappedImageIds = importedCard.imageIds.map((id) => mediaMap.get(id)).filter(Boolean) as string[];
      const imageIds = Array.from(new Set([...existing.imageIds, ...mappedImageIds, ...importedMediaIds]));
      await db.cards.update(localCardId, { imageIds });
    }

    for (const importedLog of parsed.reviewLogs) {
      const deckId = deckMap.get(importedLog.deckId);
      const cardId = cardMap.get(importedLog.cardId);
      if (!deckId || !cardId) {
        summary.conflicts += 1;
        continue;
      }

      const nextLog: ReviewLog = { ...importedLog, deckId, cardId };
      const existing = logById.get(importedLog.id) ?? logByFallback.get(logFallbackKey(nextLog));
      if (!existing) {
        await db.reviewLogs.put(nextLog);
        logById.set(nextLog.id, nextLog);
        logByFallback.set(logFallbackKey(nextLog), nextLog);
        summary.reviewLogsAdded += 1;
      } else {
        if (existing.id !== importedLog.id) summary.duplicates += 1;
        summary.reviewLogsSkipped += 1;
      }
    }

    for (const importedMeta of parsed.appMeta) {
      const existing = metaByKey.get(importedMeta.key);
      if (!existing) {
        await db.appMeta.put(importedMeta);
        metaByKey.set(importedMeta.key, importedMeta);
        summary.settingsAdded += 1;
      } else if (isNewer(importedMeta.updatedAt, existing.updatedAt)) {
        await db.appMeta.put(importedMeta);
        metaByKey.set(importedMeta.key, importedMeta);
        summary.settingsUpdated += 1;
      } else {
        summary.settingsSkipped += 1;
      }
    }
  });

  return summary;
}

async function hardImport(parsed: ParsedBackup, importSettings: boolean): Promise<ImportBackupSummary> {
  const summary = createSummary('hard', importSettings);

  await db.transaction('rw', [db.decks, db.cards, db.media, db.reviewLogs, db.appMeta], async () => {
    const [existingDeckIds, existingCardIds, existingMediaIds, existingLogIds] = await Promise.all([
      db.decks.toCollection().primaryKeys(),
      db.cards.toCollection().primaryKeys(),
      db.media.toCollection().primaryKeys(),
      db.reviewLogs.toCollection().primaryKeys()
    ]);

    const deckMap = makeIdMap(parsed.decks.map((deck) => deck.id), new Set(existingDeckIds as string[]), 'deck', summary);
    const cardMap = makeIdMap(parsed.cards.map((card) => card.id), new Set(existingCardIds as string[]), 'card', summary);
    const mediaMap = makeIdMap(parsed.media.map((item) => item.id), new Set(existingMediaIds as string[]), 'media', summary);
    const logMap = makeIdMap(parsed.reviewLogs.map((log) => log.id), new Set(existingLogIds as string[]), 'log', summary);

    const decks = parsed.decks.map((deck) => ({
      ...deck,
      id: deckMap.get(deck.id) ?? deck.id,
      updatedAt: deck.updatedAt || nowIso()
    }));

    const cards = parsed.cards.map((card) => ({
      ...card,
      id: cardMap.get(card.id) ?? card.id,
      deckId: deckMap.get(card.deckId) ?? card.deckId,
      imageIds: card.imageIds.map((id) => mediaMap.get(id) ?? id),
      tags: card.tags ?? [],
      updatedAt: card.updatedAt || nowIso()
    }));

    const media = parsed.media.map((item) => toMedia(
      item,
      cardMap.get(item.cardId) ?? item.cardId,
      deckMap.get(item.deckId) ?? item.deckId,
      mediaMap.get(item.id) ?? item.id
    ));

    const reviewLogs = parsed.reviewLogs.map((log) => ({
      ...log,
      id: logMap.get(log.id) ?? log.id,
      cardId: cardMap.get(log.cardId) ?? log.cardId,
      deckId: deckMap.get(log.deckId) ?? log.deckId
    }));

    await db.decks.bulkAdd(decks);
    await db.cards.bulkAdd(cards);
    await db.media.bulkAdd(media);
    await db.reviewLogs.bulkAdd(reviewLogs);

    summary.decksAdded = decks.length;
    summary.cardsAdded = cards.length;
    summary.mediaAdded = media.length;
    summary.reviewLogsAdded = reviewLogs.length;

    if (importSettings) {
      await db.appMeta.bulkPut(parsed.appMeta);
      summary.settingsAdded = parsed.appMeta.length;
    } else {
      summary.settingsSkipped = parsed.appMeta.length;
    }
  });

  return summary;
}

async function resetImport(parsed: ParsedBackup, createSafetySnapshot: boolean): Promise<ImportBackupSummary> {
  const summary = createSummary('reset', true);

  if (createSafetySnapshot) {
    const backup = await exportDatabase();
    const entry = await createBackupHistoryEntry(backup, 'reset-safety');
    await downloadBlobFile(entry.blob, entry.name);
    summary.safetySnapshotCreated = true;
  }

  const decks = parsed.decks.map((deck) => ({ ...deck, updatedAt: deck.updatedAt || nowIso() }));
  const cards = parsed.cards.map((card) => ({ ...card, imageIds: card.imageIds ?? [], tags: card.tags ?? [], updatedAt: card.updatedAt || nowIso() }));
  const media = parsed.media.map((item) => toMedia(item, item.cardId, item.deckId, item.id));
  const reviewLogs = parsed.reviewLogs.map((log) => ({ ...log }));

  await db.transaction('rw', [db.decks, db.cards, db.media, db.reviewLogs, db.appMeta], async () => {
    await Promise.all([
      db.decks.clear(),
      db.cards.clear(),
      db.media.clear(),
      db.reviewLogs.clear(),
      db.appMeta.clear()
    ]);
    await db.decks.bulkPut(decks);
    await db.cards.bulkPut(cards);
    await db.media.bulkPut(media);
    await db.reviewLogs.bulkPut(reviewLogs);
    await db.appMeta.bulkPut(parsed.appMeta);
  });

  summary.decksAdded = decks.length;
  summary.cardsAdded = cards.length;
  summary.mediaAdded = media.length;
  summary.reviewLogsAdded = reviewLogs.length;
  summary.settingsAdded = parsed.appMeta.length;

  return summary;
}

async function readBackupFile(file: File): Promise<ParsedBackup> {
  return readBackupBlob(file, file.name);
}

async function readBackupBlob(blob: Blob, filename: string): Promise<ParsedBackup> {
  if (isZipFile(filename, blob.type)) {
    return readBackupZip(blob);
  }

  return readBackupText(await blob.text());
}

async function readBackupZip(blob: Blob): Promise<ParsedBackup> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(blob);
  } catch {
    throw new Error('ZIP zálohu se nepodařilo otevřít.');
  }

  const backupEntry = zip.file('backup.json')
    ?? Object.values(zip.files).find((entry) => !entry.dir && entry.name.toLowerCase().endsWith('.json'));
  if (!backupEntry) {
    throw new Error('ZIP záloha neobsahuje soubor backup.json.');
  }

  let backup: BackupFile;
  try {
    backup = JSON.parse(await backupEntry.async('string')) as BackupFile;
  } catch {
    throw new Error('Soubor backup.json v ZIP záloze není platný JSON.');
  }

  const media = await Promise.all((backup.media ?? []).map(async (item) => {
    if (item.dataUrl) return item;
    if (!item.filePath) return item;

    const mediaEntry = zip.file(item.filePath);
    if (!mediaEntry) {
      throw new Error(`ZIP záloha neobsahuje médium ${item.filePath}.`);
    }

    const mediaBlob = await mediaEntry.async('blob');
    return {
      ...item,
      dataUrl: await blobToDataUrl(mediaBlob),
      size: item.size ?? mediaBlob.size
    };
  }));

  return validateBackup({ ...backup, media });
}

function readBackupText(text: string): ParsedBackup {
  let parsed: BackupFile;
  try {
    parsed = JSON.parse(text) as BackupFile;
  } catch {
    throw new Error('Soubor není platný JSON.');
  }

  return validateBackup(parsed);
}

function validateBackup(value: BackupFile): ParsedBackup {
  const schemaVersion = value.schemaVersion ?? value.version;
  if (!schemaVersion || !SUPPORTED_SCHEMA_VERSIONS.has(schemaVersion)) {
    throw new Error('Záloha má nepodporovanou nebo chybějící verzi schématu.');
  }
  if (!Array.isArray(value.decks) || !Array.isArray(value.cards) || !Array.isArray(value.media) || !Array.isArray(value.reviewLogs)) {
    throw new Error('Soubor není platná JSON záloha této aplikace.');
  }

  const deckIds = new Set<string>();
  const cardIds = new Set<string>();
  const mediaIds = new Set<string>();
  const logIds = new Set<string>();
  const decks = value.decks.map((deck) => ({ ...deck, id: deck.id || createId('deck') }));

  decks.forEach((deck) => {
    if (!deck.name || !deck.createdAt || !deck.updatedAt) {
      throw new Error('Záloha obsahuje neplatnou sadu.');
    }
    if (deckIds.has(deck.id)) throw new Error('Záloha obsahuje duplicitní ID sady.');
    deckIds.add(deck.id);
  });

  const cards = value.cards.map((card) => ({
    ...card,
    id: card.id || createId('card'),
    deckId: card.deckId || (decks.length === 1 ? decks[0].id : '')
  }));

  cards.forEach((card) => {
    if (!card.deckId || !deckIds.has(card.deckId)) {
      throw new Error('Záloha obsahuje kartičku bez platné vazby na sadu.');
    }
    if (cardIds.has(card.id)) throw new Error('Záloha obsahuje duplicitní ID kartičky.');
    cardIds.add(card.id);
  });

  const media = value.media.map((item) => ({ ...item, id: item.id || createId('media') }));

  media.forEach((item) => {
    if (!item.cardId || !item.deckId || !item.dataUrl || !item.mimeType) {
      throw new Error('Záloha obsahuje neplatné médium.');
    }
    if (!cardIds.has(item.cardId) || !deckIds.has(item.deckId)) {
      throw new Error('Záloha obsahuje médium bez platné vazby na kartičku nebo sadu.');
    }
    if (mediaIds.has(item.id)) throw new Error('Záloha obsahuje duplicitní ID média.');
    mediaIds.add(item.id);
  });

  cards.forEach((card) => {
    const missingMedia = (card.imageIds ?? []).some((id) => !mediaIds.has(id));
    if (missingMedia) throw new Error('Záloha obsahuje kartičku s odkazem na chybějící médium.');
  });

  const reviewLogs = value.reviewLogs.map((log) => ({ ...log, id: log.id || createId('log') }));

  reviewLogs.forEach((log) => {
    if (!log.cardId || !log.deckId || !log.reviewedAt || !log.rating) {
      throw new Error('Záloha obsahuje neplatný záznam historie učení.');
    }
    if (!cardIds.has(log.cardId) || !deckIds.has(log.deckId)) {
      throw new Error('Záloha obsahuje historii učení bez platné vazby na kartičku nebo sadu.');
    }
    if (logIds.has(log.id)) throw new Error('Záloha obsahuje duplicitní ID záznamu historie.');
    logIds.add(log.id);
  });

  const appMeta = Array.isArray(value.appMeta) ? value.appMeta.filter((item) => item.key && item.updatedAt) : [];

  return {
    schemaVersion: schemaVersion as 1 | 2 | 3,
    exportedAt: value.exportDate ?? value.exportedAt ?? nowIso(),
    decks,
    cards: cards.map((card) => ({ ...card, imageIds: card.imageIds ?? [], tags: card.tags ?? [] })),
    media,
    reviewLogs,
    appMeta
  };
}

function toMedia(item: ExportMedia, cardId: EntityId, deckId: EntityId, id: EntityId): Media {
  if (!item.dataUrl) {
    throw new Error('Záloha obsahuje médium bez dat.');
  }

  return {
    id,
    cardId,
    deckId,
    side: item.side,
    type: item.mimeType.startsWith('audio/') ? 'audio' : 'image',
    blob: dataUrlToBlob(item.dataUrl),
    mimeType: item.mimeType,
    name: item.name,
    size: item.size,
    durationSeconds: item.durationSeconds,
    createdAt: item.createdAt ?? nowIso()
  };
}

function makeIdMap(ids: EntityId[], existing: Set<string>, prefix: string, summary: ImportBackupSummary): Map<EntityId, EntityId> {
  const map = new Map<EntityId, EntityId>();
  const used = new Set(existing);

  ids.forEach((id) => {
    if (!used.has(id)) {
      used.add(id);
      return;
    }

    let nextId = createId(prefix);
    while (used.has(nextId)) nextId = createId(prefix);
    used.add(nextId);
    map.set(id, nextId);
    summary.regeneratedIds += 1;
  });

  return map;
}

function createSummary(mode: ImportMode, settingsImported: boolean): ImportBackupSummary {
  return {
    mode,
    decksAdded: 0,
    decksUpdated: 0,
    decksSkipped: 0,
    cardsAdded: 0,
    cardsUpdated: 0,
    cardsSkipped: 0,
    mediaAdded: 0,
    mediaUpdated: 0,
    mediaSkipped: 0,
    reviewLogsAdded: 0,
    reviewLogsUpdated: 0,
    reviewLogsSkipped: 0,
    settingsAdded: 0,
    settingsUpdated: 0,
    settingsSkipped: 0,
    conflicts: 0,
    duplicates: 0,
    regeneratedIds: 0,
    safetySnapshotCreated: false,
    settingsImported
  };
}

function normalize(value: string): string {
  return stripHtml(value).normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, ' ');
}

function cardFallbackKey(deckId: string, frontText: string, backText: string): string {
  return `${deckId}::${normalize(frontText)}::${normalize(backText)}`;
}

function mediaFallbackKey(media: Pick<Media, 'cardId' | 'side' | 'name' | 'mimeType' | 'size'>): string {
  return `${media.cardId}::${media.side}::${normalize(media.name)}::${media.mimeType}::${media.size ?? ''}`;
}

function logFallbackKey(log: ReviewLog): string {
  return `${log.cardId}::${log.deckId}::${log.reviewedAt}::${log.rating}`;
}

function isNewer(imported?: string, local?: string): boolean {
  if (!imported) return false;
  if (!local) return true;
  const importedTime = Date.parse(imported);
  const localTime = Date.parse(local);
  return Number.isFinite(importedTime) && Number.isFinite(localTime) && importedTime > localTime;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Nepodařilo se exportovat médium.'));
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mimeMatch = header.match(/data:(.*?);base64/);
  const mimeType = mimeMatch?.[1] ?? 'application/octet-stream';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Blob([bytes], { type: mimeType });
}

async function downloadBackupFile(backup: BackupFile, filename: string): Promise<void> {
  await downloadBlobFile(backupToBlob(backup), filename);
}

async function downloadBlobFile(blob: Blob, filename: string): Promise<void> {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function backupToBlob(backup: BackupFile): Blob {
  return new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
}

async function createBackupHistoryEntry(backup: BackupFile, reason: BackupHistoryEntry['reason']): Promise<BackupHistoryEntry> {
  const createdAt = nowIso();
  const name = `kartickoid-zaloha-${createdAt.slice(0, 10)}-${createdAt.slice(11, 19).replace(/:/g, '-')}.json`;
  const blob = backupToBlob(backup);
  return createBackupHistoryBlobEntry(blob, name, reason, 'json', createdAt);
}

async function createBackupHistoryBlobEntry(
  blob: Blob,
  name: string,
  reason: BackupHistoryEntry['reason'],
  format: NonNullable<BackupHistoryEntry['format']>,
  createdAt = nowIso()
): Promise<BackupHistoryEntry> {
  const entry: BackupHistoryEntry = {
    id: createId('backup'),
    name,
    reason,
    format,
    blob,
    size: blob.size,
    appVersion: APP_VERSION,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt
  };

  await db.backups.put(entry);
  await trimBackupHistory();
  return entry;
}

async function createBackupZipBlob(): Promise<{ blob: Blob; name: string }> {
  const backup = await exportDatabase();
  const zip = new JSZip();

  await Promise.all(backup.media.map(async (item) => {
    if (!item.dataUrl) return;
    const mediaBlob = dataUrlToBlob(item.dataUrl);
    const filePath = `media/${mediaFileName(item)}`;
    zip.file(filePath, mediaBlob);
    item.filePath = filePath;
    delete item.dataUrl;
  }));

  backup.mediaIncludesBlobs = false;
  backup.mediaStorage = 'zip-files';
  zip.file('backup.json', JSON.stringify(backup, null, 2));

  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/zip' });
  const createdAt = nowIso();
  return {
    blob,
    name: `kartickoid-zaloha-${createdAt.slice(0, 10)}-${createdAt.slice(11, 19).replace(/:/g, '-')}.zip`
  };
}

function isZipFile(filename: string, mimeType: string): boolean {
  const lowerName = filename.toLowerCase();
  return lowerName.endsWith('.zip') || mimeType === 'application/zip' || mimeType === 'application/x-zip-compressed';
}

function mediaFileName(item: ExportMedia): string {
  const safeName = (item.name || 'media')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80);
  const hasExtension = /\.[a-z0-9]{2,5}$/i.test(safeName);
  const extension = hasExtension ? '' : extensionForMime(item.mimeType);
  return `${item.id}-${safeName || 'media'}${extension}`;
}

function extensionForMime(mimeType: string): string {
  if (mimeType.includes('mpeg')) return '.mp3';
  if (mimeType.includes('wav')) return '.wav';
  if (mimeType.includes('ogg')) return '.ogg';
  if (mimeType.includes('webm')) return '.webm';
  if (mimeType.includes('mp4') || mimeType.includes('aac')) return '.m4a';
  if (mimeType.includes('png')) return '.png';
  if (mimeType.includes('webp')) return '.webp';
  if (mimeType.includes('gif')) return '.gif';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return '.jpg';
  return '.bin';
}

async function trimBackupHistory(): Promise<void> {
  const backups = await db.backups.orderBy('createdAt').reverse().toArray();
  const expired = backups.slice(MAX_BACKUP_HISTORY);
  if (expired.length > 0) {
    await db.backups.bulkDelete(expired.map((entry) => entry.id));
  }
}
