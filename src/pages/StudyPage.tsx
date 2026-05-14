import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { motion, useMotionValue, useTransform, type PanInfo } from 'framer-motion';
import CardMediaList from '../components/CardMediaList';
import { db } from '../db/database';
import { ratingLabels, scheduleCard } from '../services/scheduler';
import { loadStudyCards } from '../services/studySessions';
import type { Card, Deck, Media, Rating, StudyMode, StudySessionSource } from '../types';
import { compareFuzzy, type FuzzyResult } from '../utils/fuzzy';
import { createId } from '../utils/id';
import { shuffle, takeRandom } from '../utils/random';
import { t } from '../i18n';

interface StudyPageProps {
  deckId: string;
  onBack: () => void;
  onChanged: () => void;
}

const modeLabels: Record<StudyMode, string> = {
  learning: t.study.learning,
  test: t.study.test,
  writing: t.study.writing
};

const sourceLabels: Record<StudySessionSource, string> = {
  due: t.study.due,
  all: t.study.all,
  lapsed: t.study.lapsed,
  random: t.study.random,
  mistakes: t.study.mistakes
};

export default function StudyPage({ deckId, onBack, onChanged }: StudyPageProps) {
  const [deck, setDeck] = useState<Deck>();
  const [allCards, setAllCards] = useState<Card[]>([]);
  const [queue, setQueue] = useState<Card[]>([]);
  const [media, setMedia] = useState<Media[]>([]);
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<StudyMode>('learning');
  const [source, setSource] = useState<StudySessionSource>('due');
  const [revealed, setRevealed] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [mistakeIds, setMistakeIds] = useState<string[]>([]);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    Promise.all([
      db.decks.get(deckId),
      db.cards.where('deckId').equals(deckId).toArray(),
      loadStudyCards(deckId, source),
      db.media.toArray()
    ])
      .then(([nextDeck, deckCards, sessionCards, allMedia]) => {
        if (!active) return;
        setDeck(nextDeck);
        setAllCards(deckCards);
        setQueue(sessionCards);
        setMedia(allMedia.filter((item) => deckCards.some((card) => card.id === item.cardId)));
        setIndex(0);
        setCompleted(0);
        setRevealed(false);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t.common.error));

    return () => {
      active = false;
    };
  }, [deckId, source, sessionKey]);

  const dueCount = useMemo(() => {
    const now = new Date();
    return allCards.filter((card) => new Date(card.dueAt) <= now).length;
  }, [allCards]);

  const currentCard = queue[index];
  const currentMedia = useMemo(
    () => currentCard ? media.filter((item) => item.cardId === currentCard.id) : [],
    [currentCard, media]
  );

  async function rate(rating: Rating, card = currentCard) {
    if (!card) return;
    const reviewedAt = new Date();
    const updatedCard = scheduleCard(card, rating, reviewedAt);

    try {
      await db.transaction('rw', db.cards, db.reviewLogs, async () => {
        await db.cards.put(updatedCard);
        await db.reviewLogs.add({
          id: createId('log'),
          cardId: card.id,
          deckId,
          rating,
          reviewedAt: reviewedAt.toISOString()
        });
      });
      if (rating === 'again' || rating === 'hard') {
        setMistakeIds((ids) => Array.from(new Set([...ids, card.id])));
      }
      onChanged();
      setRevealed(false);
      setCompleted((value) => value + 1);
      setIndex((value) => value + 1);
      vibrate(rating === 'good' || rating === 'easy' ? 18 : 32);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    }
  }

  function startSession(nextSource: StudySessionSource, nextMode = mode) {
    setMode(nextMode);
    setSource(nextSource);
    setSessionKey((value) => value + 1);
  }

  function retryMistakes() {
    const retryCards = allCards.filter((card) => mistakeIds.includes(card.id));
    setQueue(retryCards);
    setIndex(0);
    setCompleted(0);
    setRevealed(false);
  }

  return (
    <section className="study-page mobile-study">
      <button className="back-button" onClick={onBack}>← {t.common.back}</button>
      <div className="study-header">
        <div>
          <p className="eyebrow">{t.study.title}</p>
          <h1>{deck?.name ?? t.deck.label}</h1>
        </div>
        <span className="pill pill-muted">{queue.length === 0 ? 0 : Math.min(index + 1, queue.length)} / {queue.length}</span>
      </div>

      <div className="mode-tabs" role="tablist" aria-label={t.study.title}>
        {(Object.keys(modeLabels) as StudyMode[]).map((item) => (
          <button className={mode === item ? 'active' : ''} key={item} onClick={() => setMode(item)}>
            {modeLabels[item]}
          </button>
        ))}
      </div>

      {error && <p className="error-box">{error}</p>}

      {!currentCard ? (
        <SessionEmpty
          total={allCards.length}
          dueCount={dueCount}
          completed={completed}
          mistakes={mistakeIds.length}
          onBack={onBack}
          onStart={startSession}
          onRetryMistakes={retryMistakes}
        />
      ) : (
        <>
          {mode === 'learning' && (
            <LearningCard
              card={currentCard}
              media={currentMedia}
              revealed={revealed}
              onFlip={() => setRevealed((value) => !value)}
              onRate={rate}
            />
          )}
          {mode === 'test' && (
            <TestMode
              card={currentCard}
              media={media}
              allCards={allCards}
              onRate={rate}
              onShowDetail={() => setRevealed(true)}
              revealed={revealed}
            />
          )}
          {mode === 'writing' && (
            <WritingMode
              card={currentCard}
              media={currentMedia}
              onRate={rate}
            />
          )}
        </>
      )}
    </section>
  );
}

