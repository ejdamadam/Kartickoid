import { db } from '../db/database';
import type { BackupFile, Card, Deck, EntityId, ExportMedia, Media, ReviewLog } from '../types';
import { createId } from '../utils/id';
import { nowIso } from '../utils/date';

export async function exportDatabase(): Promise<BackupFile> {
  const [decks, cards, media, reviewLogs] = await Promise.all([
    db.decks.toArray(),
    db.cards.toArray(),
    db.media.toArray(),
    db.reviewLogs.toArray()
  ]);

  const exportedMedia: ExportMedia[] = await Promise.all(media.map(async (item) => ({
    id: item.id,
    cardId: item.cardId,
    deckId: item.deckId,
    side: item.side,
    dataUrl: await blobToDataUrl(item.blob),
    mimeType: item.mimeType,
    name: item.name,
    createdAt: item.createdAt
  })));

  return {
    version: 2,
    schemaName: 'kartickoid-backup',
    source: 'kartickoid',
    exportedAt: nowIso(),
    decks,
    cards,
    media: exportedMedia,
    reviewLogs,
    appMeta: await db.appMeta.toArray()
  };
}

export async function downloadBackup(): Promise<void> {
  const backup = await exportDatabase();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `kartickoid-zaloha-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function downloadDeckBackup(deckId: EntityId, deckName: string): Promise<void> {
  const [deck, cards, media, reviewLogs] = await Promise.all([
    db.decks.get(deckId),
    db.cards.where('deckId').equals(deckId).toArray(),
    db.media.toArray(),
    db.reviewLogs.where('deckId').equals(deckId).toArray()
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
      createdAt: item.createdAt
    })));

  const backup: BackupFile = {
    version: 2,
    schemaName: 'kartickoid-backup',
    source: 'kartickoid',
    exportedAt: nowIso(),
    decks: [deck],
    cards,
    media: exportedMedia,
    reviewLogs
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${deckName.toLowerCase().replace(/[^a-z0-9]+/gi, '-') || 'balicek'}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function importBackupFile(file: File): Promise<{ decks: number; cards: number; media: number; reviewLogs: number }> {
  const text = await file.text();
  const parsed = JSON.parse(text) as BackupFile;
  validateBackup(parsed);

  const [existingDeckIds, existingCardIds, existingMediaIds, existingLogIds] = await Promise.all([
    db.decks.toCollection().primaryKeys(),
    db.cards.toCollection().primaryKeys(),
    db.media.toCollection().primaryKeys(),
    db.reviewLogs.toCollection().primaryKeys()
  ]);

  const deckMap = makeIdMap(parsed.decks.map((deck) => deck.id), new Set(existingDeckIds as string[]), 'deck');
  const cardMap = makeIdMap(parsed.cards.map((card) => card.id), new Set(existingCardIds as string[]), 'card');
  const mediaMap = makeIdMap(parsed.media.map((item) => item.id), new Set(existingMediaIds as string[]), 'media');
  const logMap = makeIdMap(parsed.reviewLogs.map((log) => log.id), new Set(existingLogIds as string[]), 'log');

  const decks: Deck[] = parsed.decks.map((deck) => ({
    ...deck,
    id: deckMap.get(deck.id) ?? deck.id,
    updatedAt: deck.updatedAt || nowIso()
  }));

  const cards: Card[] = parsed.cards.map((card) => ({
    ...card,
    id: cardMap.get(card.id) ?? card.id,
    deckId: deckMap.get(card.deckId) ?? card.deckId,
    imageIds: card.imageIds.map((id) => mediaMap.get(id) ?? id),
    tags: card.tags ?? [],
    updatedAt: card.updatedAt || nowIso()
  }));

  const media: Media[] = await Promise.all(parsed.media.map(async (item) => ({
    id: mediaMap.get(item.id) ?? item.id,
    cardId: cardMap.get(item.cardId) ?? item.cardId,
    deckId: deckMap.get(item.deckId) ?? item.deckId,
    side: item.side,
    type: item.mimeType.startsWith('audio/') ? 'audio' : 'image',
    blob: dataUrlToBlob(item.dataUrl),
    mimeType: item.mimeType,
    name: item.name,
    createdAt: item.createdAt ?? nowIso()
  })));

  const reviewLogs: ReviewLog[] = parsed.reviewLogs.map((log) => ({
    ...log,
    id: logMap.get(log.id) ?? log.id,
    cardId: cardMap.get(log.cardId) ?? log.cardId,
    deckId: deckMap.get(log.deckId) ?? log.deckId
  }));

  await db.transaction('rw', db.decks, db.cards, db.media, db.reviewLogs, async () => {
    await db.decks.bulkPut(decks);
    await db.cards.bulkPut(cards);
    await db.media.bulkPut(media);
    await db.reviewLogs.bulkPut(reviewLogs);
  });

  return {
    decks: decks.length,
    cards: cards.length,
    media: media.length,
    reviewLogs: reviewLogs.length
  };
}

function makeIdMap(ids: EntityId[], existing: Set<string>, prefix: string): Map<EntityId, EntityId> {
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
  });

  return map;
}

function validateBackup(value: BackupFile): void {
  if (!value || ![1, 2].includes(value.version) || !Array.isArray(value.decks) || !Array.isArray(value.cards) || !Array.isArray(value.media) || !Array.isArray(value.reviewLogs)) {
    throw new Error('Soubor není platná JSON záloha této aplikace.');
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Nepodařilo se exportovat obrázek.'));
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
