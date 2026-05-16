import type { Card, ReviewLog } from '../types';

export default function CardStatistics(props: { card: Card, logs: ReviewLog[] }) {
  const cardLogs = props.logs.filter((l) => l.cardId === props.card.id);
  const misses = cardLogs.filter((l) => l.rating === 'again' || l.rating === 'hard').length;
  
  return (
    <div className="card-stats">
      <small>
        Repetice: {props.card.repetitions} · Chyby: {misses} · 
        <span title="Faktor snadnosti: určuje, jak rychle se prodlužuje interval mezi opakováními. Čím vyšší, tím snadnější karta."> Snadnost: {props.card.ease.toFixed(2)}</span>
      </small>
    </div>
  );
}
