import { useMemo, useState } from 'react';
import type { CardSide, PendingCardMedia } from '../types';
import { processMediaForCard } from '../services/mediaProcessing';
import ObjectImage from './ObjectImage';
import RichTextEditor from './RichTextEditor';
import type { CardFormValues } from './CardForm';
import { t } from '../i18n';

interface DraftCard {
  id: string;
  frontText: string;
  backText: string;
  tagsText: string;
  media: PendingCardMedia[];
}

interface MultiCardCreatorProps {
  onCreate: (cards: CardFormValues[]) => Promise<void>;
  onCancel: () => void;
}

export default function MultiCardCreator({ onCreate, onCancel }: MultiCardCreatorProps) {
  const [drafts, setDrafts] = useState<DraftCard[]>(() => createDrafts(1));
  const [saving, setSaving] = useState(false);
  const [processingId, setProcessingId] = useState<string>();
  const [processingLabel, setProcessingLabel] = useState<string>();
  const [error, setError] = useState<string>();

  const validCards = useMemo(() => drafts.filter(isReadyDraft), [drafts]);

  function updateDraft(id: string, values: Partial<DraftCard>) {
    setDrafts((current) => current.map((draft) => draft.id === id ? { ...draft, ...values } : draft));
  }

  function addDraft() {
    setDrafts((current) => [...current, ...createDrafts(1)]);
  }

  async function addMedia(id: string, side: CardSide, files?: FileList | null) {
    const selected = Array.from(files ?? []);
    if (selected.length === 0) return;
    setProcessingId(id);
    setProcessingLabel('Zpracovávám média...');
    setError(undefined);
    try {
      const processed: PendingCardMedia[] = [];
      for (const file of selected) {
          processed.push(await processMediaForCard(file, side, (_, label) => {
              if (label) setProcessingLabel(label);
          }));
      }
      setDrafts((current) => current.map((draft) => (
        draft.id === id ? { ...draft, media: [...draft.media, ...processed] } : draft
      )));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Přílohy se nepodařilo zpracovat.');
    } finally {
      setProcessingId(undefined);
      setProcessingLabel(undefined);
    }
  }

  function removeMedia(draftId: string, mediaId: string) {
    setDrafts((current) => current.map((draft) => (
      draft.id === draftId ? { ...draft, media: draft.media.filter((item) => item.id !== mediaId) } : draft
    )));
  }

  async function submit() {
    const incomplete = drafts.filter((draft) => !isEmptyDraft(draft) && !isReadyDraft(draft));
    if (incomplete.length > 0) {
      setError('Každá ukládaná kartička musí mít vyplněnou nebo přílohou doplněnou přední i zadní stranu.');
      return;
    }
    if (validCards.length === 0) {
      setError('Vyplňte alespoň jednu kartičku.');
      return;
    }

    setSaving(true);
    setError(undefined);
    try {
      await onCreate(validCards.map((draft) => ({
        frontText: draft.frontText,
        backText: draft.backText,
        tags: draft.tagsText.split(',').map((tag) => tag.trim()).filter(Boolean),
        media: draft.media
      })));
      setDrafts(createDrafts(1));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kartičky se nepodařilo uložit.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack multi-card-creator">
      {error && <p className="error-box">{error}</p>}
      <div className="multi-card-list">
        {drafts.map((draft, index) => (
          <article className="multi-card-row" key={draft.id}>
            <div className="multi-card-row-header">
              <strong>Kartička {index + 1}</strong>
              <button
                className="tiny-button"
                type="button"
                onClick={() => setDrafts((current) => current.length > 1 ? current.filter((item) => item.id !== draft.id) : current)}
                disabled={drafts.length <= 1}
              >
                Odebrat
              </button>
            </div>
            <div className="multi-card-fields">
              <CardSideEditor
                label="Přední strana"
                side="front"
                draft={draft}
                content={draft.frontText}
                onChange={(frontText) => updateDraft(draft.id, { frontText })}
                onAddMedia={addMedia}
                onRemoveMedia={removeMedia}
              />
              <CardSideEditor
                label="Zadní strana"
                side="back"
                draft={draft}
                content={draft.backText}
                onChange={(backText) => updateDraft(draft.id, { backText })}
                onAddMedia={addMedia}
                onRemoveMedia={removeMedia}
              />
            </div>
            <label>
              Tagy oddělené čárkou
              <input value={draft.tagsText} onChange={(event) => updateDraft(draft.id, { tagsText: event.target.value })} placeholder="kapitola, důležité" />
            </label>
            {processingId === draft.id && <p className="muted">{processingLabel || 'Zpracovávám média...'}</p>}
          </article>
        ))}
        <button className="add-card-button" type="button" onClick={addDraft} aria-label="Přidat další kartičku">
          + Přidat další kartičku
        </button>
      </div>

      <p className="muted">Prázdné řádky se ignorují. Zvuk se v tomto rychlém přidávání nenahrává.</p>
      <div className="button-row form-actions">
        <button className="primary-button" type="button" disabled={saving || processingId !== undefined} onClick={submit}>
          {saving ? 'Ukládám...' : `Uložit ${validCards.length} kartiček`}
        </button>
        <button className="secondary-button" type="button" onClick={onCancel}>Zrušit</button>
      </div>
    </div>
  );
}

function CardSideEditor({ label, side, draft, content, onChange, onAddMedia, onRemoveMedia }: {
  label: string;
  side: CardSide;
  draft: DraftCard;
  content: string;
  onChange: (content: string) => void;
  onAddMedia: (draftId: string, side: CardSide, files?: FileList | null) => Promise<void>;
  onRemoveMedia: (draftId: string, mediaId: string) => void;
}) {

  const sideMedia = draft.media.filter((item) => item.side === side);

  return (
    <section className="multi-card-side">
      <label>
        {label}
        <RichTextEditor content={content} onChange={onChange} />
      </label>
      <label className="upload-button secondary-button">
        Příloha
        <input
          type="file"
          accept="image/*,audio/*"
          multiple
          onChange={(event) => {
            void onAddMedia(draft.id, side, event.target.files);
            event.currentTarget.value = '';
          }}
        />
      </label>
      {sideMedia.length > 0 && (
        <div className="pending-image-grid compact-media-grid">
          {sideMedia.map((item) => (
            <figure className="pending-image" key={item.id}>
              <ObjectImage blob={item.blob} alt={item.name} />
              <button className="tiny-button" type="button" onClick={() => onRemoveMedia(draft.id, item.id)}>Odebrat</button>
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}

function createDrafts(count: number): DraftCard[] {
  return Array.from({ length: count }, () => ({
    id: crypto.randomUUID(),
    frontText: '',
    backText: '',
    tagsText: '',
    media: []
  }));
}

function isEmptyDraft(draft: DraftCard): boolean {
  return !textContent(draft.frontText) && !textContent(draft.backText) && draft.media.length === 0 && !draft.tagsText.trim();
}

function isReadyDraft(draft: DraftCard): boolean {
  const hasFront = Boolean(textContent(draft.frontText)) || draft.media.some((item) => item.side === 'front');
  const hasBack = Boolean(textContent(draft.backText)) || draft.media.some((item) => item.side === 'back');
  return hasFront && hasBack;
}

function textContent(html: string): string {
  const element = document.createElement('div');
  element.innerHTML = html;
  return (element.textContent ?? '').trim();
}
