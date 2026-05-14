import type { CardSide, EntityId, Media, PendingCardImage } from '../types';
import { createId } from '../utils/id';
import { nowIso } from '../utils/date';

const MAX_IMAGE_BYTES = 18 * 1024 * 1024;
const MAX_WIDTH = 1600;
const QUALITY = 0.8;

export async function processImageFile(file: File, cardId: EntityId, deckId: EntityId, side: CardSide): Promise<Media> {
  const processed = await processImageForCard(file, side);

  return {
    ...processed,
    cardId,
    deckId
  };
}

export async function processImageForCard(file: File, side: CardSide): Promise<PendingCardImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Soubor musí být obrázek.');
  }

  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('Obrázek je příliš velký. Zvolte prosím soubor do 18 MB.');
  }

  const image = await loadRasterSource(file);
  const scale = Math.min(1, MAX_WIDTH / image.width);
  const width = Math.round(image.width * scale);
  const height = Math.round(image.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');

  if (!context) {
    image.cleanup();
    throw new Error('Nepodařilo se připravit obrázek.');
  }

  context.drawImage(image.source, 0, 0, width, height);
  image.cleanup();

  const preferredType = supportsWebP() ? 'image/webp' : 'image/jpeg';
  const blob = await canvasToBlob(canvas, preferredType, QUALITY);

  return {
    id: createId('media'),
    side,
    blob,
    mimeType: blob.type || preferredType,
    name: file.name,
    createdAt: nowIso()
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Nepodařilo se zkomprimovat obrázek.'));
    }, type, quality);
  });
}

function supportsWebP(): boolean {
  const canvas = document.createElement('canvas');
  return canvas.toDataURL('image/webp').startsWith('data:image/webp');
}

async function loadRasterSource(file: File): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}> {
  if ('createImageBitmap' in window) {
    const bitmap = await createImageBitmap(file);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => bitmap.close()
    };
  }

  const url = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = 'async';
  image.src = url;

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Obrázek se nepodařilo načíst.'));
  });

  return {
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    cleanup: () => URL.revokeObjectURL(url)
  };
}
