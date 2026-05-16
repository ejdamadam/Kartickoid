import { useEffect, useMemo, useRef, useState } from 'react';
import BulkEditor from '../components/BulkEditor';
import CardForm, { type CardFormValues } from '../components/CardForm';
import CardMediaList from '../components/CardMediaList';
import RichTextDisplay from '../components/RichTextDisplay';
import Modal from '../components/Modal';
import CardStatistics from '../components/CardStatistics';
import { addMediaToCard, createCardInput, db, deleteCardCascade, removeMediaFromCard } from '../db/database';
import { AUDIO_FILE_ACCEPT, processMediaForCard } from '../services/mediaProcessing';
import { cardsToCsv } from '../services/exporters/csvExporter';
import { downloadDeckBackup } from '../services/exportImport';
import { getDeckStats, type DeckStats } from '../services/stats';
import type { Card, CardSide, Deck, Media, ReviewLog, StudySessionSource } from '../types';
import { formatDate, formatDateTime, nowIso, startOfTodayIso } from '../utils/date';
import { t } from '../i18n';
import { createId } from '../utils/id';

interface DeckPageProps {
  deckId: string;
  refreshKey: number;
  onBack: () => void;
  onStudy: (options?: { source?: StudySessionSource; limit?: number; order?: 'default' | 'random' }) => void;
  onChanged: () => void;
}

type EditableCard = Card | 'new';
type DeckStudySource = Extract<StudySessionSource, 'all' | 'lapsed' | 'mistakes' | 'new' | 'due'>;

