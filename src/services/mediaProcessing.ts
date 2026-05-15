import type { CardSide, PendingCardMedia } from '../types';
import { createId } from '../utils/id';
import { nowIso } from '../utils/date';
import { processImageForCard as processImage } from './imageProcessing';

export async function processMediaForCard(file: File, side: CardSide): Promise<PendingCardMedia> {
  if (file.type.startsWith('image/')) {
    return processImage(file, side);
  } else if (file.type.startsWith('audio/') || file.type === 'audio/mp4' || file.type === 'video/mp4') {
    return {
      id: createId('media'),
      side,
      blob: file,
      mimeType: file.type === 'video/mp4' ? 'audio/mp4' : file.type,
      type: 'audio',
      name: file.name,
      createdAt: nowIso()
    };
  }
  throw new Error('Nepodporovaný formát souboru.');
}
