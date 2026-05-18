import { useEffect, useMemo, useRef, useState } from 'react';
import RichTextDisplay from '../components/RichTextDisplay';
import { db } from '../db/database';
import type { Card, Deck } from '../types';
import { shuffle } from '../utils/random';

interface MatchPageProps {
  deckId: string;
  onBack: () => void;
}

interface MatchItem {
  id: string;
  cardId: string;
  content: string;
  side: 'front' | 'back';
}

interface MatchAttempt {
  first: MatchItem;
  second: MatchItem;
}

export default function MatchPage({ deckId, onBack }: MatchPageProps) {
  const [deck, setDeck] = useState<Deck>();
  const [cards, setCards] = useState<Card[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [matchedCardIds, setMatchedCardIds] = useState<string[]>([]);
  const [wrongPairs, setWrongPairs] = useState<MatchAttempt[]>([]);
  const [wrongFlashIds, setWrongFlashIds] = useState<string[]>([]);
  const [roundKey, setRoundKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const wrongTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      db.decks.get(deckId),
      db.cards.where('deckId').equals(deckId).toArray()
    ]).then(([nextDeck, nextCards]) => {
      if (!active) return;
      setDeck(nextDeck);
      setCards(shuffle(nextCards.filter((card) => card.frontText.trim() && card.backText.trim())).slice(0, 6));
      setSelectedIds([]);
      setMatchedCardIds([]);
      setWrongPairs([]);
      setWrongFlashIds([]);
      setLoading(false);
    }).catch((err) => {
      if (!active) return;
      setError(err instanceof Error ? err.message : 'Match mód se nepodařilo načíst.');
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [deckId, roundKey]);

  useEffect(() => () => window.clearTimeout(wrongTimer.current), []);

  const matchItems = useMemo<MatchItem[]>(() => shuffle(cards.flatMap((card) => [
    { id: `${card.id}:front`, cardId: card.id, side: 'front' as const, content: card.frontText },
    { id: `${card.id}:back`, cardId: card.id, side: 'back' as const, content: card.backText }
  ])), [cards]);

  const matchedCardIdSet = new Set(matchedCardIds);
  const activeItems = matchItems.filter((item) => !matchedCardIdSet.has(item.cardId));
  const finished = cards.length > 0 && matchedCardIds.length === cards.length;
  const correctCount = matchedCardIds.length;

  function chooseItem(item: MatchItem) {
    if (matchedCardIdSet.has(item.cardId) || finished || wrongFlashIds.length > 0) return;
    if (selectedIds.includes(item.id)) {
      setSelectedIds((current) => current.filter((id) => id !== item.id));
      return;
    }

    if (selectedIds.length === 0) {
      setSelectedIds([item.id]);
      return;
    }

    const first = matchItems.find((candidate) => candidate.id === selectedIds[0]);
    if (!first) {
      setSelectedIds([item.id]);
      return;
    }

    if (first.cardId === item.cardId && first.side !== item.side) {
      setMatchedCardIds((current) => [...current, item.cardId]);
      setSelectedIds([]);
      return;
    }

    setWrongFlashIds([first.id, item.id]);
    setWrongPairs((current) => [...current, { first, second: item }]);
    window.clearTimeout(wrongTimer.current);
    wrongTimer.current = window.setTimeout(() => {
      setWrongFlashIds([]);
      setSelectedIds([]);
    }, 460);
  }

  function restart() {
    setRoundKey((value) => value + 1);
  }

  if (loading) return <section className="page"><p className="muted">Načítám Match...</p></section>;

  return (
    <section className="page match-page">
      <div className="study-header-compact">
        <button className="back-icon-button" onClick={onBack} aria-label="Zpět" title="Zpět">←</button>
        <h1>{deck?.name ?? 'Balíček'} · Match</h1>
        <span className="pill pill-muted">{correctCount}/{cards.length}</span>
      </div>

      {error && <p className="error-box">{error}</p>}

      {cards.length < 2 ? (
        <div className="empty-state">
          <h2>Match potřebuje alespoň dvě textové kartičky</h2>
          <p>Přidejte do balíčku více kartiček s přední i zadní stranou.</p>
        </div>
      ) : (
        <>
          <div className="match-play-area" aria-label="Zamíchané kartičky pro hledání dvojic">
            {activeItems.map((item) => {
              const wrong = wrongFlashIds.includes(item.id);
              return (
                <button
                  className={`match-item ${selectedIds.includes(item.id) ? 'selected' : ''} ${wrong ? 'wrong shake' : ''}`}
                  type="button"
                  key={item.id}
                  disabled={wrongFlashIds.length > 0}
                  onClick={() => chooseItem(item)}
                >
                  <RichTextDisplay content={item.content} />
                </button>
              );
            })}
          </div>

          {finished && (
            <section className="panel stack">
              <h2>Výsledek</h2>
              <p>Správně: <strong>{correctCount}</strong> z {cards.length}</p>
              {wrongPairs.length > 0 ? (
                <div className="preview-list">
                  {wrongPairs.map((pair) => {
                    const firstCard = cards.find((card) => card.id === pair.first.cardId);
                    return (
                      <div className="preview-row invalid" key={`${pair.first.id}-${pair.second.id}`}>
                        <strong><RichTextDisplay content={pair.first.content} /></strong>
                        <span>Patří k: <RichTextDisplay content={pair.first.side === 'front' ? firstCard?.backText ?? '' : firstCard?.frontText ?? ''} /></span>
                        <small>Zvoleno: <RichTextDisplay content={pair.second.content} /></small>
                      </div>
                    );
                  })}
                </div>
              ) : <p className="success-box">Všechny dvojice sedí.</p>}
              <button className="primary-button" type="button" onClick={restart}>Hrát znovu</button>
            </section>
          )}
        </>
      )}
    </section>
  );
}