export default function DeckPage({ deckId, refreshKey, onBack, onStudy, onChanged }: DeckPageProps) {
  const [deck, setDeck] = useState<Deck>();
  const [cards, setCards] = useState<Card[]>([]);
  const [media, setMedia] = useState<Media[]>([]);
  const [logs, setLogs] = useState<ReviewLog[]>([]);
  const [editingCard, setEditingCard] = useState<EditableCard>();
  const [bulkOpen, setBulkOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'stats'>('list');
  const [deckStats, setDeckStats] = useState<DeckStats>();
  const [studySource, setStudySource] = useState<DeckStudySource>('all');
  const [studyLimit, setStudyLimit] = useState(0);
  const [studyOrder, setStudyOrder] = useState<'default' | 'random'>('default');
  const pendingScrollY = useRef<number | undefined>(undefined);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      db.decks.get(deckId),
      db.cards.where('deckId').equals(deckId).toArray(),
      db.media.toArray(),
      db.reviewLogs.where('deckId').equals(deckId).toArray()
    ])
      .then(([nextDeck, nextCards, nextMedia, nextLogs]) => {
        if (!active) return;
        setDeck(nextDeck);
        setCards(nextCards.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
        setMedia(nextMedia.filter((item) => nextCards.some((card) => card.id === item.cardId)));
        setLogs(nextLogs);
        setLoading(false);
        if (pendingScrollY.current !== undefined) {
          const scrollY = pendingScrollY.current;
          pendingScrollY.current = undefined;
          requestAnimationFrame(() => window.scrollTo(0, scrollY));
        }
      })
      .catch((err) => {
          if (active) {
            setError(err instanceof Error ? err.message : t.common.error);
            setLoading(false);
          }
      });

    return () => {
      active = false;
    };
  }, [deckId, refreshKey]);

  useEffect(() => {
    if (view === 'stats') {
        getDeckStats(deckId).then(setDeckStats);
    }
  }, [deckId, view, refreshKey]);

  const stats = useMemo(() => {
    const now = new Date();
    const today = startOfTodayIso();
    return {
      total: cards.length,
      due: cards.filter((card) => new Date(card.dueAt) <= now).length,
      fresh: cards.filter((card) => card.repetitions === 0 && card.lapses === 0).length,
      reviewedToday: logs.filter((log) => log.reviewedAt >= today).length
    };
  }, [cards, logs]);

  const studyCounts = useMemo(() => {
    const mistakeIds = new Set(logs.filter((log) => log.rating === 'again' || log.rating === 'hard').map((log) => log.cardId));
    const now = new Date();
    return {
      all: cards.length,
      due: cards.filter((card) => new Date(card.dueAt) <= now).length,
      lapsed: cards.filter((card) => card.lapses > 0 || card.ease <= 1.8).length,
      mistakes: cards.filter((card) => mistakeIds.has(card.id)).length,
      new: cards.filter((card) => card.repetitions === 0 && card.lapses === 0).length
    } satisfies Record<DeckStudySource, number>;
  }, [cards, logs]);

  const allTags = useMemo(() => (
    Array.from(new Set(cards.flatMap((card) => card.tags))).sort((a, b) => a.localeCompare(b, 'cs'))
  ), [cards]);

  const filteredCards = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return cards.filter((card) => {
      const matchesText = !normalizedQuery
        || card.frontText.toLowerCase().includes(normalizedQuery)
        || card.backText.toLowerCase().includes(normalizedQuery)
        || card.tags.some((tag) => tag.includes(normalizedQuery));
      const matchesTag = tagFilter.length === 0 || tagFilter.some((tag) => card.tags.includes(tag));
      return matchesText && matchesTag;
    });
  }, [cards, query, tagFilter]);

  async function flipSide(card: Card) {
    try {
      await db.cards.update(card.id, {
        frontText: card.backText,
        backText: card.frontText,
        updatedAt: nowIso()
      });
      const cardMedia = media.filter((item) => item.cardId === card.id);
      for (const item of cardMedia) {
        await db.media.update(item.id, {
          side: item.side === 'front' ? 'back' : 'front'
        });
      }
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    }
  }

  async function saveCard(values: CardFormValues) {
    try {
      if (editingCard === 'new') {
        const card = createCardInput(deckId, values.frontText, values.backText, values.tags);
        const cardId = await db.cards.add(card);
        for (const item of values.media) {
            await addMediaToCard({ ...item, cardId: cardId, deckId });
        }
      } else if (editingCard) {
        await db.cards.update(editingCard.id, {
          frontText: values.frontText.trim(),
          backText: values.backText.trim(),
          tags: values.tags,
          updatedAt: nowIso()
        });

        const currentMedia = await db.media.where('cardId').equals(editingCard.id).toArray();
        const submittedMediaIds = new Set(values.media.map(m => m.id));

        for (const m of currentMedia) {
            if (!submittedMediaIds.has(m.id)) {
                await removeMediaFromCard(m.id);
            }
        }

        for (const item of values.media) {
          if (!currentMedia.find(m => m.id === item.id)) {
            await addMediaToCard({ ...item, cardId: editingCard.id, deckId });
          }
        }
      }
      await db.decks.update(deckId, { updatedAt: nowIso() });
      setEditingCard(undefined);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    }
  }

  async function deleteCard(card: Card) {
    pendingScrollY.current = window.scrollY;
    try {
      await deleteCardCascade(card.id);
      await db.decks.update(deckId, { updatedAt: nowIso() });
      onChanged();
    } catch (err) {
      pendingScrollY.current = undefined;
      setError(err instanceof Error ? err.message : t.common.error);
    }
  }

  async function bulkCreate(nextCards: Card[]) {
    try {
      await db.cards.bulkAdd(nextCards);
      await db.decks.update(deckId, { updatedAt: nowIso() });
      setBulkOpen(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    }
  }

  function toggleTag(tag: string) {
    setTagFilter((selected) => (
      selected.includes(tag) ? selected.filter((item) => item !== tag) : [...selected, tag]
    ));
  }

  async function exportCsv() {
    if (!deck) return;
    const blob = new Blob([cardsToCsv(cards)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${deck.name.toLowerCase().replace(/[^a-z0-9]+/gi, '-') || 'deck'}-cards.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function exportDeck() {
    if (!deck) return;
    try {
      await downloadDeckBackup(deck.id, deck.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    }
  }

  async function duplicateDeck() {
    if (!deck) return;
    try {
      const timestamp = nowIso();
      const nextDeck: Deck = {
        ...deck,
        id: createId('deck'),
        name: `${deck.name} ${t.deck.copySuffix}`,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      const nextCards: Card[] = cards.map((card) => ({
        ...card,
        id: createId('card'),
        deckId: nextDeck.id,
        imageIds: [],
        createdAt: timestamp,
        updatedAt: timestamp,
        dueAt: timestamp,
        intervalDays: 0,
        repetitions: 0,
        lapses: 0
      }));
      const cardIdMap = new Map(cards.map((card, index) => [card.id, nextCards[index].id]));
      const nextMedia: Media[] = media
        .filter((item) => cardIdMap.has(item.cardId))
        .map((item) => ({
          ...item,
          id: createId('media'),
          deckId: nextDeck.id,
          cardId: cardIdMap.get(item.cardId)!,
          createdAt: timestamp
        }));
      const mediaByCard = new Map<string, string[]>();
      nextMedia.forEach((item) => {
        mediaByCard.set(item.cardId, [...(mediaByCard.get(item.cardId) ?? []), item.id]);
      });
      nextCards.forEach((card) => {
        card.imageIds = mediaByCard.get(card.id) ?? [];
      });
      await db.transaction('rw', db.decks, db.cards, db.media, async () => {
        await db.decks.add(nextDeck);
        await db.cards.bulkAdd(nextCards);
        await db.media.bulkAdd(nextMedia);
      });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    }
  }

  async function uploadMedia(card: Card, side: CardSide, file?: File) {
    if (!file) return;
    try {
      const item = await processMediaForCard(file, side);
      await addMediaToCard({ ...item, cardId: card.id, deckId });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.deck.imageError);
    }
  }

  async function removeMedia(mediaId: string) {
    pendingScrollY.current = window.scrollY;
    try {
      await removeMediaFromCard(mediaId);
      onChanged();
    } catch (err) {
      pendingScrollY.current = undefined;
      setError(err instanceof Error ? err.message : t.common.error);
    }
  }

  function startStudy() {
    const count = studyCounts[studySource];
    if (count === 0) {
      setError(emptyStudyMessage(studySource));
      return;
    }

    setError(undefined);
    onStudy({ source: studySource, limit: studyLimit, order: studyOrder });
  }

  if (!deck && !loading) {
    return (
      <section className="page">
        <button className="back-button" onClick={onBack}>← {t.common.back}</button>
        <p className="error-box">{t.deck.missingDeck}</p>
      </section>
    );
  }

  if (loading) {
      return <section className="page"><p className="muted">Načítám...</p></section>;
  }

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <h1>{deck?.name}</h1>
          {deck?.description && <p className="lead">{deck.description}</p>}
        </div>
        <div className="toolbar">
          <button className="primary-button" onClick={startStudy}>{t.deck.study}</button>
          <button className="secondary-button" onClick={() => setEditingCard('new')}>{t.deck.newCard}</button>
          <button className="secondary-button" onClick={() => setBulkOpen(true)}>{t.deck.bulkEditor}</button>
          <button className="secondary-button" onClick={exportCsv}>{t.deck.csvExport}</button>
          <button className="secondary-button" onClick={exportDeck}>{t.deck.exportDeck}</button>
          <button className="secondary-button" onClick={duplicateDeck}>{t.deck.duplicate}</button>
        </div>
      </div>

      {error && <p className="error-box">{error}</p>}

      <div className="stats-row">
        <span><strong>{stats.total}</strong> {t.deck.total}</span>
        <span><strong>{stats.due}</strong> {t.deck.due}</span>
        <span><strong>{stats.fresh}</strong> {t.deck.fresh}</span>
        <span><strong>{stats.reviewedToday}</strong> {t.deck.reviewedToday}</span>
      </div>

      <section className="panel stack study-options-panel">
        <div className="section-title">
          <h2>Volby procvičování</h2>
          <span>{studyCounts[studySource]} dostupných</span>
        </div>
        <div className="study-option-grid">
          {studySourceOptions.map((option) => (
            <button
              type="button"
              key={option.value}
              className={`choice-button ${studySource === option.value ? 'correct' : ''}`}
              onClick={() => setStudySource(option.value)}
            >
              <strong>{option.label}</strong>
              <small>{studyCounts[option.value]} kartiček</small>
            </button>
          ))}
        </div>
        <div className="study-controls-grid">
          <label>
            Počet kartiček
            <select value={studyLimit} onChange={(event) => setStudyLimit(Number(event.target.value))}>
              <option value={0}>Všechny dostupné</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </label>
          <label>
            Pořadí
            <select value={studyOrder} onChange={(event) => setStudyOrder(event.target.value as 'default' | 'random')}>
              <option value="default">Výchozí</option>
              <option value="random">Náhodné</option>
            </select>
          </label>
        </div>
      </section>

      <div className="mode-tabs narrow">
        <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>Kartičky</button>
        <button className={view === 'stats' ? 'active' : ''} onClick={() => setView('stats')}>Statistika</button>
      </div>

      {view === 'list' ? (
        <>
          <div className="filters">
            <label>
              {t.common.search}
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.deck.searchPlaceholder} />
            </label>
            <div className="tag-filter-panel" aria-label="Filtr tagů">
              {allTags.length === 0 ? (
                <span className="muted">{t.deck.tagsEmpty}</span>
              ) : allTags.map((tag) => (
                <button
                  className={`chip ${tagFilter.includes(tag) ? 'selected' : ''}`}
                  type="button"
                  key={tag}
                  onClick={() => toggleTag(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          <div className="card-list">
            {filteredCards.map((card) => {
              const cardMedia = media.filter((item) => item.cardId === card.id);
              return (
                <article className="study-card-preview" key={card.id}>
                  <div className="card-preview-columns">
                    <section>
                      <p className="side-label">{t.deck.frontSide}</p>
                      <div className="card-text"><RichTextDisplay content={card.frontText} /></div>
                      <CardMediaList media={cardMedia} side="front" onRemove={removeMedia} />
                      <MediaUploadButtonToolbar card={card} side='front' onUpload={uploadMedia} />
                    </section>
                    <section>
                      <p className="side-label">{t.deck.backSide}</p>
                      <div className="card-text"><RichTextDisplay content={card.backText} /></div>
                      <CardMediaList media={cardMedia} side="back" onRemove={removeMedia} />
                      <MediaUploadButtonToolbar card={card} side='back' onUpload={uploadMedia} />
                    </section>
                  </div>
                  <div className="tag-row">
                    {card.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}
                  </div>
                  <CardStatistics card={card} logs={logs} />
                  <p className="muted">{t.deck.nextReview}: {formatDate(card.dueAt)}</p>
                  <div className="button-row">
                    <button className="secondary-button" onClick={() => flipSide(card)}>Prohodit</button>
                    <button className="secondary-button" onClick={() => setEditingCard(card)}>{t.common.edit}</button>
                    <button className="danger-button" onClick={() => deleteCard(card)}>{t.common.delete}</button>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      ) : (
        <div className="deck-stats-view stack">
          {deckStats ? (
            <>
              <section className="panel stack">
                <h2>Rozdělení obtížnosti</h2>
                <div className="stats-row">
                  {Object.entries(deckStats.ratingDistribution).map(([rating, count]) => (
                    <div key={rating}>
                      <strong>{count}</strong>
                      <small style={{ display: 'block' }}>{rating}</small>
                    </div>
                  ))}
                </div>
              </section>

              <section className="panel stack">
                <h2>Týdenní aktivita</h2>
                <div className="mini-graph">
                  {deckStats.weeklyActivity.map((day) => (
                    <div className="mini-bar" key={day.label}>
                      <span style={{ height: `${Math.max(8, (day.count / Math.max(1, ...deckStats.weeklyActivity.map(d => d.count))) * 100)}%` }} />
                      <small>{day.label}</small>
                    </div>
                  ))}
                </div>
              </section>
              
              <section className="panel">
                <div className="stats-row">
                  <span><strong>{deckStats.cardCount}</strong> kartiček</span>
                  <span><strong>{deckStats.practicedCards}</strong> procvičeno</span>
                  <span><strong>{deckStats.correctAnswers}</strong> správně</span>
                  <span><strong>{deckStats.wrongAnswers}</strong> špatně</span>
                  <span><strong>{deckStats.successRate} %</strong> úspěšnost</span>
                  <span><strong>{deckStats.hardCards}</strong> těžkých</span>
                </div>
                <p>Celkový počet opakování: <strong>{deckStats.totalRepetitions}</strong></p>
                <p>Poslední procvičování: <strong>{deckStats.lastReviewedAt ? formatDateTime(deckStats.lastReviewedAt) : t.common.never}</strong></p>
              </section>
            </>
          ) : <p>Načítám statistiky...</p>}
        </div>
      )}

      {filteredCards.length === 0 && view === 'list' && (
        <div className="empty-state">
          <h2>{t.deck.noCardsTitle}</h2>
          <p>{t.deck.noCardsBody}</p>
        </div>
      )}

      {editingCard && (
        <Modal title={editingCard === 'new' ? t.cardForm.newTitle : t.cardForm.editTitle} onClose={() => setEditingCard(undefined)}>
          <CardForm
            card={editingCard === 'new' ? undefined : editingCard}
            existingMediaCount={editingCard === 'new' ? 0 : media.filter((item) => item.cardId === editingCard.id).length}
            tagSuggestions={allTags}
            onSubmit={saveCard}
            onCancel={() => setEditingCard(undefined)}
          />
        </Modal>
      )}

      {bulkOpen && (
        <Modal title={t.deck.bulkEditor} onClose={() => setBulkOpen(false)}>
          <BulkEditor deckId={deckId} onCreate={bulkCreate} onCancel={() => setBulkOpen(false)} />
        </Modal>
      )}
    </section>
  );
}

const studySourceOptions: Array<{ value: DeckStudySource; label: string }> = [
  { value: 'all', label: 'Všechny kartičky' },
  { value: 'lapsed', label: 'Těžké kartičky' },
  { value: 'mistakes', label: 'Špatně zodpovězené' },
  { value: 'new', label: 'Nové kartičky' },
  { value: 'due', label: 'K opakování dnes' }
];

function emptyStudyMessage(source: DeckStudySource): string {
  const labels: Record<DeckStudySource, string> = {
    all: 'V tomto balíčku zatím nejsou žádné kartičky.',
    lapsed: 'V tomto balíčku zatím nejsou žádné těžké kartičky.',
    mistakes: 'V tomto balíčku zatím nejsou žádné špatně zodpovězené kartičky.',
    new: 'V tomto balíčku zatím nejsou žádné nové kartičky.',
    due: 'V tomto balíčku teď nejsou žádné kartičky k opakování.'
  };
  return labels[source];
}

function MediaUploadButtonToolbar({ card, side, onUpload }: { card: Card; side: CardSide, onUpload: (card: Card, side: CardSide, file?: File) => void }) {
  return (
    <div className="media-upload-toolbar">
      <MediaUploadButton label={'Obrázek'} accept="image/*" onFile={(file) => onUpload(card, side, file)} />
      <MediaUploadButton label={'Zvuk'} accept={AUDIO_FILE_ACCEPT} onFile={(file) => onUpload(card, side, file)} />
    </div>
  );
}

function MediaUploadButton({ label, accept, onFile }: { label: string; accept: string; onFile: (file?: File) => void }) {
  return (
    <label className="upload-button secondary-button">
      {label}
      <input
        type="file"
        accept={accept}
        onChange={(event) => {
          onFile(event.target.files?.[0]);
          event.currentTarget.value = '';
        }}
      />
    </label>
  );
}
