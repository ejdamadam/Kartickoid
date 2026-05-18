import { useEffect, useMemo, useRef, useState } from 'react';
import ObjectImage from '../components/ObjectImage';
import RichTextDisplay from '../components/RichTextDisplay';
import { db } from '../db/database';
import type { Card, CardSide, Deck, Media } from '../types';
import { shuffle } from '../utils/random';

interface MatchPageProps {
  deckId: string;
  onBack: () => void;
}

interface MatchItem {
  id: string;
  cardId: string;
  content: string;
  images: Media[];
  side: CardSide;
}

interface MatchAttempt {
  first: MatchItem;
  second: MatchItem;
}

export default function MatchPage({ deckId, onBack }: MatchPageProps) {
  const [deck, setDeck] = useState<Deck>();
  const [cards, setCards] = useState<Card[]>([]);
  const [media, setMedia] = useState<Media[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [matchedCardIds, setMatchedCardIds] = useState<string[]>([]);
  const [wrongPairs, setWrongPairs] = useState<MatchAttempt[]>([]);
  const [wrongFlashIds, setWrongFlashIds] = useState<string[]>([]);
  const [correctFlashIds, setCorrectFlashIds] = useState<string[]>([]);
  const [roundKey, setRoundKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const wrongTimer = useRef<number | undefined>(undefined);
  const correctTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      db.decks.get(deckId),
      db.cards.where('deckId').equals(deckId).toArray(),
      db.media.toArray()
    ]).then(([nextDeck, nextCards, nextMedia]) => {
      if (!active) return;
      const imageMedia = nextMedia.filter((item) => item.deckId === deckId && item.type === 'image');
      setDeck(nextDeck);
      setMedia(imageMedia);
      setCards(shuffle(nextCards.filter((card) => hasMatchContent(card, 'front', imageMedia) && hasMatchContent(card, 'back', imageMedia))).slice(0, 6));
      setSelectedIds([]);
      setMatchedCardIds([]);
      setWrongPairs([]);
      setWrongFlashIds([]);
      setCorrectFlashIds([]);
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

  useEffect(() => () => {
    window.clearTimeout(wrongTimer.current);
    window.clearTimeout(correctTimer.current);
  }, []);

  const matchItems = useMemo<MatchItem[]>(() => shuffle(cards.flatMap((card) => [
    { id: `${card.id}:front`, cardId: card.id, side: 'front' as const, content: card.frontText, images: sideImages(card.id, 'front', media) },
    { id: `${card.id}:back`, cardId: card.id, side: 'back' as const, content: card.backText, images: sideImages(card.id, 'back', media) }
  ])), [cards, media]);

  const matchedCardIdSet = new Set(matchedCardIds);
  const activeItems = matchItems.filter((item) => !matchedCardIdSet.has(item.cardId));
  const finished = cards.length > 0 && matchedCardIds.length === cards.length;
  const correctCount = matchedCardIds.length;

  function chooseItem(item: MatchItem) {
    if (matchedCardIdSet.has(item.cardId) || finished || wrongFlashIds.length > 0 || correctFlashIds.length > 0) return;
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
      setCorrectFlashIds([first.id, item.id]);
      setSelectedIds([first.id, item.id]);
      window.clearTimeout(correctTimer.current);
      correctTimer.current = window.setTimeout(() => {
        setMatchedCardIds((current) => [...current, item.cardId]);
        setCorrectFlashIds([]);
        setSelectedIds([]);
      }, 380);
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
              const correct = correctFlashIds.includes(item.id);
              return (
                <button
                  className={`match-item ${selectedIds.includes(item.id) ? 'selected' : ''} ${correct ? 'correct' : ''} ${wrong ? 'wrong shake' : ''}`}
                  type="button"
                  key={item.id}
                  disabled={wrongFlashIds.length > 0 || correctFlashIds.length > 0}
                  onClick={() => chooseItem(item)}
                >
                  <MatchItemContent item={item} />
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
                        <strong><MatchItemContent item={pair.first} /></strong>
                        <span>Patří k: {firstCard && <MatchItemContent item={oppositeItem(firstCard, pair.first.side, media)} />}</span>
                        <small>Zvoleno: <MatchItemContent item={pair.second} /></small>
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

function MatchItemContent({ item }: { item: MatchItem }) {
  const hasText = hasDisplayText(item.content);
  return (
    <span className="match-item-content">
      {hasText && <RichTextDisplay content={item.content} />}
      {item.images.length > 0 && (
        <span className="match-image-list">
          {item.images.map((image) => (
            <ObjectImage blob={image.blob} alt={image.name || 'Obrázek kartičky'} key={image.id} />
          ))}
        </span>
      )}
    </span>
  );
}

function oppositeItem(card: Card, side: CardSide, media: Media[]): MatchItem {
  const oppositeSide: CardSide = side === 'front' ? 'back' : 'front';
  return {
    id: `${card.id}:${oppositeSide}`,
    cardId: card.id,
    side: oppositeSide,
    content: oppositeSide === 'front' ? card.frontText : card.backText,
    images: sideImages(card.id, oppositeSide, media)
  };
}

function hasMatchContent(card: Card, side: CardSide, media: Media[]): boolean {
  const text = side === 'front' ? card.frontText : card.backText;
  return hasDisplayText(text) || sideImages(card.id, side, media).length > 0;
}

function sideImages(cardId: string, side: CardSide, media: Media[]): Media[] {
  return media.filter((item) => item.cardId === cardId && item.side === side && item.type === 'image');
}

function hasDisplayText(html: string): boolean {
  return html
    .replace(/<div[^>]*data-import-warning="true"[^>]*>[\s\S]*?<\/div>/gi, ' ')
    .replace(/<div[^>]*class="[^"]*\bimport-warning\b[^"]*"[^>]*>[\s\S]*?<\/div>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim().length > 0;
}
