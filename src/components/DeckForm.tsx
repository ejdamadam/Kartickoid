import { useState, type FormEvent } from 'react';
import type { Deck, DeckGroup } from '../types';
import { t } from '../i18n';

interface DeckFormProps {
  deck?: Deck;
  groups?: DeckGroup[];
  onSubmit: (values: { name: string; description: string; groupId?: string }) => Promise<void>;
  onCancel: () => void;
}

export default function DeckForm({ deck, groups = [], onSubmit, onCancel }: DeckFormProps) {
  const [name, setName] = useState(deck?.name ?? '');
  const [description, setDescription] = useState(deck?.description ?? '');
  const [groupId, setGroupId] = useState(deck?.groupId ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSubmit({ name, description, groupId: groupId || undefined });
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
      {groups.length > 0 && (
        <label>
          Složka
          <select value={groupId} onChange={(event) => setGroupId(event.target.value)}>
            <option value="">Mimo složky</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>{group.name}</option>
            ))}
          </select>
        </label>
      )}
      <div className="button-row">
        <button className="primary-button" disabled={saving} type="submit">{saving ? t.common.saving : t.common.save}</button>
        <button className="secondary-button" type="button" onClick={onCancel}>{t.common.cancel}</button>
      </div>
    </form>
  );
}
