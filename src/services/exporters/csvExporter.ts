import type { Card } from '../../types';

export function cardsToCsv(cards: Card[]): string {
  const header = ['front', 'back', 'tags', 'image'];
  const rows = cards.map((card) => [
    card.frontText,
    card.backText,
    card.tags.join(','),
    card.imageIds[0] ?? ''
  ]);

  return [header, ...rows]
    .map((row) => row.map(escapeCsvCell).join(','))
    .join('\n');
}

function escapeCsvCell(value: string): string {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}
