import { useMemo, useState, type FormEvent, useEffect } from 'react';
import type { Card, CardSide, PendingCardMedia } from '../types';
import { db } from '../db/database';
import { AUDIO_FILE_ACCEPT, processMediaForCard } from '../services/mediaProcessing';
import { t } from '../i18n';
import ObjectImage from './ObjectImage';
import TagInput from './TagInput';
import RichTextEditor from './RichTextEditor';

export interface CardFormValues {
  frontText: string;
  backText: string;
  tags: string[];
  media: PendingCardMedia[];
}

interface CardFormProps {
  card?: Card;
  existingMediaCount?: number;
  tagSuggestions?: string[];
  onSubmit: (values: CardFormValues) => Promise<void>;
  onCancel: () => void;
}

export default function CardForm({ card, existingMediaCount = 0, tagSuggestions = [], onSubmit, onCancel }: CardFormProps) {
  const [frontText, setFrontText] = useState(card?.frontText ?? '');
  const [backText, setBackText] = useState(card?.backText ?? '');
  const [tags, setTags] = useState<string[]>(card?.tags ?? []);
  const [media, setMedia] = useState<PendingCardMedia[]>([]);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string>();
  const [preview, setPreview] = useState<PendingCardMedia>();

  useEffect(() => {
    async function loadCardData() {
      if (card) {
        setFrontText(card.frontText);
        setBackText(card.backText);
        setTags(card.tags);
        const existingMedia = await db.media.where('cardId').equals(card.id).toArray();
        setMedia(existingMedia as PendingCardMedia[]);
      }
    }
    loadCardData();
  }, [card]);

  const hasContent = useMemo(() => (
    Boolean(frontText.trim() || backText.trim() || media.length > 0 || existingMediaCount > 0)
  ), [backText, existingMediaCount, frontText, media.length]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!hasContent) {
      setError(t.cardForm.contentRequired);
      return;
    }
    setSaving(true);
    try {
      await onSubmit({ frontText, backText, tags, media });
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setSaving(false);
    }
  }

  async function addFiles(files: FileList | File[], side: CardSide) {
    const selected = Array.from(files);
    if (selected.length === 0) return;
    setProcessing(true);
    setError(undefined);
    try {
      const processed: PendingCardMedia[] = [];
      for (const file of selected) {
        processed.push(await processMediaForCard(file, side));
      }
      setMedia((current) => [...current, ...processed]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.deck.imageError);
    } finally {
      setProcessing(false);
    }
  }

  function removeMedia(id: string) {
    setMedia((current) => current.filter((item) => item.id !== id));
  }

  function moveMedia(id: string, direction: -1 | 1) {
    setMedia((current) => {
      const index = current.findIndex((item) => item.id === id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length || current[index].side !== current[nextIndex].side) {
        return current;
      }
      const copy = [...current];
      [copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]];
      return copy;
    });
  }

  return (
    <form className="stack" onSubmit={handleSubmit}>
      {error && <p className="error-box">{error}</p>}
      {processing && <p className="success-box">{t.cardForm.compressing}</p>}

      <label>
        {t.deck.frontSide}
        <RichTextEditor content={frontText} onChange={setFrontText} />
      </label>
      <MediaDropZone side="front" media={media.filter((i) => i.side === 'front')} onAdd={addFiles} onRemove={removeMedia} onMove={moveMedia} onPreview={setPreview} />

      <label>
        {t.deck.backSide}
        <RichTextEditor content={backText} onChange={setBackText} />
      </label>
      <MediaDropZone side="back" media={media.filter((i) => i.side === 'back')} onAdd={addFiles} onRemove={removeMedia} onMove={moveMedia} onPreview={setPreview} />

      <div className="form-section-tags">
        <TagInput value={tags} suggestions={tagSuggestions} onChange={setTags} />
      </div>

      <div className="button-row form-actions">
        <button className="primary-button" type="submit">{saving ? t.common.saving : t.common.save}</button>
        <button className="secondary-button" type="button" onClick={onCancel}>{t.common.cancel}</button>
      </div>

      {preview && (
        <div className="image-lightbox" onClick={() => setPreview(undefined)}>
          {preview.type === 'audio' ? <AudioPreview media={preview} /> : <ObjectImage blob={preview.blob} alt={preview.name} />}
        </div>
      )}
    </form>
  );
}

function AudioPreview({ media }: { media: PendingCardMedia }) {
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    const nextUrl = URL.createObjectURL(media.blob);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [media.blob]);

  if (!url) return <p className="audio-status muted">Načítám zvuk…</p>;

  return (
    <div className="audio-shell">
       <audio 
         className="audio-player" 
         src={url} 
         controls 
         autoPlay 
         onClick={(e) => e.stopPropagation()} 
       />
    </div>
  );
}

