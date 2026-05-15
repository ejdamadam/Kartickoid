import { useEffect, useMemo, useState } from 'react';
import Modal from '../components/Modal';
import DeckForm from '../components/DeckForm';
import { createDeckInput, db, deleteDeckCascade, getDeckSummaries } from '../db/database';
import type { Deck, DeckSummary } from '../types';
import { formatDateTime, nowIso } from '../utils/date';
import { t } from '../i18n';

interface HomePageProps {
  refreshKey: number;
  onOpenDeck: (deckId: string) => void;
  onChanged: () => void;
}

export default function HomePage({ refreshKey, onOpenDeck, onChanged }: HomePageProps) {
  const [summaries, setSummaries] = useState<DeckSummary[]>([]);
  const [editingDeck, setEditingDeck] = useState<Deck | 'new'>();
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string>();

  useEffect(() => {
    getDeckSummaries().then(setSummaries).catch((err) => setError(err.message));
  }, [refreshKey]);

  const dashboard = useMemo(() => ({
    due: summaries.reduce((sum, item) => sum + item.dueCount, 0),
    fresh: summaries.reduce((sum, item) => sum + item.newCount, 0),
    studied: summaries.reduce((sum, item) => sum + item.reviewedToday, 0),
    quickDeck: summaries.find((item) => item.dueCount > 0)?.deck ?? summaries[0]?.deck
  }), [summaries]);

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
    try {
      await deleteDeckCascade(deck.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    }
  }

  const filteredSummaries = summaries.filter((summary) => (
    !query.trim()
    || summary.deck.name.toLowerCase().includes(query.trim().toLowerCase())
    || summary.deck.description.toLowerCase().includes(query.trim().toLowerCase())
  ));

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t.app.localStudy}</p>
          <h1>{t.home.title}</h1>
        </div>
        <div className="toolbar">
          <button className="primary-button" onClick={() => setEditingDeck('new')}>{t.home.newDeck}</button>
        </div>
      </div>

      {error && <p className="error-box">{error}</p>}

      <section className="dashboard-grid">
        <article className="dashboard-card primary">
          <p className="eyebrow">{t.home.dueCards}</p>
          <strong>{dashboard.due}</strong>
          <span>{t.deck.due}</span>
          {dashboard.quickDeck && (
            <button className="light-button" onClick={() => onOpenDeck(dashboard.quickDeck.id)}>{t.home.continue}: {dashboard.quickDeck.name}</button>
          )}
        </article>
        <article className="dashboard-card">
          <p className="eyebrow">{t.home.newCards}</p>
          <strong>{dashboard.fresh}</strong>
          <span>{t.home.newCards}</span>
        </article>
        <article className="dashboard-card">
          <p className="eyebrow">{t.home.streak}</p>
          <strong>{dashboard.studied > 0 ? '1' : '0'}</strong>
          <span>{t.home.streak}</span>
        </article>
        <article className="dashboard-card">
          <p className="eyebrow">{t.home.studiedToday}</p>
          <strong>{dashboard.studied}</strong>
          <span>{t.home.studiedToday}</span>
        </article>
      </section>

      <label className="home-search">
        {t.common.search}
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.home.searchPlaceholder} />
      </label>

      <div className="section-title">
        <h2>{t.home.recentDecks}</h2>
        <span>{filteredSummaries.length} {t.deck.total}</span>
      </div>

      {filteredSummaries.length === 0 ? (
        <div className="empty-state">
          <h2>{t.home.emptyTitle}</h2>
          <p>{t.home.emptyBody}</p>
          <button className="primary-button" onClick={() => setEditingDeck('new')}>{t.home.createDeck}</button>
        </div>
      ) : (
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
              <p className="muted">{t.home.lastStudied}: {formatDateTime(summary.lastReviewedAt)}</p>
              <div className="button-row">
                <button className="secondary-button" onClick={() => setEditingDeck(summary.deck)}>{t.common.edit}</button>
                <button className="danger-button" onClick={() => deleteDeck(summary.deck)}>{t.common.delete}</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {editingDeck && (
        <Modal title={editingDeck === 'new' ? t.home.newDeck : t.home.editDeck} onClose={() => setEditingDeck(undefined)}>
          <DeckForm deck={editingDeck === 'new' ? undefined : editingDeck} onSubmit={saveDeck} onCancel={() => setEditingDeck(undefined)} />
        </Modal>
      )}
    </section>
  );
}
