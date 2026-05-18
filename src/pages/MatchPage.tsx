import { useEffect, useMemo, useRef, useState } from 'react';
import RichTextDisplay from '../components/RichTextDisplay';
import { db } from '../db/database';
import type { Card, Deck } from '../types';
import { shuffle } from '../utils/random';

interface MatchPageProps {
  deckId: string;
  onBack: () => void;
}

interface MatchPair {
  leftId: string;
  rightId: string;
}

export default function MatchPage({ deckId, onBack }: MatchPageProps) {
  const [deck, setDeck] = useState<Deck>();
  const [cards, setCards] = useState<Card[]>([]);
  const [selectedLeft, setSelectedLeft] = useState<string>();
  const [matchedIds, setMatchedIds] = useState<string[]>([]);
  const [wrongPairs, setWrongPairs] = useState<MatchPair[]>([]);
  const [wrongFlash, setWrongFlash] = useState<MatchPair>();
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
      setSelectedLeft(undefined);
      setMatchedIds([]);
      setWrongPairs([]);
      setWrongFlash(undefined);
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

  const rightCards = useMemo(() => shuffle(cards), [cards]);
  const matchedIdSet = new Set(matchedIds);
  const activeLeftCards = cards.filter((card) => !matchedIdSet.has(card.id));
  const activeRightCards = rightCards.filter((card) => !matchedIdSet.has(card.id));
  const finished = cards.length > 0 && matchedIds.length === cards.length;
  const correctCount = matchedIds.length;

  function chooseLeft(cardId: string) {
    if (matchedIdSet.has(cardId) || finished) return;
    setSelectedLeft(cardId);
  }

  function chooseRight(cardId: string) {
    if (!selectedLeft || matchedIdSet.has(cardId) || finished) return;
    if (selectedLeft === cardId) {
      setMatchedIds((current) => [...current, cardId]);
      setSelectedLeft(undefined);
      return;
    }

    const nextWrong = { leftId: selectedLeft, rightId: cardId };
    setWrongFlash(nextWrong);
    setWrongPairs((current) => [...current, nextWrong]);
    window.clearTimeout(wrongTimer.current);
    wrongTimer.current = window.setTimeout(() => {
      setWrongFlash(undefined);
      setSelectedLeft(undefined);
    }, 520);
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
          <div className="match-board">
            <section className="match-column">
              <h2>Pojmy / otázky</h2>
              {activeLeftCards.map((card) => {
                const wrong = wrongFlash?.leftId === card.id;
                return (
                  <button
                    className={`match-item ${selectedLeft === card.id ? 'selected' : ''} ${wrong ? 'wrong shake' : ''}`}
                    type="button"
                    key={card.id}
                    disabled={Boolean(wrongFlash)}
                    onClick={() => chooseLeft(card.id)}
                  >
                    <RichTextDisplay content={card.frontText} />
                  </button>
                );
              })}
            </section>

            <section className="match-column">
              <h2>Odpovědi</h2>
              {activeRightCards.map((card) => {
                const wrong = wrongFlash?.rightId === card.id;
                return (
                  <button
                    className={`match-item ${wrong ? 'wrong shake' : ''}`}
                    type="button"
                    key={card.id}
                    disabled={!selectedLeft || Boolean(wrongFlash)}
                    onClick={() => chooseRight(card.id)}
                  >
                    <RichTextDisplay content={card.backText} />
                  </button>
                );
              })}
            </section>
          </div>

          {finished && (
            <section className="panel stack">
              <h2>Výsledek</h2>
              <p>Správně: <strong>{correctCount}</strong> z {cards.length}</p>
              {wrongPairs.length > 0 ? (
                <div className="preview-list">
                  {wrongPairs.map((pair) => {
                    const left = cards.find((card) => card.id === pair.leftId);
                    const chosen = cards.find((card) => card.id === pair.rightId);
                    return (
                      <div className="preview-row invalid" key={`${pair.leftId}-${pair.rightId}`}>
                        <strong><RichTextDisplay content={left?.frontText ?? ''} /></strong>
                        <span>Správně: <RichTextDisplay content={left?.backText ?? ''} /></span>
                        <small>Zvoleno: <RichTextDisplay content={chosen?.backText ?? ''} /></small>
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