function LearningCard({ card, media, revealed, onFlip, onRate }: {
  card: Card;
  media: Media[];
  revealed: boolean;
  onFlip: () => void;
  onRate: (rating: Rating) => void;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-220, 0, 220], [-10, 0, 10]);
  const goodOpacity = useTransform(x, [32, 150], [0, 1]);
  const againOpacity = useTransform(x, [-150, -32], [1, 0]);
  const easyOpacity = useTransform(y, [-150, -32], [1, 0]);
  const hardOpacity = useTransform(y, [32, 150], [0, 1]);

  function onDragEnd(_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    const { offset, velocity } = info;
    const horizontal = Math.abs(offset.x) > Math.abs(offset.y);
    const forceX = Math.abs(offset.x) + Math.abs(velocity.x) * 0.18;
    const forceY = Math.abs(offset.y) + Math.abs(velocity.y) * 0.18;

    if (horizontal && forceX > 120) {
      onRate(offset.x > 0 ? 'good' : 'again');
      return;
    }
    if (!horizontal && forceY > 120) {
      onRate(offset.y < 0 ? 'easy' : 'hard');
    }
  }

  return (
    <div className="learning-shell">
      <motion.article
        className="swipe-card"
        style={{ x, y, rotate }}
        drag
        dragElastic={0.22}
        dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
        whileTap={{ scale: 0.985 }}
        onTap={onFlip}
        onDragEnd={onDragEnd}
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 25 }}
      >
        <motion.div className="swipe-indicator good" style={{ opacity: goodOpacity }}>{t.study.good}</motion.div>
        <motion.div className="swipe-indicator again" style={{ opacity: againOpacity }}>{t.study.again}</motion.div>
        <motion.div className="swipe-indicator easy" style={{ opacity: easyOpacity }}>{t.study.easy}</motion.div>
        <motion.div className="swipe-indicator hard" style={{ opacity: hardOpacity }}>{t.study.hard}</motion.div>

        <div className="review-side centered">
          <p className="side-label">{revealed ? t.deck.backSide : t.deck.frontSide}</p>
          <p className="review-text">{(revealed ? card.backText : card.frontText) || t.deck.imageOnly}</p>
          <CardMediaList media={media} side={revealed ? 'back' : 'front'} />
        </div>
      </motion.article>
      <p className="gesture-hint">{t.study.hint}</p>
      <RatingButtons onRate={onRate} />
    </div>
  );
}

