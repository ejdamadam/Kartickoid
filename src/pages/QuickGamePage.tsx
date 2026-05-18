import { useEffect, useMemo, useState } from 'react';
import RichTextDisplay from '../components/RichTextDisplay';
import { db } from '../db/database';
import type { Card, Deck } from '../types';
import { shuffle, takeRandom } from '../utils/random';

interface QuickGamePageProps {
  deckId: string;
  onBack: () => void;
}

export default function QuickGamePage({ deckId, onBack }: QuickGamePageProps) {
  const [deck, setDeck] = useState<Deck>();
  const [cards, setCards] = useState<Card[]>([]);
  const [queue, setQueue] = useState<Card[]>([]);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [mistakes, setMistakes] = useState<Array<{ card: Card; chosen: Card }>>([]);
  const [timeLeft, setTimeLeft] = useState(45);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    Promise.all([
      db.decks.get(deckId),
      db.cards.where('deckId').equals(deckId).toArray()
    ]).then(([nextDeck, nextCards]) => {
      if (!active) return;
      setDeck(nextDeck);
      setCards(nextCards.filter((card) => card.frontText.trim() && card.backText.trim()));
      setLoading(false);
    }).catch((err) => {
      if (!active) return;
      setError(err instanceof Error ? err.message : 'Hru se nepodařilo načíst.');
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [deckId]);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setTimeLeft((value) => {
        if (value <= 1) {
          window.clearInterval(timer);
          setRunning(false);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  const currentCard = queue[index];
  const options = useMemo(() => {
    if (!currentCard) return [];
    return shuffle([currentCard, ...takeRandom(cards.filter((card) => card.id !== currentCard.id), 3)]);
  }, [cards, currentCard]);
  const finished = queue.length > 0 && (!running || index >= queue.length || timeLeft <= 0);

  function startGame() {
    setQueue(shuffle(cards).slice(0, Math.min(20, cards.length)));
    setIndex(0);
    setScore(0);
    setMistakes([]);
    setTimeLeft(45);
    setRunning(true);
    setError(undefined);
  }

  function choose(option: Card) {
    if (!currentCard || !running) return;
    if (option.id === currentCard.id) {
      setScore((value) => value + 1);
    } else {
      setMistakes((items) => [...items, { card: currentCard, chosen: option }]);
    }
    setIndex((value) => {
      const next = value + 1;
      if (next >= queue.length) setRunning(false);
      return next;
    });
  }

  if (loading) return <section className="page"><p className="muted">Načítám hru...</p></section>;

  return (
    <section className="page quick-game-page">
      <div className="study-header-compact">
        <button className="back-icon-button" onClick={onBack} aria-label="Zpět" title="Zpět">←</button>
        <h1>{deck?.name ?? 'Balíček'} · Rychlá odpověď</h1>
        <span className="pill pill-muted">{timeLeft}s</span>
      </div>

      {error && <p className="error-box">{error}</p>}

      {cards.length < 4 ? (
        <div className="empty-state">
          <h2>Hra potřebuje alespoň čtyři textové kartičky</h2>
          <p>Přidejte více kartiček, aby šly vytvořit možnosti odpovědí.</p>
        </div>
      ) : queue.length === 0 ? (
        <section className="panel stack">
          <h2>Rychlá odpověď</h2>
          <p>Máte 45 sekund na co nejvíc správných odpovědí. Zobrazí se přední strana a vybíráte správnou zadní stranu.</p>
          <button className="primary-button" type="button" onClick={startGame}>Spustit hru</button>
        </section>
      ) : finished ? (
        <section className="panel stack">
          <h2>Konec hry</h2>
          <div className="stats-row">
            <span><strong>{score}</strong> skóre</span>
            <span><strong>{mistakes.length}</strong> chyb</span>
            <span><strong>{Math.min(index, queue.length)}/{queue.length}</strong> otázek</span>
          </div>
          {mistakes.length > 0 && (
            <div className="preview-list">
              {mistakes.map((mistake, mistakeIndex) => (
                <div className="preview-row invalid" key={`${mistake.card.id}-${mistakeIndex}`}>
                  <strong><RichTextDisplay content={mistake.card.frontText} /></strong>
                  <span>Správně: <RichTextDisplay content={mistake.card.backText} /></span>
                  <small>Zvoleno: <RichTextDisplay content={mistake.chosen.backText} /></small>
                </div>
              ))}
            </div>
          )}
          <button className="primary-button" type="button" onClick={startGame}>Hrát znovu</button>
        </section>
      ) : currentCard && (
        <section className="mode-panel quick-game-panel">
          <div className="game-score-line">
            <span>Skóre: <strong>{score}</strong></span>
            <span>Otázka: <strong>{index + 1}/{queue.length}</strong></span>
          </div>
          <p className="side-label">Vyberte odpověď</p>
          <div className="review-text compact"><RichTextDisplay content={currentCard.frontText} /></div>
          <div className="choice-grid">
            {options.map((option) => (
              <button className="choice-button" type="button" key={option.id} onClick={() => choose(option)}>
                <RichTextDisplay content={option.backText} />
              </button>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
