import { useMemo, useState } from 'react';
import type { Card } from '../types';
import { createCardInput } from '../db/database';
import { previewBulkCards } from '../services/importers/bulkImporter';
import { t } from '../i18n';

interface BulkEditorProps {
  deckId: string;
  onCreate: (cards: Card[]) => Promise<void>;
  onCancel: () => void;
}

export default function BulkEditor({ deckId, onCreate, onCancel }: BulkEditorProps) {
  const [text, setText] = useState<string>(t.bulk.sample);
  const [saving, setSaving] = useState(false);
  const preview = useMemo(() => previewBulkCards(text), [text]);
  const validCards = preview.cards.filter((card) => card.errors.length === 0);

  async function handleCreate() {
    setSaving(true);
    try {
      await onCreate(validCards.map((card) => createCardInput(deckId, card.frontText, card.backText, card.tags)));
      setText('');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack">
      <label>
        {t.bulk.quickInput}
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={8}
          placeholder="pojem: vysvětlení"
        />
      </label>
      <p className="muted">
        Každá dvojice patří na samostatný řádek. Základní formát je <code>pojem: vysvětlení</code>;
        starší zápis <code>otázka :: odpověď :: tagy</code> funguje dál.
      </p>
      <div className="preview-list">
        {preview.cards.slice(0, 8).map((card, index) => (
          <div className={`preview-row ${card.errors.length ? 'invalid' : ''}`} key={`${card.frontText}-${index}`}>
            <strong>{card.frontText || t.import.noQuestion}</strong>
            <span>{card.backText || t.import.noAnswer}</span>
            <small>{card.errors.join(' ') || card.tags.join(', ') || t.import.noTags}</small>
          </div>
        ))}
      </div>
      <p className="muted">{t.bulk.ready(validCards.length)}</p>
      <div className="button-row">
        <button className="primary-button" type="button" disabled={validCards.length === 0 || saving} onClick={handleCreate}>
          {saving ? t.bulk.creating : t.bulk.create(validCards.length)}
        </button>
        <button className="secondary-button" type="button" onClick={onCancel}>{t.common.cancel}</button>
      </div>
    </div>
  );
}
