import { useEffect, useMemo, useState, type FormEvent } from 'react';
import RichTextDisplay from '../components/RichTextDisplay';
import { db } from '../db/database';
import type { Card, Deck } from '../types';
import { shuffle, takeRandom } from '../utils/random';
import { normalizeAnswer } from '../utils/text';

interface TestPageProps {
  deckId: string;
  onBack: () => void;
}

type QuestionType = 'frontToBack' | 'backToFront' | 'multipleChoice';

interface TestAnswer {
  card: Card;
  prompt: string;
  expected: string;
  answer: string;
  correct: boolean;
}

export default function TestPage({ deckId, onBack }: TestPageProps) {
  const [deck, setDeck] = useState<Deck>();
  const [cards, setCards] = useState<Card[]>([]);
  const [questionType, setQuestionType] = useState<QuestionType>('frontToBack');
  const [questionCount, setQuestionCount] = useState(10);
  const [showImmediate, setShowImmediate] = useState(true);
  const [starredOnly, setStarredOnly] = useState(false);
  const [sessionCards, setSessionCards] = useState<Card[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<TestAnswer[]>([]);
  const [textAnswer, setTextAnswer] = useState('');
  const [selectedId, setSelectedId] = useState<string>();
  const [lastAnswer, setLastAnswer] = useState<TestAnswer>();
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
      setError(err instanceof Error ? err.message : 'Test se nepodařilo načíst.');
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [deckId]);

  const availableCards = useMemo(
    () => cards.filter((card) => !starredOnly || card.starred === true),
    [cards, starredOnly]
  );
  const currentCard = sessionCards[index];
  const finished = sessionCards.length > 0 && index >= sessionCards.length;
  const multipleChoiceOptions = useMemo(() => {
    if (!currentCard) return [];
    const distractors = takeRandom(sessionCards.filter((card) => card.id !== currentCard.id), 3);
    return shuffle([currentCard, ...distractors]);
  }, [currentCard, sessionCards]);

  function startTest() {
    if (availableCards.length === 0) {
      setError(starredOnly ? 'V balíčku nejsou žádné hvězdičkové kartičky.' : 'V balíčku nejsou žádné testovatelné kartičky.');
      return;
    }
    const selected = takeRandom(availableCards, Math.min(questionCount, availableCards.length));
    setSessionCards(selected);
    setAnswers([]);
    setIndex(0);
    setTextAnswer('');
    setSelectedId(undefined);
    setLastAnswer(undefined);
    setError(undefined);
  }

  function resetTest() {
    setSessionCards([]);
    setAnswers([]);
    setIndex(0);
    setTextAnswer('');
    setSelectedId(undefined);
    setLastAnswer(undefined);
  }

  function submitText(event: FormEvent) {
    event.preventDefault();
    if (!currentCard || !textAnswer.trim()) return;
    submitAnswer(textAnswer, normalizeAnswer(expectedAnswer(currentCard)) === normalizeAnswer(textAnswer));
  }

  function submitChoice(cardId: string) {
    if (!currentCard) return;
    const chosen = multipleChoiceOptions.find((card) => card.id === cardId);
    setSelectedId(cardId);
    submitAnswer(chosen?.backText ?? '', cardId === currentCard.id);
  }

  function submitAnswer(answer: string, correct: boolean) {
    if (!currentCard) return;
    const result = {
      card: currentCard,
      prompt: promptText(currentCard),
      expected: expectedAnswer(currentCard),
      answer,
      correct
    };
    setAnswers((current) => [...current, result]);
    setLastAnswer(result);
    setTextAnswer('');
    if (showImmediate) {
      window.setTimeout(() => {
        setSelectedId(undefined);
        setLastAnswer(undefined);
        setIndex((value) => value + 1);
      }, questionType === 'multipleChoice' && correct ? 700 : 1100);
    } else {
      setSelectedId(undefined);
      setIndex((value) => value + 1);
    }
  }

  function promptText(card: Card) {
    return questionType === 'backToFront' ? card.backText : card.frontText;
  }

  function expectedAnswer(card: Card) {
    return questionType === 'backToFront' ? card.frontText : card.backText;
  }

  const score = answers.filter((answer) => answer.correct).length;
  const percent = answers.length ? Math.round((score / answers.length) * 100) : 0;

  if (loading) return <section className="page"><p className="muted">Načítám Test...</p></section>;

  return (
    <section className="page test-page">
      <div className="study-header-compact">
        <button className="back-icon-button" onClick={onBack} aria-label="Zpět" title="Zpět">←</button>
        <h1>{deck?.name ?? 'Balíček'} · Test</h1>
        <span className="pill pill-muted">{sessionCards.length ? Math.min(index + 1, sessionCards.length) : 0}/{sessionCards.length}</span>
      </div>

      {error && <p className="error-box">{error}</p>}

      {sessionCards.length === 0 && !finished ? (
        <section className="panel stack">
          <h2>Nastavení testu</h2>
          <label>
            Typ otázek
            <select value={questionType} onChange={(event) => setQuestionType(event.target.value as QuestionType)}>
              <option value="frontToBack">Přední strana → zadní strana</option>
              <option value="backToFront">Zadní strana → přední strana</option>
              <option value="multipleChoice">Výběr z možností</option>
            </select>
          </label>
          <label>
            Počet otázek: {Math.min(questionCount, Math.max(1, availableCards.length))}
            <input type="range" min={1} max={Math.max(1, availableCards.length)} value={Math.min(questionCount, Math.max(1, availableCards.length))} onChange={(event) => setQuestionCount(Number(event.target.value))} />
          </label>
          <label>
            Zobrazení výsledků
            <select value={showImmediate ? 'now' : 'end'} onChange={(event) => setShowImmediate(event.target.value === 'now')}>
              <option value="now">Průběžně po otázce</option>
              <option value="end">Až na konci testu</option>
            </select>
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={starredOnly} onChange={(event) => setStarredOnly(event.target.checked)} />
            Zahrnout pouze hvězdičkové kartičky
          </label>
          <p className="muted">Dostupné kartičky: {availableCards.length}</p>
          <button className="primary-button" type="button" onClick={startTest}>Spustit test</button>
        </section>
      ) : finished ? (
        <section className="panel stack">
          <h2>Výsledky testu</h2>
          <div className="stats-row">
            <span><strong>{score}/{answers.length}</strong> správně</span>
            <span><strong>{percent} %</strong> úspěšnost</span>
            <span><strong>{answers.length - score}</strong> chyb</span>
          </div>
          <div className="preview-list">
            {answers.map((answer, answerIndex) => (
              <div className={`preview-row ${answer.correct ? '' : 'invalid'}`} key={`${answer.card.id}-${answerIndex}`}>
                <strong><RichTextDisplay content={answer.prompt} /></strong>
                <span>Správně: <RichTextDisplay content={answer.expected} /></span>
                <small>Vaše odpověď: {questionType === 'multipleChoice' ? <RichTextDisplay content={answer.answer} /> : answer.answer}</small>
              </div>
            ))}
          </div>
          <div className="button-row">
            <button className="primary-button" type="button" onClick={startTest}>Zopakovat test</button>
            <button className="secondary-button" type="button" onClick={resetTest}>Změnit nastavení</button>
          </div>
        </section>
      ) : currentCard && (
        <section className="mode-panel">
          <p className="side-label">Otázka</p>
          <div className="review-text compact"><RichTextDisplay content={promptText(currentCard)} /></div>
          {questionType === 'multipleChoice' ? (
            <div className="choice-grid">
              {multipleChoiceOptions.map((option) => (
                <button
                  className={`choice-button ${selectedId && option.id === currentCard.id ? 'correct' : ''} ${selectedId === option.id && option.id !== currentCard.id ? 'wrong' : ''}`}
                  type="button"
                  key={option.id}
                  disabled={Boolean(selectedId)}
                  onClick={() => submitChoice(option.id)}
                >
                  <RichTextDisplay content={option.backText} />
                </button>
              ))}
            </div>
          ) : (
            <form className="stack" onSubmit={submitText}>
              <label>
                Vaše odpověď
                <input value={textAnswer} onChange={(event) => setTextAnswer(event.target.value)} autoFocus />
              </label>
              <button className="primary-button" type="submit" disabled={!textAnswer.trim()}>Vyhodnotit</button>
            </form>
          )}
          {showImmediate && lastAnswer && (
            <div className={lastAnswer.correct ? 'success-box' : 'error-box'}>
              {lastAnswer.correct ? 'Správně.' : <>Správná odpověď: <RichTextDisplay content={lastAnswer.expected} /></>}
            </div>
          )}
        </section>
      )}
    </section>
  );
}