function TestMode({ card, media, allCards, onRate, onShowDetail, revealed }: {
  card: Card;
  media: Media[];
  allCards: Card[];
  onRate: (rating: Rating) => void;
  onShowDetail: () => void;
  revealed: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string>();
  useEffect(() => {
    setSelectedId(undefined);
  }, [card.id]);

  const options = useMemo(() => {
    const distractors = takeRandom(allCards.filter((item) => item.id !== card.id), 3);
    return shuffle([card, ...distractors]);
  }, [allCards, card]);

  const selected = options.find((option) => option.id === selectedId);
  const answered = Boolean(selectedId);
  const correct = selectedId === card.id;

  function next() {
    onRate(correct ? 'good' : 'again');
    setSelectedId(undefined);
  }

  return (
    <article className="mode-panel">
      <div className="review-side">
        <p className="side-label">{t.study.front}</p>
        <p className="review-text compact">{card.frontText || t.deck.imageOnly}</p>
        <CardMediaList media={media.filter((item) => item.cardId === card.id)} side="front" />
      </div>
      <div className="choice-grid">
        {options.map((option) => {
          const optionMedia = media.filter((item) => item.cardId === option.id);
          return (
            <button
              className={`choice-button ${answered && option.id === card.id ? 'correct' : ''} ${answered && option.id === selectedId && !correct ? 'wrong' : ''}`}
              disabled={answered}
              type="button"
              key={option.id}
              onClick={() => setSelectedId(option.id)}
            >
              <span>{option.backText || t.deck.imageOnly}</span>
              <CardMediaList media={optionMedia} side="back" />
            </button>
          );
        })}
      </div>
      {answered && (
        <motion.div className={`feedback-box ${correct ? 'success-box' : 'error-box'}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          {correct ? t.study.correct : t.study.wrong(card.backText || t.deck.imageOnly)}
        </motion.div>
      )}
      {revealed && (
        <div className="answer-detail">
          <p className="side-label">{t.study.cardDetail}</p>
          <p>{card.backText || t.deck.imageOnly}</p>
          <CardMediaList media={media.filter((item) => item.cardId === card.id)} side="back" />
        </div>
      )}
      <div className="button-row">
        <button className="primary-button" disabled={!answered} onClick={next}>{t.study.nextQuestion}</button>
        <button className="secondary-button" onClick={onShowDetail}>{t.study.showDetail}</button>
      </div>
    </article>
  );
}

function WritingMode({ card, media, onRate }: {
  card: Card;
  media: Media[];
  onRate: (rating: Rating) => void;
}) {
  const [answer, setAnswer] = useState('');
  const [strict, setStrict] = useState(false);
  const [result, setResult] = useState<FuzzyResult>();
  useEffect(() => {
    setAnswer('');
    setResult(undefined);
  }, [card.id]);

  function submit(event: FormEvent) {
    event.preventDefault();
    setResult(compareFuzzy(card.backText || t.deck.imageOnly, answer, strict));
  }

  function next() {
    if (!result) return;
    onRate(result.accepted ? 'good' : 'again');
    setAnswer('');
    setResult(undefined);
  }

  return (
    <article className="mode-panel">
      <div className="review-side">
        <p className="side-label">{t.study.front}</p>
        <p className="review-text compact">{card.frontText || t.deck.imageOnly}</p>
        <CardMediaList media={media} side="front" />
      </div>
      <div className="segmented">
        <button className={!strict ? 'active' : ''} type="button" onClick={() => setStrict(false)}>{t.study.tolerant}</button>
        <button className={strict ? 'active' : ''} type="button" onClick={() => setStrict(true)}>{t.study.strict}</button>
      </div>
      <form className="stack" onSubmit={submit}>
        <label>
          {t.study.yourAnswer}
          <input value={answer} onChange={(event) => setAnswer(event.target.value)} autoFocus />
        </label>
        <button className="primary-button" type="submit" disabled={!answer.trim()}>{t.study.evaluate}</button>
      </form>
      {result && (
        <motion.div className="writing-result" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div className={result.accepted ? 'success-box' : 'error-box'}>
            {t.study.similarity(result.similarity)} · {result.accepted ? t.study.accepted : t.study.rejected}
          </div>
          <p><strong>{t.study.back}:</strong> {card.backText || t.deck.imageOnly}</p>
          <div className="diff-row">
            {result.diff.map((part, index) => (
              <span className={`diff-${part.type}`} key={`${part.value}-${index}`}>{part.value}</span>
            ))}
          </div>
          <button className="primary-button full-width" onClick={next}>{t.common.done}</button>
        </motion.div>
      )}
    </article>
  );
}

function SessionEmpty({ total, dueCount, completed, mistakes, onBack, onStart, onRetryMistakes }: {
  total: number;
  dueCount: number;
  completed: number;
  mistakes: number;
  onBack: () => void;
  onStart: (source: StudySessionSource, mode?: StudyMode) => void;
  onRetryMistakes: () => void;
}) {
  return (
    <div className="study-done modern-empty">
      <h2>{dueCount === 0 ? t.study.allDoneTitle : t.study.sessionDoneTitle}</h2>
      <p>{t.study.cardsDone}: {completed} · {t.study.inDeck}: {total} · {t.study.dueNow}: {dueCount}</p>
      <div className="session-actions">
        <button className="primary-button" onClick={() => onStart('all')}>{sourceLabels.all}</button>
        <button className="secondary-button" onClick={() => onStart('lapsed')}>{sourceLabels.lapsed}</button>
        <button className="secondary-button" onClick={() => onStart('random')}>{sourceLabels.random}</button>
        <button className="secondary-button" onClick={onRetryMistakes} disabled={mistakes === 0}>{sourceLabels.mistakes} ({mistakes})</button>
        <button className="secondary-button" onClick={() => onStart('due')}>{t.study.reset}</button>
        <button className="secondary-button" onClick={onBack}>{t.common.back}</button>
      </div>
    </div>
  );
}

function RatingButtons({ onRate }: { onRate: (rating: Rating) => void }) {
  return (
    <div className="rating-grid">
      {(Object.keys(ratingLabels) as Rating[]).map((rating) => (
        <button className={`rating-button rating-${rating}`} key={rating} onClick={() => onRate(rating)}>
          {ratingLabels[rating]}
        </button>
      ))}
    </div>
  );
}

function vibrate(duration: number) {
  if ('vibrate' in navigator) {
    navigator.vibrate(duration);
  }
}
