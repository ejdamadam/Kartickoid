import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Modal from '../components/Modal';
import DeckForm from '../components/DeckForm';
import { createDeckGroupInput, createDeckInput, db, deleteDeckCascade } from '../db/database';
import type { Card, Deck, DeckGroup, DeckSummary, ReviewLog } from '../types';
import { formatDateTime, nowIso, startOfTodayIso } from '../utils/date';
import { createBackupZipFile } from '../services/exportImport';
import { getOneDriveSettings, uploadOneDriveBackup, type OneDriveSettings } from '../services/oneDriveSync';
import { t } from '../i18n';

interface HomePageProps {
  refreshKey: number;
  onOpenDeck: (deckId: string) => void;
  onChanged: () => void;
  onCustomStudy: (deckIds: string[], tags: string[]) => void;
}

let cachedHomeState: { summaries: DeckSummary[]; groups: DeckGroup[]; allCards: Card[] } = {
  summaries: [],
  groups: [],
  allCards: []
};

export default function HomePage({ refreshKey, onOpenDeck, onChanged, onCustomStudy }: HomePageProps) {
  const [summaries, setSummaries] = useState<DeckSummary[]>(() => cachedHomeState.summaries);
  const [groups, setGroups] = useState<DeckGroup[]>(() => cachedHomeState.groups);
  const [allCards, setAllCards] = useState<Card[]>(() => cachedHomeState.allCards);
  const [editingDeck, setEditingDeck] = useState<Deck | 'new'>();
  const [editingGroup, setEditingGroup] = useState<DeckGroup | 'new'>();
  const [assigningGroup, setAssigningGroup] = useState<DeckGroup>();
  const [selectedAssignDecks, setSelectedAssignDecks] = useState<string[]>([]);
  const [customStudyOpen, setCustomStudyOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
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
      db.deckGroups.toArray(),
      db.decks.toArray(),
      db.cards.toArray(),
      db.reviewLogs.toArray()
    ]).then(([deckGroups, decks, cards, logs]) => {
      if (!active) return;
      const nextSummaries = buildDeckSummaries(decks, cards, logs);
      const nextGroups = deckGroups.sort((a, b) => a.name.localeCompare(b.name, 'cs'));
      cachedHomeState = { summaries: nextSummaries, groups: nextGroups, allCards: cards };
      setAllCards(cards);
      setSummaries(nextSummaries);
      setGroups(nextGroups);
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

  const homeDeckLayout = useMemo(() => {
    const q = query.toLowerCase().trim();
    const groupNameById = new Map(groups.map((group) => [group.id, group.name.toLowerCase()]));
    const matches = summaries.filter((summary) => {
      if (!q) return true;
      return summary.deck.name.toLowerCase().includes(q)
        || summary.deck.description?.toLowerCase().includes(q)
        || groupNameById.get(summary.deck.groupId ?? '')?.includes(q);
    });

    return {
      ungrouped: matches.filter((summary) => !summary.deck.groupId || !groupNameById.has(summary.deck.groupId)),
      grouped: groups.map((group) => ({
        group,
        summaries: matches.filter((summary) => summary.deck.groupId === group.id)
      })).filter((item) => item.summaries.length > 0 || !q)
    };
  }, [groups, summaries, query]);

  const assignableDecks = useMemo(() => (
    assigningGroup
      ? summaries.filter((summary) => summary.deck.groupId !== assigningGroup.id)
      : []
  ), [assigningGroup, summaries]);

  async function saveDeck(values: { name: string; description: string; groupId?: string }) {
    try {
      if (editingDeck === 'new') {
        const deck = createDeckInput(values.name, values.description);
        deck.groupId = values.groupId;
        const deckId = await db.decks.add(deck);
        setEditingDeck(undefined);
        onChanged();
        onOpenDeck(deckId);
      } else if (editingDeck) {
        await db.decks.update(editingDeck.id, {
          name: values.name.trim(),
          description: values.description.trim(),
          groupId: values.groupId,
          updatedAt: nowIso()
        });
        setEditingDeck(undefined);
        onChanged();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    }
  }

  async function saveGroup(values: { name: string }) {
    try {
      if (editingGroup === 'new') {
        await db.deckGroups.add(createDeckGroupInput(values.name));
      } else if (editingGroup) {
        await db.deckGroups.update(editingGroup.id, {
          name: values.name.trim(),
          updatedAt: nowIso()
        });
      }
      setEditingGroup(undefined);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    }
  }

  async function deleteGroup(group: DeckGroup) {
    const ok = window.confirm(`Smazat složku "${group.name}"? Balíčky zůstanou zachované a zobrazí se přímo na hlavní stránce.`);
    if (!ok) return;
    pendingScrollY.current = window.scrollY;
    try {
      await db.transaction('rw', db.deckGroups, db.decks, async () => {
        const decksInGroup = await db.decks.where('groupId').equals(group.id).toArray();
        await Promise.all(decksInGroup.map((deck) => db.decks.update(deck.id, { groupId: undefined, updatedAt: nowIso() })));
        await db.deckGroups.delete(group.id);
      });
      onChanged();
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

  function openAssignDecks(group: DeckGroup) {
    setAssigningGroup(group);
    setSelectedAssignDecks([]);
  }

  function toggleAssignDeck(deckId: string) {
    setSelectedAssignDecks((ids) => ids.includes(deckId) ? ids.filter((id) => id !== deckId) : [...ids, deckId]);
  }

  async function assignDecksToGroup() {
    if (!assigningGroup || selectedAssignDecks.length === 0) return;
    pendingScrollY.current = window.scrollY;
    try {
      const timestamp = nowIso();
      await db.transaction('rw', db.decks, async () => {
        await Promise.all(selectedAssignDecks.map((deckId) => (
          db.decks.update(deckId, { groupId: assigningGroup.id, updatedAt: timestamp })
        )));
      });
      setAssigningGroup(undefined);
      setSelectedAssignDecks([]);
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
        </div>
      </div>

      {error && <p className="error-box">{error}</p>}

      {summaries.length > 0 && (
        <section className="dashboard-grid">
          <div className="dashboard-card primary recent-deck-card">
            <div>
              <p className="eyebrow">{t.home.recentDecks}</p>
              <strong className="recent-deck-name">{summaries[0].deck.name}</strong>
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
        <button className="home-create-button package-create-button" onClick={() => setEditingDeck('new')} aria-label={t.home.newDeck} title={t.home.newDeck}>
          <span className="plus-icon" aria-hidden="true" />
        </button>
        <button className="home-create-button folder-create-button" onClick={() => setEditingGroup('new')} aria-label="Nová složka" title="Nová složka">
          <span className="folder-icon" aria-hidden="true" />
        </button>
      </div>

      {homeDeckLayout.ungrouped.length > 0 && (
        <div className="deck-grid">
          {homeDeckLayout.ungrouped.map((summary) => (
            <DeckCard
              key={summary.deck.id}
              summary={summary}
              onOpen={() => onOpenDeck(summary.deck.id)}
              onEdit={() => setEditingDeck(summary.deck)}
              onDelete={() => deleteDeck(summary.deck)}
            />
          ))}
        </div>
      )}

      {homeDeckLayout.grouped.length > 0 && (
      <div className="deck-group-list">
        {homeDeckLayout.grouped.map(({ group, summaries: groupSummaries }) => {
          const groupKey = group.id;
          const expanded = query.trim() ? true : expandedGroups[groupKey] ?? true;
          return (
            <section className="deck-group" key={groupKey}>
              <header className="deck-group-header">
                <button
                  className="deck-group-toggle"
                  onClick={() => setExpandedGroups((state) => ({ ...state, [groupKey]: !expanded }))}
                  aria-expanded={expanded}
                >
                  <span className="deck-group-chevron">{expanded ? '⌄' : '›'}</span>
                  <span>{group.name}</span>
                  <small>{groupSummaries.length} balíčků</small>
                </button>
                <div className="deck-group-actions">
                  <button className="round-icon-button" type="button" onClick={() => openAssignDecks(group)} aria-label={`Přidat balíčky do složky ${group.name}`} title="Přidat balíčky do složky">
                    <span className="plus-icon" aria-hidden="true" />
                  </button>
                  <button className="round-icon-button" type="button" onClick={() => setEditingGroup(group)} aria-label={`Upravit složku ${group.name}`} title={t.common.edit}>
                    <span className="pencil-icon" aria-hidden="true" />
                  </button>
                  <button className="round-icon-button danger" type="button" onClick={() => void deleteGroup(group)} aria-label={`Smazat složku ${group.name}`} title={t.common.delete}>
                    <span className="close-icon" aria-hidden="true" />
                  </button>
                </div>
              </header>
              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div
                    className="deck-group-content"
                    initial={{ height: 0, opacity: 0, y: -6 }}
                    animate={{ height: 'auto', opacity: 1, y: 0 }}
                    exit={{ height: 0, opacity: 0, y: -6 }}
                    transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <div className="deck-grid">
                      {groupSummaries.map((summary) => (
                        <DeckCard
                          key={summary.deck.id}
                          summary={summary}
                          onOpen={() => onOpenDeck(summary.deck.id)}
                          onEdit={() => setEditingDeck(summary.deck)}
                          onDelete={() => deleteDeck(summary.deck)}
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          );
        })}
      </div>
      )}

      {customStudyOpen && (
        <Modal title="Procvičit více sad" onClose={() => setCustomStudyOpen(false)}>
          <div className="stack custom-study-modal">
            <p><strong>1. Vyberte sady:</strong></p>
            <div className="deck-selector-list">
              {summaries.map(s => (
                <label key={s.deck.id} className={`chip deck-select-chip ${selectedDecks.includes(s.deck.id) ? 'selected' : ''}`}>
                  <input type="checkbox" checked={selectedDecks.includes(s.deck.id)} onChange={() => toggleDeckSelection(s.deck.id)} />
                  {s.deck.name}
                </label>
              ))}
            </div>
            
            {availableTags.length > 0 && (
                <>
                    <p className="custom-study-step"><strong>2. Filtrovat podle tagů (volitelné):</strong></p>
                    <div className="tag-selector-list">
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

            <div className="custom-study-actions">
              <button
                className="primary-button full-width"
                disabled={selectedDecks.length === 0}
                onClick={() => {
                    onCustomStudy(selectedDecks, selectedTags);
                    setCustomStudyOpen(false);
                }}
            >
              Spustit procvičování
            </button>
            </div>
          </div>
        </Modal>
      )}

      {editingDeck && (
        <Modal title={editingDeck === 'new' ? t.home.newDeck : t.home.editDeck} onClose={() => setEditingDeck(undefined)}>
          <DeckForm
            deck={editingDeck === 'new' ? undefined : editingDeck}
            groups={groups}
            onSubmit={saveDeck}
            onCancel={() => setEditingDeck(undefined)}
          />
        </Modal>
      )}

      {editingGroup && (
        <Modal title={editingGroup === 'new' ? 'Nová složka' : 'Upravit složku'} onClose={() => setEditingGroup(undefined)}>
          <DeckGroupForm
            group={editingGroup === 'new' ? undefined : editingGroup}
            onSubmit={saveGroup}
            onCancel={() => setEditingGroup(undefined)}
          />
        </Modal>
      )}

      {assigningGroup && (
        <Modal title={`Přidat balíčky do složky ${assigningGroup.name}`} onClose={() => setAssigningGroup(undefined)}>
          <div className="stack">
            {assignableDecks.length === 0 ? (
              <p className="muted">Všechny existující balíčky už jsou v této složce.</p>
            ) : (
              <div className="deck-selector-list">
                {assignableDecks.map((summary) => (
                  <label key={summary.deck.id} className={`chip deck-select-chip ${selectedAssignDecks.includes(summary.deck.id) ? 'selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={selectedAssignDecks.includes(summary.deck.id)}
                      onChange={() => toggleAssignDeck(summary.deck.id)}
                    />
                    {summary.deck.name}
                  </label>
                ))}
              </div>
            )}
            <div className="button-row">
              <button className="primary-button" type="button" disabled={selectedAssignDecks.length === 0} onClick={() => void assignDecksToGroup()}>
                Přidat vybrané balíčky
              </button>
              <button className="secondary-button" type="button" onClick={() => setAssigningGroup(undefined)}>{t.common.cancel}</button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}

function DeckCard({ summary, onOpen, onEdit, onDelete }: {
  summary: DeckSummary;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="deck-card">
      <div className="deck-card-actions" aria-label="Akce balíčku">
        <button className="round-icon-button" type="button" onClick={onEdit} aria-label={`Upravit balíček ${summary.deck.name}`} title={t.common.edit}>
          <span className="pencil-icon" aria-hidden="true" />
        </button>
        <button className="round-icon-button danger" type="button" onClick={onDelete} aria-label={`Smazat balíček ${summary.deck.name}`} title={t.common.delete}>
          <span className="close-icon" aria-hidden="true" />
        </button>
      </div>
      <button className="deck-open" onClick={onOpen}>
        <span className="deck-title">{summary.deck.name}</span>
        {summary.deck.description && <span className="deck-description">{summary.deck.description}</span>}
      </button>
      <div className="metric-grid">
        <span><strong>{summary.cardCount}</strong> {t.home.cards}</span>
        <span><strong>{summary.dueCount}</strong> {t.common.today}</span>
        <span><strong>{summary.reviewedToday}</strong> {t.home.reviewed}</span>
      </div>
    </article>
  );
}

function DeckGroupForm({ group, onSubmit, onCancel }: {
  group?: DeckGroup;
  onSubmit: (values: { name: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(group?.name ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSubmit({ name });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="stack" onSubmit={handleSubmit}>
      <label>
        Název složky
        <input value={name} onChange={(event) => setName(event.target.value)} required autoFocus />
      </label>
      <div className="button-row">
        <button className="primary-button" disabled={saving} type="submit">{saving ? t.common.saving : t.common.save}</button>
        <button className="secondary-button" type="button" onClick={onCancel}>{t.common.cancel}</button>
      </div>
    </form>
  );
}

function buildDeckSummaries(decks: Deck[], cards: Card[], logs: ReviewLog[]): DeckSummary[] {
  const now = new Date();
  const today = startOfTodayIso();
  const summariesByDeckId = new Map<string, DeckSummary>();

  decks.forEach((deck) => {
    summariesByDeckId.set(deck.id, {
      deck,
      cardCount: 0,
      dueCount: 0,
      newCount: 0,
      reviewedToday: 0,
      lastReviewedAt: deck.updatedAt
    });
  });

  cards.forEach((card) => {
    const summary = summariesByDeckId.get(card.deckId);
    if (!summary) return;
    summary.cardCount += 1;
    if (new Date(card.dueAt) <= now) summary.dueCount += 1;
    if (card.repetitions === 0 && card.lapses === 0) summary.newCount += 1;
  });

  logs.forEach((log) => {
    const summary = summariesByDeckId.get(log.deckId);
    if (!summary) return;
    if (log.reviewedAt >= today) summary.reviewedToday += 1;
    if (!summary.lastReviewedAt || log.reviewedAt > summary.lastReviewedAt) {
      summary.lastReviewedAt = log.reviewedAt;
    }
  });

  return Array.from(summariesByDeckId.values())
    .sort((a, b) => (b.lastReviewedAt ?? '').localeCompare(a.lastReviewedAt ?? ''));
}
