import { useEffect, useMemo, useRef, useState } from 'react';
import Modal from '../components/Modal';
import DeckForm from '../components/DeckForm';
import { createDeckInput, db, deleteDeckCascade } from '../db/database';
import type { Deck, DeckSummary } from '../types';
import { formatDateTime, nowIso } from '../utils/date';
import { createBackupZipFile } from '../services/exportImport';
import { getOneDriveSettings, uploadOneDriveBackup, type OneDriveSettings } from '../services/oneDriveSync';
import { t } from '../i18n';

interface HomePageProps {
  refreshKey: number;
  onOpenDeck: (deckId: string) => void;
  onChanged: () => void;
  onCustomStudy: (deckIds: string[], tags: string[]) => void;
}

export default function HomePage({ refreshKey, onOpenDeck, onChanged, onCustomStudy }: HomePageProps) {
  const [summaries, setSummaries] = useState<DeckSummary[]>([]);
  const [allCards, setAllCards] = useState<any[]>([]);
  const [editingDeck, setEditingDeck] = useState<Deck | 'new'>();
  const [customStudyOpen, setCustomStudyOpen] = useState(false);
  const [selectedDecks, setSelectedDecks] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string>();
  const [oneDriveSettings, setOneDriveSettings] = useState<OneDriveSettings>();
  const [syncStatus, setSyncStatus] = useState<string>();
  const pendingScrollY = useRef<number | undefined>(undefined);

  useEffect(() => {
    let active = true;
    Promise.all([
      db.decks.toArray(),
      db.cards.toArray(),
      db.reviewLogs.toArray()
    ]).then(([decks, cards, logs]) => {
      if (!active) return;
      setAllCards(cards);
      const nextSummaries: DeckSummary[] = decks.map(deck => {
        const deckCards = cards.filter(c => c.deckId === deck.id);
        const deckLogs = logs.filter(l => l.deckId === deck.id);
        const now = new Date();
        const sortedLogs = [...deckLogs].sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt));
        return {
          deck,
          cardCount: deckCards.length,
          dueCount: deckCards.filter(c => new Date(c.dueAt) <= now).length,
          newCount: deckCards.filter(c => c.repetitions === 0 && c.lapses === 0).length,
          reviewedToday: deckLogs.filter(l => l.reviewedAt >= now.toISOString().slice(0, 10)).length,
          lastReviewedAt: sortedLogs[0]?.reviewedAt ?? deck.updatedAt
        };
      });
      setSummaries(nextSummaries.sort((a, b) => (b.lastReviewedAt ?? '').localeCompare(a.lastReviewedAt ?? '')));
      if (pendingScrollY.current !== undefined) {
        const scrollY = pendingScrollY.current;
        pendingScrollY.current = undefined;
        requestAnimationFrame(() => window.scrollTo(0, scrollY));
      }
    });
    return () => { active = false; };
  }, [refreshKey]);

  useEffect(() => {
    let active = true;
    getOneDriveSettings()
      .then((settings) => {
        if (active) setOneDriveSettings(settings?.connected ? settings : undefined);
      })
      .catch(() => {
        if (active) setOneDriveSettings(undefined);
      });
    return () => { active = false; };
  }, [refreshKey]);

  const availableTags = useMemo(() => {
    if (selectedDecks.length === 0) return [];
    const tags = new Set<string>();
    allCards
      .filter(card => selectedDecks.includes(card.deckId))
      .forEach(card => card.tags.forEach((tag: string) => tags.add(tag)));
    return Array.from(tags).sort((a, b) => a.localeCompare(b, 'cs'));
  }, [selectedDecks, allCards]);

  const filteredSummaries = useMemo(() => {
    const q = query.toLowerCase().trim();
    return summaries.filter(s => s.deck.name.toLowerCase().includes(q) || s.deck.description?.toLowerCase().includes(q));
  }, [summaries, query]);

  async function saveDeck(values: { name: string; description: string }) {
    try {
      if (editingDeck === 'new') {
        const deck = createDeckInput(values.name, values.description);
        const deckId = await db.decks.add(deck);
        setEditingDeck(undefined);
        onChanged();
        onOpenDeck(deckId);
      } else if (editingDeck) {
        await db.decks.update(editingDeck.id, {
          name: values.name.trim(),
          description: values.description.trim(),
          updatedAt: nowIso()
        });
        setEditingDeck(undefined);
        onChanged();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    }
  }

  async function deleteDeck(deck: Deck) {
    const ok = window.confirm(t.deck.deleteConfirm(deck.name));
    if (!ok) return;
    pendingScrollY.current = window.scrollY;
    try {
      await deleteDeckCascade(deck.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    }
  }

  async function syncOneDriveBackup() {
    setError(undefined);
    setSyncStatus('Připravuji ZIP zálohu…');
    try {
      const file = await createBackupZipFile();
      setSyncStatus('Nahrávám zálohu na OneDrive…');
      await uploadOneDriveBackup(file.blob, file.name);
      const nextSettings = await getOneDriveSettings();
      setOneDriveSettings(nextSettings?.connected ? nextSettings : undefined);
      setSyncStatus(`Záloha nahrána: ${formatDateTime(nextSettings?.lastBackupAt || nowIso())}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
      setSyncStatus(undefined);
    }
  }

  function toggleDeckSelection(id: string) {
    setSelectedDecks(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  }

  function toggleTagSelection(tag: string) {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  }

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t.app.name}</p>
          <h1>{t.home.title}</h1>
        </div>
        <div className="toolbar">
          <button className="secondary-button" onClick={() => setCustomStudyOpen(true)}>Procvičit více sad</button>
          <button className="primary-button" onClick={() => setEditingDeck('new')}>{t.home.newDeck}</button>
        </div>
      </div>

      {error && <p className="error-box">{error}</p>}

      {summaries.length > 0 && (
        <section className="dashboard-grid">
          <div className="dashboard-card primary">
            <div>
              <p className="eyebrow">{t.home.recentDecks}</p>
              <strong>{summaries[0].deck.name}</strong>
              <p className="last-studied">{t.home.lastStudied}: {formatDateTime(summaries[0].lastReviewedAt)}</p>
            </div>
            <button className="light-button" onClick={() => onOpenDeck(summaries[0].deck.id)}>{t.home.continue}</button>
          </div>
          <div className="dashboard-card">
            <div>
              <p className="eyebrow">{t.home.dueCards}</p>
              <strong>{summaries.reduce((acc, s) => acc + s.dueCount, 0)}</strong>
            </div>
            <span>{t.home.cards}</span>
          </div>
          <div className="dashboard-card">
            <div>
              <p className="eyebrow">{t.home.studiedToday}</p>
              <strong>{summaries.reduce((acc, s) => acc + s.reviewedToday, 0)}</strong>
            </div>
            <span>{t.home.reviewed}</span>
          </div>
          {oneDriveSettings && (
            <div className="dashboard-card sync-card">
              <div>
                <p className="eyebrow">OneDrive</p>
                <strong>{syncStatus ? 'Pracuji…' : 'Záloha'}</strong>
                <p className="last-studied">
                  {syncStatus
                    ?? (oneDriveSettings.lastBackupAt ? `Naposledy: ${formatDateTime(oneDriveSettings.lastBackupAt)}` : 'Zatím bez cloudové zálohy')}
                </p>
                <small>Externí synchronizace je zatím ve vývoji.</small>
              </div>
              <button className="light-button" disabled={Boolean(syncStatus)} onClick={() => void syncOneDriveBackup()}>
                Synchronizovat
              </button>
            </div>
          )}
        </section>
      )}

      <div className="home-search">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.home.searchPlaceholder} />
      </div>

      <div className="deck-grid">
        {filteredSummaries.map((summary) => (
          <article className="deck-card" key={summary.deck.id}>
            <button className="deck-open" onClick={() => onOpenDeck(summary.deck.id)}>
              <span className="deck-title">{summary.deck.name}</span>
              {summary.deck.description && <span className="deck-description">{summary.deck.description}</span>}
            </button>
            <div className="metric-grid">
              <span><strong>{summary.cardCount}</strong> {t.home.cards}</span>
              <span><strong>{summary.dueCount}</strong> {t.common.today}</span>
              <span><strong>{summary.reviewedToday}</strong> {t.home.reviewed}</span>
            </div>
            <div className="button-row">
                <button className="tiny-button" onClick={() => setEditingDeck(summary.deck)}>{t.common.edit}</button>
                <button className="tiny-button danger" onClick={() => deleteDeck(summary.deck)}>{t.common.delete}</button>
            </div>
          </article>
        ))}
      </div>

      {customStudyOpen && (
        <Modal title="Procvičit více sad" onClose={() => setCustomStudyOpen(false)}>
          <div className="stack">
            <p><strong>1. Vyberte sady:</strong></p>
            <div className="deck-selector-list" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px', maxHeight: '200px', overflow: 'auto', padding: '5px' }}>
              {summaries.map(s => (
                <label key={s.deck.id} className={`chip ${selectedDecks.includes(s.deck.id) ? 'selected' : ''}`} style={{ cursor: 'pointer', textAlign: 'center' }}>
                  <input type="checkbox" checked={selectedDecks.includes(s.deck.id)} onChange={() => toggleDeckSelection(s.deck.id)} style={{ display: 'none' }} />
                  {s.deck.name}
                </label>
              ))}
            </div>
            
            {availableTags.length > 0 && (
                <>
                    <p style={{ marginTop: '1rem' }}><strong>2. Filtrovat podle tagů (volitelné):</strong></p>
                    <div className="tag-selector-list" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', maxHeight: '150px', overflow: 'auto', padding: '5px' }}>
                        {availableTags.map(tag => (
                            <button 
                                key={tag} 
                                className={`chip ${selectedTags.includes(tag) ? 'selected' : ''}`}
                                onClick={() => toggleTagSelection(tag)}
                            >
                                {tag}
                            </button>
                        ))}
                    </div>
                </>
            )}

            <button 
                className="primary-button wide" 
                style={{ marginTop: '1.5rem' }}
                disabled={selectedDecks.length === 0}
                onClick={() => {
                    onCustomStudy(selectedDecks, selectedTags);
                    setCustomStudyOpen(false);
                }}
            >
              Spustit procvičování
            </button>
          </div>
        </Modal>
      )}

      {editingDeck && (
        <Modal title={editingDeck === 'new' ? t.home.newDeck : t.home.editDeck} onClose={() => setEditingDeck(undefined)}>
          <DeckForm
            deck={editingDeck === 'new' ? undefined : editingDeck}
            onSubmit={saveDeck}
            onCancel={() => setEditingDeck(undefined)}
          />
        </Modal>
      )}
    </section>
  );
}