function MediaDropZone({ side, media, onAdd, onRemove, onMove, onPreview }: {
  side: CardSide;
  media: PendingCardMedia[];
  onAdd: (files: FileList | File[], side: CardSide) => Promise<void>;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onPreview: (media: PendingCardMedia) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [recorder, setRecorder] = useState<MediaRecorder | null>(null);
  const [recordingError, setRecordingError] = useState<string>();

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setRecordingError('Prohlížeč nepodporuje nahrávání zvuku.');
      return;
    }

    try {
      setRecordingError(undefined);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = chooseRecordingMimeType();
      const options = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
      const recordedChunks: Blob[] = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunks.push(event.data);
        }
      };
      mediaRecorder.onstop = () => {
        const finalMimeType = normalizeRecordingMimeType(mediaRecorder.mimeType || (recordedChunks.length > 0 ? recordedChunks[0].type : '') || mimeType || fallbackRecordingMimeType());
        
        if (recordedChunks.length === 0) {
          setRecordingError('Nahrávka neobsahuje žádná zvuková data. Zkuste ji prosím nahrát znovu.');
          stream.getTracks().forEach((track) => track.stop());
          setRecorder(null);
          return;
        }
        
        const blob = new Blob(recordedChunks, { type: finalMimeType });
        const fileExt = recordingExtension(finalMimeType);
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        void onAdd([new File([blob], `nahravka-${stamp}.${fileExt}`, { type: finalMimeType })], side);
        stream.getTracks().forEach((track) => track.stop());
        setRecorder(null);
      };
      mediaRecorder.onerror = () => {
        setRecordingError('Nahrávání se nepovedlo. Zkuste to prosím znovu.');
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        setRecorder(null);
      };

      mediaRecorder.start(200); // Send data every 200ms to avoid iOS issues
      setRecorder(mediaRecorder);
      setRecording(true);
    } catch {
      setRecordingError('Mikrofon se nepodařilo zpřístupnit.');
    }
  }

  function stopRecording() {
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.requestData();
        recorder.stop();
      } catch {
        // Fallback for some browsers
        recorder.stop();
      }
    }
    setRecording(false);
  }

  return (
    <section className="image-form-section">
      <div className="upload-buttons">
        <label className="upload-button">Obrázek<input type="file" accept="image/*" multiple onChange={(e) => e.target.files && onAdd(e.target.files, side)} /></label>
        <label className="upload-button">Zvuk<input type="file" accept={AUDIO_FILE_ACCEPT} multiple onChange={(e) => e.target.files && onAdd(e.target.files, side)} /></label>
        <button className="upload-button" type="button" onClick={recording ? stopRecording : startRecording} style={{ background: recording ? '#f44336' : '#eee' }}>
            {recording ? 'Stop' : 'Nahrát zvuk'}
        </button>
      </div>
      {recordingError && <p className="error-box">{recordingError}</p>}
      <div className="pending-image-grid">
        {media.map((item, index) => (
          <figure className="pending-image" key={item.id}>
            <button type="button" onClick={() => onPreview(item)}>{item.type === 'audio' ? '🎵' : <ObjectImage blob={item.blob} alt={item.name} />}</button>
            <div className="image-actions">
              <button type="button" className="tiny-button" onClick={() => onMove(item.id, -1)} disabled={index === 0}>←</button>
              <button type="button" className="tiny-button" onClick={() => onMove(item.id, 1)} disabled={index === media.length - 1}>→</button>
              <button type="button" className="tiny-button" onClick={() => onRemove(item.id)}>X</button>
            </div>
          </figure>
        ))}
      </div>
    </section>
  );
}

function chooseRecordingMimeType(): string {
  const candidates = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'video/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? '';
}

function fallbackRecordingMimeType(): string {
  const userAgent = navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod|safari/.test(userAgent) && !/chrome|crios|android/.test(userAgent)
    ? 'audio/mp4'
    : 'audio/webm';
}

function normalizeRecordingMimeType(value: string): string {
  const normalized = value.toLowerCase().split(';')[0].trim();
  if (normalized === 'video/mp4') return 'audio/mp4';
  return normalized || fallbackRecordingMimeType();
}

function recordingExtension(mimeType: string): string {
  if (mimeType.includes('mp4') || mimeType.includes('aac')) return 'm4a';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('wav')) return 'wav';
  return 'webm';
}
