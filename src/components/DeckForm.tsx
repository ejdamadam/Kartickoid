import { useState, type FormEvent } from 'react';
import type { Deck } from '../types';
import { t } from '../i18n';

interface DeckFormProps {
  deck?: Deck;
  onSubmit: (values: { name: string; description: string }) => Promise<void>;
  onCancel: () => void;
}

export default function DeckForm({ deck, onSubmit, onCancel }: DeckFormProps) {
  const [name, setName] = useState(deck?.name ?? '');
  const [description, setDescription] = useState(deck?.description ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSubmit({ name, description });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="stack" onSubmit={handleSubmit}>
      <label>
        Název
        <input value={name} onChange={(event) => setName(event.target.value)} required autoFocus />
      </label>
      <label>
        Popis
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} />
      </label>
      <div className="button-row">
        <button className="primary-button" disabled={saving} type="submit">{saving ? t.common.saving : t.common.save}</button>
        <button className="secondary-button" type="button" onClick={onCancel}>{t.common.cancel}</button>
      </div>
    </form>
  );
}
