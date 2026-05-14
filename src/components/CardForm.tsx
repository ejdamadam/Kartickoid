import { useMemo, useState, type DragEvent, type FormEvent } from 'react';
import type { Card, CardSide, PendingCardMedia } from '../types';
import { processMediaForCard } from '../services/mediaProcessing';
import { t } from '../i18n';
import ObjectImage from './ObjectImage';
import TagInput from './TagInput';

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
      const index = current.findIndex((item) => item.id !== id);
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
        <textarea
          value={frontText}
          onChange={(event) => setFrontText(event.target.value)}
          rows={4}
          placeholder={t.cardForm.frontPlaceholder}
          autoFocus
        />
      </label>
      <MediaDropZone
        side="front"
        media={media.filter((item) => item.side === 'front')}
        onAdd={addFiles}
        onRemove={removeMedia}
        onMove={moveMedia}
        onPreview={setPreview}
      />

      <label>
        {t.deck.backSide}
        <textarea
          value={backText}
          onChange={(event) => setBackText(event.target.value)}
          rows={4}
          placeholder={t.cardForm.backPlaceholder}
        />
      </label>
      <MediaDropZone
        side="back"
        media={media.filter((item) => item.side === 'back')}
        onAdd={addFiles}
        onRemove={removeMedia}
        onMove={moveMedia}
        onPreview={setPreview}
      />

      <div className="form-section-tags">
        <TagInput value={tags} suggestions={tagSuggestions} onChange={setTags} />
      </div>

      <div className="button-row form-actions">
        <button className="primary-button" disabled={saving || processing} type="submit">
          {saving ? t.common.saving : t.common.save}
        </button>
        <button className="secondary-button" type="button" onClick={onCancel}>{t.common.cancel}</button>
      </div>

      {preview && (
        <div className="image-lightbox" role="dialog" aria-modal="true" aria-label={t.cardForm.fullscreenPreview} onClick={() => setPreview(undefined)}>
          <button className="icon-button" type="button" onClick={() => setPreview(undefined)} aria-label={t.common.close}>×</button>
          {preview.type === 'audio' ? (
            <audio src={URL.createObjectURL(preview.blob)} controls autoPlay onClick={(e) => e.stopPropagation()} />
          ) : (
            <ObjectImage blob={preview.blob} alt={preview.name} />
          )}
        </div>
      )}
    </form>
  );
}

function MediaDropZone({ side, media, onAdd, onRemove, onMove, onPreview }: {
  side: CardSide;
  media: PendingCardMedia[];
  onAdd: (files: FileList | File[], side: CardSide) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onPreview: (media: PendingCardMedia) => void;
}) {
  const [dragActive, setDragActive] = useState(false);

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragActive(false);
    onAdd(event.dataTransfer.files, side);
  }

  return (
    <section className="image-form-section">
      <div className="upload-buttons">
        <label className={`upload-button ${dragActive ? 'active' : ''}`}>
          {'Obrázek'}
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => {
              if (event.target.files) onAdd(event.target.files, side);
              event.currentTarget.value = '';
            }}
          />
        </label>
        <label className={`upload-button ${dragActive ? 'active' : ''}`}>
          {'Zvuk'}
          <input
            type="file"
            accept="audio/*"
            multiple
            onChange={(event) => {
              if (event.target.files) onAdd(event.target.files, side);
              event.currentTarget.value = '';
            }}
          />
        </label>
      </div>

      {media.length > 0 ? (
        <div className="pending-image-grid">
          {media.map((item, index) => (
            <figure className="pending-image" key={item.id}>
              <button type="button" onClick={() => onPreview(item)} aria-label={t.cardForm.fullscreenPreview}>
                {item.type === 'audio' ? (
                  <div className="audio-preview-icon" style={{ fontSize: '1.5rem' }}>🎵</div>
                ) : (
                  <ObjectImage blob={item.blob} alt={item.name} />
                )}
              </button>
              <figcaption>{item.name}</figcaption>
              <div className="image-actions">
                <button type="button" className="tiny-button" onClick={() => onMove(item.id, -1)} disabled={index === 0}>{t.common.moveLeft}</button>
                <button type="button" className="tiny-button" onClick={() => onMove(item.id, 1)} disabled={index === media.length - 1}>{t.common.moveRight}</button>
                <button type="button" className="tiny-button" onClick={() => onRemove(item.id)}>{t.common.remove}</button>
              </div>
            </figure>
          ))}
        </div>
      ) : (
        <p className="muted">{'No media'}</p>
      )}
    </section>
  );
}
