import { useMemo, useState, type DragEvent, type FormEvent } from 'react';
import type { Card, CardSide, PendingCardImage } from '../types';
import { processImageForCard } from '../services/imageProcessing';
import { t } from '../i18n';
import ObjectImage from './ObjectImage';
import TagInput from './TagInput';

export interface CardFormValues {
  frontText: string;
  backText: string;
  tags: string[];
  images: PendingCardImage[];
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
  const [images, setImages] = useState<PendingCardImage[]>([]);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string>();
  const [preview, setPreview] = useState<PendingCardImage>();

  const hasContent = useMemo(() => (
    Boolean(frontText.trim() || backText.trim() || images.length > 0 || existingMediaCount > 0)
  ), [backText, existingMediaCount, frontText, images.length]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!hasContent) {
      setError(t.cardForm.contentRequired);
      return;
    }
    setSaving(true);
    try {
      await onSubmit({ frontText, backText, tags, images });
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
      const processed: PendingCardImage[] = [];
      for (const file of selected) {
        processed.push(await processImageForCard(file, side));
      }
      setImages((current) => [...current, ...processed]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.deck.imageError);
    } finally {
      setProcessing(false);
    }
  }

  function removeImage(id: string) {
    setImages((current) => current.filter((image) => image.id !== id));
  }

  function moveImage(id: string, direction: -1 | 1) {
    setImages((current) => {
      const index = current.findIndex((image) => image.id === id);
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
      <ImageDropZone
        side="front"
        images={images.filter((image) => image.side === 'front')}
        onAdd={addFiles}
        onRemove={removeImage}
        onMove={moveImage}
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
      <ImageDropZone
        side="back"
        images={images.filter((image) => image.side === 'back')}
        onAdd={addFiles}
        onRemove={removeImage}
        onMove={moveImage}
        onPreview={setPreview}
      />

      <TagInput value={tags} suggestions={tagSuggestions} onChange={setTags} />
      <div className="button-row">
        <button className="primary-button" disabled={saving || processing} type="submit">
          {saving ? t.common.saving : t.common.save}
        </button>
        <button className="secondary-button" type="button" onClick={onCancel}>{t.common.cancel}</button>
      </div>

      {preview && (
        <div className="image-lightbox" role="dialog" aria-modal="true" aria-label={t.cardForm.fullscreenPreview} onClick={() => setPreview(undefined)}>
          <button className="icon-button" type="button" onClick={() => setPreview(undefined)} aria-label={t.common.close}>×</button>
          <ObjectImage blob={preview.blob} alt={preview.name} />
        </div>
      )}
    </form>
  );
}

function ImageDropZone({ side, images, onAdd, onRemove, onMove, onPreview }: {
  side: CardSide;
  images: PendingCardImage[];
  onAdd: (files: FileList | File[], side: CardSide) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onPreview: (image: PendingCardImage) => void;
}) {
  const [dragActive, setDragActive] = useState(false);

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragActive(false);
    onAdd(event.dataTransfer.files, side);
  }

  return (
    <section className="image-form-section">
      <label
        className={`image-drop-zone ${dragActive ? 'active' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
      >
        <span>{side === 'front' ? t.cardForm.dropFront : t.cardForm.dropBack}</span>
        <strong>{t.cardForm.takePhoto}</strong>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={(event) => {
            if (event.target.files) onAdd(event.target.files, side);
            event.currentTarget.value = '';
          }}
        />
      </label>

      {images.length > 0 ? (
        <div className="pending-image-grid">
          {images.map((image, index) => (
            <figure className="pending-image" key={image.id}>
              <button type="button" onClick={() => onPreview(image)} aria-label={t.cardForm.fullscreenPreview}>
                <ObjectImage blob={image.blob} alt={image.name} />
              </button>
              <figcaption>{image.name}</figcaption>
              <div className="image-actions">
                <button type="button" className="tiny-button" onClick={() => onMove(image.id, -1)} disabled={index === 0}>{t.common.moveLeft}</button>
                <button type="button" className="tiny-button" onClick={() => onMove(image.id, 1)} disabled={index === images.length - 1}>{t.common.moveRight}</button>
                <button type="button" className="tiny-button" onClick={() => onRemove(image.id)}>{t.common.remove}</button>
              </div>
            </figure>
          ))}
        </div>
      ) : (
        <p className="muted">{t.cardForm.noImages}</p>
      )}
    </section>
  );
}
