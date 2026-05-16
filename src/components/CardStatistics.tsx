import type { Card, ReviewLog } from '../types';

export default function CardStatistics(props: { card: Card, logs: ReviewLog[] }) {
  const cardLogs = props.logs.filter((l) => l.cardId === props.card.id);
  const misses = cardLogs.filter((l) => l.rating === 'again' || l.rating === 'hard').length;
  const easeDescription = `Snadnost ${props.card.ease.toFixed(2)} určuje, jak rychle se kartičce prodlužuje interval mezi opakováními. Nové kartičky začínají na 2.50; odpovědi Znovu a Těžké ji snižují, Snadné ji zvyšuje. Čím vyšší číslo, tím později se karta po správné odpovědi znovu objeví.`;
  
  return (
    <div className="card-stats">
      <small>
        Repetice: {props.card.repetitions} · Chyby: {misses} · 
        <span title={easeDescription}> Snadnost: {props.card.ease.toFixed(2)}</span>
      </small>
      <details>
        <summary>Co znamená snadnost?</summary>
        <p>{easeDescription}</p>
      </details>
    </div>
  );
}
