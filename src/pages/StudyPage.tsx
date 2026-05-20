import { useEffect, useMemo, useRef, useState, type FormEvent, type TouchEvent as ReactTouchEvent } from 'react';
import { animate, motion, useMotionValue, useTransform, type PanInfo, AnimatePresence } from 'framer-motion';
import RichTextDisplay from '../components/RichTextDisplay';
import CardMediaList from '../components/CardMediaList';
import { db } from '../db/database';
import { scheduleCard } from '../services/scheduler';
import { loadStudyCards, type StudyFilter } from '../services/studySessions';
import type { Card, Deck, Media, Rating, StudyMode, StudySessionSource } from '../types';
import { compareFuzzy, type FuzzyResult } from '../utils/fuzzy';
import { createId } from '../utils/id';
import { shuffle, takeRandom } from '../utils/random';
import { t } from '../i18n';

interface StudyPageProps {
  deckIds: string[];
  tags: string[];
  initialSource?: StudySessionSource;
  initialLimit?: number;
  initialOrder?: 'default' | 'random';
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
  mistakes: t.study.mistakes,
  new: 'Nové kartičky'
};

export default function StudyPage({ deckIds, tags, initialSource = 'due', initialLimit = 0, initialOrder = 'default', onBack, onChanged }: StudyPageProps) {
  const [deckNames, setDeckNames] = useState<string[]>([]);
  const [allCards, setAllCards] = useState<Card[]>([]);
  const [queue, setQueue] = useState<Card[]>([]);
  const [media, setMedia] = useState<Media[]>([]);
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<StudyMode>('learning');
  const [source, setSource] = useState<StudySessionSource>(initialSource);
  const [revealed, setRevealed] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [previousCards, setPreviousCards] = useState<Card[]>([]);
  const [mistakeIds, setMistakeIds] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  const [limit, setLimit] = useState<number>(initialLimit);
  const [order, setOrder] = useState<'default' | 'random'>(initialOrder);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    
    const filter: StudyFilter = { deckIds, tags };
    
    Promise.all([
      db.decks.where('id').anyOf(deckIds).toArray(),
      loadStudyCards(filter, source, { limit, order }),
      db.cards.where('deckId').anyOf(deckIds).toArray()
    ])
      .then(async ([decks, sessionCards, deckCards]) => {
        const deckMedia = await loadMediaForCards(deckCards.map((card) => card.id));
        if (!active) return;
        setDeckNames(decks.map(d => d.name));
        setAllCards(deckCards);
        setMedia(deckMedia);

        setQueue(sessionCards);
        
        setIndex(0);
        setCompleted(0);
        setPreviousCards([]);
        setRevealed(false);
        setLoading(false);
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
  }, [deckIds, tags, source, sessionKey]);

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
          deckId: card.deckId,
          rating,
          reviewedAt: reviewedAt.toISOString()
        });
      });
      if (rating === 'again' || rating === 'hard') {
        setMistakeIds((ids) => Array.from(new Set([...ids, card.id])));
      }
      onChanged();
      setPreviousCards((cards) => [...cards, card]);
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
    setPreviousCards([]);
    setSessionKey((value) => value + 1);
  }

  function retryMistakes() {
    const retryCards = allCards.filter((card) => mistakeIds.includes(card.id));
    setQueue(retryCards);
    setIndex(0);
    setCompleted(0);
    setPreviousCards([]);
    setRevealed(false);
  }

  function repeatSameCards() {
    setQueue((cards) => order === 'random' ? shuffle(cards) : cards);
    setIndex(0);
    setCompleted(0);
    setPreviousCards([]);
    setRevealed(false);
  }

  function goPreviousCard() {
    const previous = previousCards.at(-1);
    if (!previous || index <= 0) return;
    setQueue((cards) => cards.map((card, cardIndex) => cardIndex === index - 1 ? previous : card));
    setPreviousCards((cards) => cards.slice(0, -1));
    setIndex((value) => Math.max(0, value - 1));
    setCompleted((value) => Math.max(0, value - 1));
    setRevealed(false);
  }

  async function toggleCurrentStarred(card: Card) {
    try {
      const starred = card.starred !== true;
      await db.cards.update(card.id, { starred });
      const updateCard = (item: Card) => item.id === card.id ? { ...item, starred } : item;
      setQueue((cards) => cards.map(updateCard));
      setAllCards((cards) => cards.map(updateCard));
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    }
  }

  if (loading) {
    return <section className="study-page mobile-study"><p className="muted">Načítám karty...</p></section>;
  }

  return (
    <section className="study-page mobile-study">
      <div className="study-header-compact">
        <button className="back-icon-button" onClick={onBack} aria-label="Zpět" title="Zpět">←</button>
        <h1>
            {deckNames.join(', ')}
        </h1>
        <span className="pill pill-muted study-progress-counter">{queue.length === 0 ? 0 : Math.min(index + 1, queue.length)} / {queue.length}</span>
      </div>

      <div className="mode-tabs compact-tabs" role="tablist" aria-label={t.study.title}>
        {(Object.keys(modeLabels) as StudyMode[]).map((item) => (
          <button className={mode === item ? 'active' : ''} key={item} onClick={() => setMode(item)}>
            {modeLabels[item]}
          </button>
        ))}
      </div>

      {error && <p className="error-box">{error}</p>}

      <AnimatePresence mode="wait">
        {!currentCard ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94 }}
          >
            <SessionEmpty
              total={allCards.length}
              dueCount={dueCount}
              completed={completed}
              mistakes={mistakeIds.length}
              limit={limit}
              setLimit={setLimit}
              order={order}
              setOrder={setOrder}
              onBack={onBack}
              onRepeatSame={repeatSameCards}
              onStart={startSession}
              onRetryMistakes={retryMistakes}
            />
          </motion.div>
        ) : (
          <motion.div
            key={currentCard.id}
            initial={{ opacity: 0, scale: 0.88, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.05, y: -20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30, opacity: { duration: 0.2 } }}
          >
            {mode === 'learning' && (
              <LearningCard
                card={currentCard}
                media={currentMedia}
                revealed={revealed}
                showHint={index === 0 && completed === 0}
                onFlip={() => setRevealed((value) => !value)}
                onRate={rate}
                onPrevious={goPreviousCard}
                canGoPrevious={previousCards.length > 0 && index > 0}
                onToggleStarred={() => void toggleCurrentStarred(currentCard)}
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
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function LearningCard({ card, media, revealed, showHint, onFlip, onRate, onPrevious, canGoPrevious, onToggleStarred }: {
  card: Card;
  media: Media[];
  revealed: boolean;
  showHint: boolean;
  onFlip: () => void;
  onRate: (rating: Rating) => void;
  onPrevious: () => void;
  canGoPrevious: boolean;
  onToggleStarred: () => void;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-220, 0, 220], [-10, 0, 10]);
  const goodOpacity = useTransform(x, [18, 100], [0, 1]);
  const againOpacity = useTransform(x, [-100, -18], [1, 0]);
  const easyOpacity = useTransform(y, [-100, -18], [1, 0]);
  const hardOpacity = useTransform(y, [18, 100], [0, 1]);
  const goodTintOpacity = useTransform(x, [20, 150], [0, 0.8]);
  const againTintOpacity = useTransform(x, [-150, -20], [0.8, 0]);
  const easyTintOpacity = useTransform(y, [-150, -20], [0.8, 0]);
  const hardTintOpacity = useTransform(y, [20, 150], [0, 0.8]);
  const [isDismissing, setIsDismissing] = useState(false);
  const frontScrollRef = useRef<HTMLDivElement>(null);
  const backScrollRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState({
    front: { overflow: false, atBottom: true },
    back: { overflow: false, atBottom: true }
  });
  const touchStartRef = useRef<{ x: number; y: number; locked: boolean } | undefined>(undefined);

  useEffect(() => {
    setIsDismissing(false);
    x.set(0);
    y.set(0);
    frontScrollRef.current?.scrollTo({ top: 0, left: 0 });
    backScrollRef.current?.scrollTo({ top: 0, left: 0 });
  }, [card.id, x, y]);

  useEffect(() => {
    const activeScroll = revealed ? backScrollRef.current : frontScrollRef.current;
    activeScroll?.scrollTo({ top: 0, left: 0 });
  }, [revealed]);

  useEffect(() => {
    const elements = [
      { side: 'front' as const, element: frontScrollRef.current },
      { side: 'back' as const, element: backScrollRef.current }
    ];

    const updateSide = (side: 'front' | 'back', element: HTMLDivElement | null) => {
      if (!element) return;
      const overflow = element.scrollHeight > element.clientHeight + 2;
      const atBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 3;
      setScrollState((state) => {
        const current = state[side];
        if (current.overflow === overflow && current.atBottom === atBottom) return state;
        return { ...state, [side]: { overflow, atBottom } };
      });
    };

    elements.forEach(({ side, element }) => updateSide(side, element));

    const observers = elements
      .filter((item): item is { side: 'front' | 'back'; element: HTMLDivElement } => Boolean(item.element))
      .map(({ side, element }) => {
        const observer = new ResizeObserver(() => updateSide(side, element));
        observer.observe(element);
        const inner = element.firstElementChild;
        if (inner) observer.observe(inner);
        return observer;
      });

    return () => observers.forEach((observer) => observer.disconnect());
  }, [card.id, media, revealed]);

  function handleReviewScroll(side: 'front' | 'back') {
    const element = side === 'front' ? frontScrollRef.current : backScrollRef.current;
    if (!element) return;
    const overflow = element.scrollHeight > element.clientHeight + 2;
    const atBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 3;
    setScrollState((state) => {
      const current = state[side];
      if (current.overflow === overflow && current.atBottom === atBottom) return state;
      return { ...state, [side]: { overflow, atBottom } };
    });
  }

  async function dismissCard(rating: Rating, target: { x: number; y: number }) {
    if (isDismissing) return;
    setIsDismissing(true);
    await Promise.all([
      animate(x, target.x, { duration: 0.18, ease: [0.2, 0, 0.2, 1] }).finished,
      animate(y, target.y, { duration: 0.18, ease: [0.2, 0, 0.2, 1] }).finished
    ]);
    onRate(rating);
  }

  function onDragEnd(_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    const { offset, velocity } = info;
    const horizontal = Math.abs(offset.x) > Math.abs(offset.y);
    const forceX = Math.abs(offset.x) + Math.abs(velocity.x) * 0.18;
    const forceY = Math.abs(offset.y) + Math.abs(velocity.y) * 0.18;
    const throwDistance = Math.max(window.innerWidth, window.innerHeight) * 1.15;

    if (horizontal && forceX > 120) {
      void dismissCard(offset.x > 0 ? 'good' : 'again', {
        x: offset.x > 0 ? throwDistance * 0.9 : -throwDistance * 0.9,
        y: offset.y * 0.35
      });
      return;
    }
    if (!horizontal && forceY > 120) {
      void dismissCard(offset.y < 0 ? 'easy' : 'hard', {
        x: offset.x * 0.35,
        y: offset.y < 0 ? -throwDistance * 0.9 : throwDistance * 0.9
      });
    }
  }

  function handleTouchStart(event: ReactTouchEvent<HTMLDivElement>) {
    const interactiveTarget = (event.target as HTMLElement).closest('audio, button, .audio-shell');
    if (interactiveTarget) {
      touchStartRef.current = undefined;
      return;
    }
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, locked: false };
  }

  function handleTouchMove(event: ReactTouchEvent<HTMLDivElement>) {
    const start = touchStartRef.current;
    const touch = event.touches[0];
    if (!start || !touch) return;

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const primaryDrag = Math.abs(dx) > 14 || Math.abs(dy) > 14;

    if (primaryDrag) {
      start.locked = true;
    }
    if (start.locked && event.cancelable) {
      event.preventDefault();
    }
  }

  function handleTouchEnd() {
    touchStartRef.current = undefined;
  }

  function handleTap(event: any, info: any) {
    const interactiveTarget = event.target.closest('audio, button, .audio-shell');
    if (interactiveTarget) {
      return;
    }
    onFlip();
  }

  return (
    <div className="learning-shell">
      <motion.div
        className={`swipe-card-shell ${revealed ? 'is-flipped' : ''}`}
        style={{ x, y, rotate }}
        drag={!isDismissing}
        dragElastic={0.22}
        dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
        whileTap={{ scale: 0.985 }}
        onTap={handleTap}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onDragEnd={onDragEnd}
      >
        {/*
        <motion.div className="swipe-indicator good" style={{ opacity: goodOpacity }}>{t.study.good}</motion.div>
        <motion.div className="swipe-indicator again" style={{ opacity: againOpacity }}>{t.study.again}</motion.div>
        <motion.div className="swipe-indicator easy" style={{ opacity: easyOpacity }}>{t.study.easy}</motion.div>
        <motion.div className="swipe-indicator hard" style={{ opacity: hardOpacity }}>{t.study.hard}</motion.div>
        */}

        <div className="swipe-card">
          <motion.div
            className="flip-card-inner"
            animate={{ rotateY: revealed ? 180 : 0 }}
            transition={{ duration: 0.46, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flip-card-face flip-card-front">
              <CardToolbar
                starred={card.starred === true}
                canGoPrevious={canGoPrevious}
                onPrevious={onPrevious}
                onToggleStarred={onToggleStarred}
              />
              <div className="review-side centered">
                <p className="side-label">{t.deck.frontSide}</p>
                <div
                  className={`review-scroll ${scrollState.front.overflow ? 'has-overflow' : ''}`}
                  ref={frontScrollRef}
                  onScroll={() => handleReviewScroll('front')}
                >
                  <div className="review-scroll-inner">
                    <div className="review-text"><RichTextDisplay content={card.frontText} /></div>
                    <CardMediaList media={media} side="front" hideMeta />
                  </div>
                </div>
                <span
                  className={`review-scroll-cue ${scrollState.front.overflow && !scrollState.front.atBottom ? 'is-visible' : ''}`}
                  title="Obsah pokračuje níž"
                  aria-hidden="true"
                />
              </div>
            </div>
            <div className="flip-card-face flip-card-back">
              <CardToolbar
                starred={card.starred === true}
                canGoPrevious={canGoPrevious}
                onPrevious={onPrevious}
                onToggleStarred={onToggleStarred}
              />
              <div className="review-side centered">
                <p className="side-label">{t.deck.backSide}</p>
                <div
                  className={`review-scroll ${scrollState.back.overflow ? 'has-overflow' : ''}`}
                  ref={backScrollRef}
                  onScroll={() => handleReviewScroll('back')}
                >
                  <div className="review-scroll-inner">
                    <div className="review-text"><RichTextDisplay content={card.backText} /></div>
                    <CardMediaList media={media} side="back" hideMeta />
                  </div>
                </div>
                <span
                  className={`review-scroll-cue ${scrollState.back.overflow && !scrollState.back.atBottom ? 'is-visible' : ''}`}
                  title="Obsah pokračuje níž"
                  aria-hidden="true"
                />
              </div>
            </div>
          </motion.div>
          <motion.div className="swipe-card-tint good" style={{ opacity: goodTintOpacity }}>{t.study.good}</motion.div>
          <motion.div className="swipe-card-tint again" style={{ opacity: againTintOpacity }}>{t.study.again}</motion.div>
          <motion.div className="swipe-card-tint easy" style={{ opacity: easyTintOpacity }}>{t.study.easy}</motion.div>
          <motion.div className="swipe-card-tint hard" style={{ opacity: hardTintOpacity }}>{t.study.hard}</motion.div>
        </div>
      </motion.div>
      {showHint && <p className="gesture-hint">{t.study.hint}</p>}
    </div>
  );
}

function CardToolbar({ starred, canGoPrevious, onPrevious, onToggleStarred }: {
  starred: boolean;
  canGoPrevious: boolean;
  onPrevious: () => void;
  onToggleStarred: () => void;
}) {
  return (
    <div className="study-card-toolbar">
      <button
        className={`star-button ${starred ? 'active' : ''}`}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggleStarred();
        }}
        aria-label={starred ? 'Odebrat hvězdičku' : 'Označit hvězdičkou'}
        title={starred ? 'Odebrat hvězdičku' : 'Označit hvězdičkou'}
      >
        {starred ? '★' : '☆'}
      </button>
      <button className="back-icon-button card-back-control" type="button" onClick={(event) => { event.stopPropagation(); onPrevious(); }} disabled={!canGoPrevious} aria-label="Předchozí kartička" title="Předchozí kartička">
        ←
      </button>
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

  const answered = Boolean(selectedId);
  const correct = selectedId === card.id;
  function handleSkip() {
    setSelectedId('SKIPPED');
  }

  function next() {
    onRate(correct ? 'good' : 'again');
    setSelectedId(undefined);
  }

  useEffect(() => {
    if (answered && correct) {
      const timer = window.setTimeout(next, 1500);
      return () => window.clearTimeout(timer);
    }
  }, [answered, correct]);

  const praise = useMemo(() => takeRandom(t.study.praises, 1)[0], [card.id]);
  const encouragement = useMemo(() => takeRandom(t.study.encouragements, 1)[0], [card.id]);

  return (
    <article className="mode-panel">
      <div className="review-side">
        <p className="side-label">{t.study.front}</p>
        <div className="review-text compact"><RichTextDisplay content={card.frontText} /></div>
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
              <div className="choice-text"><RichTextDisplay content={option.backText} /></div>
              <CardMediaList media={optionMedia} side="back" />
            </button>
          );
        })}
      </div>
      {answered && (
        <motion.div className={`feedback-box ${correct ? 'success-box' : 'error-box'}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          {correct ? praise : (
            <>
              <p>{encouragement}</p>
              <RichTextDisplay content={card.backText} />
            </>
          )}
        </motion.div>
      )}
      
      <div className="button-row">
        {!answered ? (
           <button className="secondary-button" onClick={handleSkip}>{'Přeskočit'}</button>
        ) : (
           <button className="primary-button" onClick={next}>{t.study.nextQuestion}</button>
        )}
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
  
  let targetDisplayFront = card.frontText;
  let targetDisplayBack = card.backText;
  let targetFrontMedia = media.filter(m => m.side === 'front');
  let targetBackMedia = media.filter(m => m.side === 'back');
  let swapped = false;

  if (!targetDisplayBack && targetDisplayFront) {
      targetDisplayBack = card.frontText;
      targetDisplayFront = card.backText;
      targetFrontMedia = media.filter(m => m.side === 'back');
      targetBackMedia = media.filter(m => m.side === 'front');
      swapped = true;
  }

  useEffect(() => {
    setAnswer('');
    setResult(undefined);
  }, [card.id]);

  function submit(event: FormEvent) {
    event.preventDefault();
    setResult(compareFuzzy(targetDisplayBack, answer, strict));
  }

  function next() {
    if (!result) return;
    onRate(result.accepted ? 'good' : 'again');
    setAnswer('');
    setResult(undefined);
  }

  const praise = useMemo(() => takeRandom(t.study.praises, 1)[0], [card.id]);
  const encouragement = useMemo(() => takeRandom(t.study.encouragements, 1)[0], [card.id]);

  if (!targetDisplayFront && !targetDisplayBack) {
      return <article className="mode-panel"><p className="muted">Kartičku nelze v tomto režimu procvičit.</p></article>;
  }

  return (
    <article className="mode-panel">
      <div className="review-side">
        <p className="side-label">{t.study.front}</p>
        {targetDisplayFront && <RichTextDisplay content={targetDisplayFront} />}
        <CardMediaList media={targetFrontMedia} side={swapped ? 'back' : 'front'} />
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
            {result.accepted ? praise : (
              <>
                <p>{encouragement}</p>
                {t.study.similarity(result.similarity)} · {t.study.rejected}
              </>
            )}
          </div>
          <p><strong>{t.study.back}:</strong> <RichTextDisplay content={targetDisplayBack} /></p>
          <CardMediaList media={targetBackMedia} side={swapped ? 'front' : 'back'} />
          <button className="primary-button full-width" onClick={next}>{t.common.done}</button>
        </motion.div>
      )}
    </article>
  );
}

function SessionEmpty({ total, dueCount, completed, mistakes, limit, setLimit, order, setOrder, onBack, onRepeatSame, onStart, onRetryMistakes }: {
  total: number;
  dueCount: number;
  completed: number;
  mistakes: number;
  limit: number;
  setLimit: (limit: number) => void;
  order: 'default' | 'random';
  setOrder: (order: 'default' | 'random') => void;
  onBack: () => void;
  onRepeatSame: () => void;
  onStart: (source: StudySessionSource, mode?: StudyMode) => void;
  onRetryMistakes: () => void;
}) {
  return (
    <div className="study-done modern-empty">
      <h2>{dueCount === 0 ? t.study.allDoneTitle : t.study.sessionDoneTitle}</h2>
      <p>{t.study.cardsDone}: {completed} · {t.study.inDeck}: {total} · {t.study.dueNow}: {dueCount}</p>

      <div className="limit-selector">
        <p className="side-label">Karet v průchodu</p>
        <div className="segmented">
          {[10, 20, 50, 0].map((val) => (
            <button
              key={val}
              className={limit === val ? 'active' : ''}
              onClick={() => setLimit(val)}
            >
              {val === 0 ? 'Vše' : val}
            </button>
          ))}
        </div>
      </div>

      <div className="limit-selector">
        <p className="side-label">Pořadí</p>
        <div className="segmented">
          <button className={order === 'default' ? 'active' : ''} onClick={() => setOrder('default')}>Výchozí</button>
          <button className={order === 'random' ? 'active' : ''} onClick={() => setOrder('random')}>Náhodné</button>
        </div>
      </div>
      
      <div className="session-actions">
        <button className="primary-button" onClick={onRepeatSame}>Procvičit znovu</button>
        <p className="muted session-action-note">Procvičit znovu zopakuje právě dokončený výběr. Nový průchod znovu načte kartičky podle aktuálního limitu a pořadí.</p>
        <button className="secondary-button" onClick={() => onStart('due')}>{t.study.reset}</button>
        <button className="secondary-button" onClick={() => onStart('all')}>Všechny kartičky</button>
        <button className="secondary-button" onClick={() => onStart('lapsed')}>{sourceLabels.lapsed}</button>
        <button className="secondary-button" onClick={() => onStart('random')}>{sourceLabels.random}</button>
        <button className="secondary-button" onClick={onRetryMistakes} disabled={mistakes === 0}>{sourceLabels.mistakes} ({mistakes})</button>
        <button className="secondary-button" onClick={onBack}>{t.common.back}</button>
      </div>
    </div>
  );
}

function vibrate(duration: number) {
  if ('vibrate' in navigator) {
    navigator.vibrate(duration);
  }
}

async function loadMediaForCards(cardIds: string[]): Promise<Media[]> {
  if (cardIds.length === 0) return [];
  return db.media.where('cardId').anyOf(cardIds).toArray();
}
