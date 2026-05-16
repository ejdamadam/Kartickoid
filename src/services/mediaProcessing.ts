import type { CardSide, PendingCardMedia } from '../types';
import { createId } from '../utils/id';
import { nowIso } from '../utils/date';
import { processImageBlobForCard, processImageForCard as processImage } from './imageProcessing';

export const AUDIO_FILE_ACCEPT = 'audio/*,.m4a,.mp3,.wav,.webm,.ogg,.oga,.aac,.mp4';

const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
const TARGET_AUDIO_BITS_PER_SECOND = 32_000;
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

  if (isAudioFile(file.type, file.name)) {
    if (file.size > MAX_AUDIO_BYTES) {
      throw new Error('Zvukový soubor je příliš velký. Zvolte prosím soubor do 100 MB.');
    }

    const mimeType = normalizeAudioMimeType(file.type, file.name);
    const blob = file.type === mimeType ? file : file.slice(0, file.size, mimeType);
    return processAudioForCard(blob, side, file.name || defaultAudioName(mimeType), mimeType);
  }

  throw new Error('Nepodporovaný formát souboru.');
}

export async function processImportedMedia(
  blob: Blob,
  side: CardSide,
  options: { mimeType?: string; name?: string } = {}
): Promise<PendingCardMedia> {
  const mimeType = await detectMediaMimeType(blob, options.mimeType, options.name);
  const name = options.name || defaultMediaName(mimeType);
  const typedBlob = blob.type === mimeType ? blob : blob.slice(0, blob.size, mimeType);

  if (mimeType.startsWith('image/')) {
    return processImageBlobForCard(typedBlob, side, name);
  }

  if (mimeType.startsWith('audio/') || mimeType === 'video/mp4') {
    const audioMimeType = normalizeAudioMimeType(mimeType, name);
    const audioBlob = typedBlob.type === audioMimeType ? typedBlob : typedBlob.slice(0, typedBlob.size, audioMimeType);
    return processAudioForCard(audioBlob, side, name, audioMimeType);
  }

  throw new Error('Nepodporovaný formát média v importu.');
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

async function processAudioForCard(blob: Blob, side: CardSide, name: string, mimeType: string): Promise<PendingCardMedia> {
  const durationSeconds = await readAudioDuration(blob);
  const compressedBlob = await compressAudioBlob(blob);
  const finalBlob = compressedBlob ?? blob;
  const finalDurationSeconds = compressedBlob ? await readAudioDuration(finalBlob) : durationSeconds;

  return {
    id: createId('media'),
    side,
    blob: finalBlob,
    mimeType: finalBlob.type || mimeType,
    type: 'audio',
    name,
    size: finalBlob.size,
    durationSeconds: finalDurationSeconds ?? durationSeconds,
    createdAt: nowIso()
  };
}

function isAudioFile(type: string, name: string): boolean {
  const normalizedType = normalizeMimeType(type);
  return normalizedType.startsWith('audio/')
    || normalizedType === 'video/mp4'
    || Boolean(AUDIO_EXTENSION_MIME[getFileExtension(name)]);
}

function normalizeAudioMimeType(type: string, name: string): string {
  const normalizedType = normalizeMimeType(type);
  const extensionMime = AUDIO_EXTENSION_MIME[getFileExtension(name)];

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

function defaultMediaName(mimeType: string): string {
  if (mimeType.startsWith('audio/')) return defaultAudioName(mimeType);
  if (mimeType === 'image/png') return 'image.png';
  if (mimeType === 'image/webp') return 'image.webp';
  if (mimeType === 'image/gif') return 'image.gif';
  return 'image.jpg';
}

async function detectMediaMimeType(blob: Blob, declaredType?: string, name?: string): Promise<string> {
  const declared = normalizeMimeType(declaredType || blob.type);
  if (declared.startsWith('image/') || declared.startsWith('audio/') || declared === 'video/mp4') {
    return declared;
  }

  const extensionType = name ? AUDIO_EXTENSION_MIME[getFileExtension(name)] : undefined;
  if (extensionType) return extensionType;

  const header = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  const text = String.fromCharCode(...header);

  if (header[0] === 0xff && header[1] === 0xd8) return 'image/jpeg';
  if (header[0] === 0x89 && text.slice(1, 4) === 'PNG') return 'image/png';
  if (text.startsWith('GIF8')) return 'image/gif';
  if (text.startsWith('RIFF')) {
    if (text.slice(8, 12) === 'WEBP') return 'image/webp';
    if (text.slice(8, 12) === 'WAVE') return 'audio/wav';
  }
  if (text.startsWith('ID3') || (header[0] === 0xff && (header[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
  if (text.startsWith('OggS')) return 'audio/ogg';
  if (header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3) return 'audio/webm';
  if (text.slice(4, 8) === 'ftyp') return 'audio/mp4';

  return 'application/octet-stream';
}

function pickAudioRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return undefined;
  }

  return [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4'
  ].find((type) => MediaRecorder.isTypeSupported(type));
}

async function compressAudioBlob(sourceBlob: Blob): Promise<Blob | undefined> {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') return undefined;

  const outputMimeType = pickAudioRecorderMimeType();
  const AudioContextCtor = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!outputMimeType || !AudioContextCtor) return undefined;

  let decodeContext: AudioContext | undefined;
  let audioContext: AudioContext | undefined;

  try {
    decodeContext = new AudioContextCtor();
    const audioBuffer = await decodeContext.decodeAudioData(await sourceBlob.arrayBuffer());
    await decodeContext.close();
    decodeContext = undefined;

    audioContext = new AudioContextCtor({ sampleRate: Math.min(24_000, audioBuffer.sampleRate) });
    const source = audioContext.createBufferSource();
    const destination = audioContext.createMediaStreamDestination();
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(destination.stream, {
      mimeType: outputMimeType,
      audioBitsPerSecond: TARGET_AUDIO_BITS_PER_SECOND
    });

    source.buffer = audioBuffer;
    source.connect(destination);

    const recorded = new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => reject(new Error('Audio se nepodařilo zkomprimovat.'));
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || outputMimeType }));
    });

    recorder.start(250);
    await audioContext.resume();
    source.start();
    source.onended = () => {
      window.setTimeout(() => {
        if (recorder.state !== 'inactive') recorder.stop();
      }, 120);
    };

    const compressed = await recorded;
    source.disconnect();
    await audioContext.close();

    if (compressed.size > 0 && compressed.size < sourceBlob.size * 0.96) {
      return compressed;
    }
  } catch {
    // Some browsers cannot decode every imported audio format. Keeping the original is safer than failing the import.
  } finally {
    if (decodeContext && decodeContext.state !== 'closed') void decodeContext.close();
    if (audioContext && audioContext.state !== 'closed') void audioContext.close();
  }

  return undefined;
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
