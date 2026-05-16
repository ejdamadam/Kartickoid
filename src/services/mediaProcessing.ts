import type { CardSide, PendingCardMedia } from '../types';
import { createId } from '../utils/id';
import { nowIso } from '../utils/date';
import { processImageForCard as processImage } from './imageProcessing';

export const AUDIO_FILE_ACCEPT = 'audio/*,.m4a,.mp3,.wav,.webm,.ogg,.oga,.aac,.mp4';

const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
const AUDIO_EXTENSION_MIME: Record<string, string> = {
  aac: 'audio/aac',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  mp4: 'audio/mp4',
  oga: 'audio/ogg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  wave: 'audio/wav',
  webm: 'audio/webm'
};

export async function processMediaForCard(file: File, side: CardSide): Promise<PendingCardMedia> {
  if (file.type.startsWith('image/')) {
    return processImage(file, side);
  }

  if (isAudioFile(file)) {
    if (file.size > MAX_AUDIO_BYTES) {
      throw new Error('Zvukový soubor je příliš velký. Zvolte prosím soubor do 100 MB.');
    }

    const mimeType = normalizeAudioMimeType(file);
    const blob = file.type === mimeType ? file : file.slice(0, file.size, mimeType);
    const durationSeconds = await readAudioDuration(blob);

    return {
      id: createId('media'),
      side,
      blob,
      mimeType,
      type: 'audio',
      name: file.name || defaultAudioName(mimeType),
      size: file.size,
      durationSeconds,
      createdAt: nowIso()
    };
  }

  throw new Error('Nepodporovaný formát souboru.');
}

export function canBrowserPlayAudio(mimeType: string, name?: string): boolean {
  if (typeof document === 'undefined') return true;
  const audio = document.createElement('audio');
  const candidates = Array.from(new Set([
    normalizeMimeType(mimeType),
    name ? AUDIO_EXTENSION_MIME[getFileExtension(name)] : undefined
  ].filter(Boolean) as string[]));

  return candidates.length === 0 || candidates.some((candidate) => audio.canPlayType(candidate) !== '');
}

function isAudioFile(file: File): boolean {
  const normalizedType = normalizeMimeType(file.type);
  return normalizedType.startsWith('audio/')
    || normalizedType === 'video/mp4'
    || Boolean(AUDIO_EXTENSION_MIME[getFileExtension(file.name)]);
}

function normalizeAudioMimeType(file: File): string {
  const normalizedType = normalizeMimeType(file.type);
  const extensionMime = AUDIO_EXTENSION_MIME[getFileExtension(file.name)];

  if (normalizedType === 'video/mp4') return 'audio/mp4';
  if (normalizedType.startsWith('audio/')) return normalizedType;
  return extensionMime ?? 'audio/mpeg';
}

function normalizeMimeType(value: string): string {
  return value.toLowerCase().split(';')[0].trim();
}

function getFileExtension(name: string): string {
  return name.toLowerCase().split('.').pop() ?? '';
}

function defaultAudioName(mimeType: string): string {
  const extension = Object.entries(AUDIO_EXTENSION_MIME).find(([, value]) => value === mimeType)?.[0] ?? 'audio';
  return `audio.${extension}`;
}

function readAudioDuration(blob: Blob): Promise<number | undefined> {
  if (typeof Audio === 'undefined') return Promise.resolve(undefined);

  return new Promise((resolve) => {
    const audio = new Audio();
    const url = URL.createObjectURL(blob);
    let settled = false;
    const finish = (duration?: number) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      URL.revokeObjectURL(url);
      audio.onloadedmetadata = null;
      audio.onerror = null;
      audio.removeAttribute('src');
      audio.load();
      resolve(duration);
    };
    const timeout = window.setTimeout(() => finish(), 4500);

    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : undefined;
      finish(duration);
    };
    audio.onerror = () => finish();
    audio.src = url;
    audio.load();
  });
}
