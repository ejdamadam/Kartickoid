import { db } from '../db/database';

export interface IntegrityReport {
  orphanMedia: number;
  orphanLogs: number;
  missingMediaRefs: number;
}

export async function checkIntegrity(): Promise<IntegrityReport> {
  const [cards, media, logs] = await Promise.all([
    db.cards.toArray(),
    db.media.toArray(),
    db.reviewLogs.toArray()
  ]);
  const cardIds = new Set(cards.map((card) => card.id));
  const mediaIds = new Set(media.map((item) => item.id));

  return {
    orphanMedia: media.filter((item) => !cardIds.has(item.cardId)).length,
    orphanLogs: logs.filter((log) => !cardIds.has(log.cardId)).length,
    missingMediaRefs: cards.reduce((sum, card) => sum + card.imageIds.filter((id) => !mediaIds.has(id)).length, 0)
  };
}
