import { useMemo, useState } from 'react';
import { t } from '../i18n';

interface TagInputProps {
  value: string[];
  suggestions: string[];
  onChange: (tags: string[]) => void;
  label?: string;
}

export default function TagInput({ value, suggestions, onChange, label = 'Tagy' }: TagInputProps) {
  const [draft, setDraft] = useState('');
  const normalizedDraft = draft.trim().toLowerCase();
  const filteredSuggestions = useMemo(() => (
    suggestions
      .filter((tag) => !value.includes(tag))
      .filter((tag) => !normalizedDraft || tag.includes(normalizedDraft))
      .slice(0, 6)
  ), [normalizedDraft, suggestions, value]);

  function addTag(tag: string) {
    const normalized = tag.trim().toLowerCase();
    if (!normalized || value.includes(normalized)) return;
    onChange([...value, normalized]);
    setDraft('');
  }

  function removeTag(tag: string) {
    onChange(value.filter((item) => item !== tag));
  }

  return (
    <label className="tag-input-label">
      {label}
      <div className="tag-combobox">
        <div className="chip-row">
          {value.map((tag) => (
            <button className="chip removable" type="button" key={tag} onClick={() => removeTag(tag)} aria-label={t.tags.remove(tag)}>
              {tag}<span aria-hidden="true">×</span>
            </button>
          ))}
          <input
            className="chip-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ',') {
                event.preventDefault();
                addTag(draft);
              }
              if (event.key === 'Backspace' && !draft && value.length > 0) {
                removeTag(value[value.length - 1]);
              }
            }}
            placeholder={value.length === 0 ? t.tags.add : ''}
          />
        </div>
        {(filteredSuggestions.length > 0 || normalizedDraft) && (
          <div className="tag-suggestions" role="listbox">
            {filteredSuggestions.map((tag) => (
              <button 
                type="button" 
                key={tag} 
                onMouseDown={(e) => {
                  e.preventDefault(); // Zabrání ztrátě focusu z inputu
                  addTag(tag);
                }}
              >
                {tag}
              </button>
            ))}
            {normalizedDraft && !value.includes(normalizedDraft) && !filteredSuggestions.includes(normalizedDraft) && (
              <button 
                type="button" 
                onMouseDown={(e) => {
                  e.preventDefault();
                  addTag(normalizedDraft);
                }}
              >
                {t.tags.create(normalizedDraft)}
              </button>
            )}
          </div>
        )}
      </div>
    </label>
  );
}
