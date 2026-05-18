import type { CardSide, PendingCardMedia } from '../types';
import { createId } from '../utils/id';
import { nowIso } from '../utils/date';
import { processImageBlobForCard, processImageForCard as processImage } from './imageProcessing';

export const AUDIO_FILE_ACCEPT = 'audio/*,.m4a,.mp3,.wav,.webm,.ogg,.oga,.aac,.mp4';

const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
const TARGET_AUDIO_BITS_PER_SECOND = 192_000;
const TARGET_AUDIO_SAMPLE_RATE = 48_000;
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

export async function processMediaForCard(
  file: File, 
  side: CardSide,
  onProgress?: (percent: number, label?: string) => void
): Promise<PendingCardMedia> {
  if (file.type.startsWith('image/')) {
    return processImage(file, side);
  }

  if (isAudioFile(file.type, file.name)) {
    if (file.size > MAX_AUDIO_BYTES) {
      throw new Error('Zvukový soubor je příliš velký. Zvolte prosím soubor do 100 MB.');
    }

    const mimeType = normalizeAudioMimeType(file.type, file.name);
    const blob = file.type === mimeType ? file : file.slice(0, file.size, mimeType);
    return processAudioForCard(blob, side, file.name || defaultAudioName(mimeType), mimeType, { 
        compress: true, 
        readDuration: true,
        onProgress
    });
  }

  throw new Error('Nepodporovaný formát souboru.');
}

export async function processRecordedAudioForCard(file: File, side: CardSide): Promise<PendingCardMedia> {
  if (!isAudioFile(file.type, file.name)) {
    throw new Error('Nahrávka nemá podporovaný zvukový formát.');
  }

  if (file.size > MAX_AUDIO_BYTES) {
    throw new Error('Zvukový soubor je příliš velký. Zvolte prosím soubor do 100 MB.');
  }

  const mimeType = normalizeAudioMimeType(file.type, file.name);
  const blob = file.type === mimeType ? file : file.slice(0, file.size, mimeType);

  return createAudioMedia(blob, side, file.name || defaultAudioName(mimeType), mimeType);
}

export async function processImportedMedia(
  blob: Blob,
  side: CardSide,
  options: { 
    mimeType?: string; 
    name?: string; 
    compressAudio?: boolean; 
    readAudioDuration?: boolean;
    onProgress?: (percent: number, label?: string) => void;
  } = {}
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
    return processAudioForCard(audioBlob, side, name, audioMimeType, {
      compress: options.compressAudio ?? false,
      readDuration: options.readAudioDuration ?? false,
      onProgress: options.onProgress
    });
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

async function processAudioForCard(
  blob: Blob,
  side: CardSide,
  name: string,
  mimeType: string,
  options: { compress?: boolean; readDuration?: boolean; onProgress?: (percent: number, label?: string) => void } = { compress: true, readDuration: true }
): Promise<PendingCardMedia> {
  const shouldCompress = options.compress ?? true;
  const shouldReadDuration = options.readDuration ?? true;
  
  options.onProgress?.(5, 'Načítám zvuková data...');
  const durationSeconds = shouldReadDuration ? await readAudioDuration(blob) : undefined;
  
  let finalBlob = blob;
  if (shouldCompress) {
      const compressedBlob = await compressAudioBlob(blob, (percent, label) => {
          options.onProgress?.(10 + Math.round(percent * 0.85), label);
      });
      if (compressedBlob) finalBlob = compressedBlob;
  }
  
  options.onProgress?.(98, 'Ukládám zvuk...');
  const finalDurationSeconds = shouldCompress && finalBlob !== blob ? await readAudioDuration(finalBlob) : durationSeconds;

  return createAudioMedia(finalBlob, side, name, finalBlob.type || mimeType, finalDurationSeconds ?? durationSeconds ?? (shouldReadDuration ? undefined : null));
}

async function createAudioMedia(
  blob: Blob,
  side: CardSide,
  name: string,
  mimeType: string,
  knownDurationSeconds?: number | null
): Promise<PendingCardMedia> {
  const durationSeconds = knownDurationSeconds === null ? undefined : knownDurationSeconds ?? await readAudioDuration(blob);

  return {
    id: createId('media'),
    side,
    blob,
    mimeType: blob.type || mimeType,
    type: 'audio',
    name,
    size: blob.size,
    durationSeconds,
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

async function compressAudioBlob(
  sourceBlob: Blob,
  onProgress?: (percent: number, label?: string) => void
): Promise<Blob | undefined> {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') return undefined;

  const outputMimeType = pickAudioRecorderMimeType();
  const AudioContextCtor = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!outputMimeType || !AudioContextCtor) return undefined;

  let decodeContext: AudioContext | undefined;
  let audioContext: AudioContext | undefined;

  try {
    onProgress?.(0, 'Dekóduji audio...');
    decodeContext = new AudioContextCtor();
    const audioBuffer = await decodeContext.decodeAudioData(await sourceBlob.arrayBuffer());
    await decodeContext.close();
    decodeContext = undefined;

    onProgress?.(5, 'Připravuji kompresi...');
    audioContext = new AudioContextCtor({ sampleRate: Math.min(TARGET_AUDIO_SAMPLE_RATE, audioBuffer.sampleRate) });
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
      const duration = Math.max(0.1, audioBuffer.duration);
      let progressInterval: number | undefined;

      const timeout = window.setTimeout(() => {
        if (recorder.state !== 'inactive') recorder.stop();
        if (progressInterval) window.clearInterval(progressInterval);
        reject(new Error('Kompresní nahrávání vypršelo.'));
      }, Math.max(8000, duration * 1000 + 4000));

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => {
        window.clearTimeout(timeout);
        if (progressInterval) window.clearInterval(progressInterval);
        reject(new Error('Audio se nepodařilo zkomprimovat.'));
      };
      recorder.onstop = () => {
        window.clearTimeout(timeout);
        if (progressInterval) window.clearInterval(progressInterval);
        resolve(new Blob(chunks, { type: recorder.mimeType || outputMimeType }));
      };

      const startTime = Date.now();
      progressInterval = window.setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        const percent = Math.min(99, Math.round((elapsed / duration) * 100));
        onProgress?.(percent, `Komprimuji zvuk (${percent}%)`);
      }, 500);
    });

    recorder.start(250);
    await audioContext.resume();
    source.start();
    source.onended = () => {
      window.setTimeout(() => {
        if (recorder.state !== 'inactive') recorder.stop();
      }, 150);
    };

    const compressed = await recorded;
    source.disconnect();
    await audioContext.close();

    onProgress?.(100, 'Zvuk je zkomprimovaný');

    if (compressed.size > 0 && compressed.size < sourceBlob.size * 0.9) {
      return compressed;
    }
  } catch (err) {
    console.error('Audio compression failed:', err);
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
