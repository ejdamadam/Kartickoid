import type { Card, EntityId, ImportPreview, ParsedImportCard } from '../../types';
import { createCardInput } from '../../db/database';

export interface CsvImportResult {
  cards: Card[];
  skippedRows: number;
}

export function parseCsvCards(text: string, deckId: EntityId): CsvImportResult {
  const preview = previewCsvCards(text);
  return {
    cards: preview.cards
      .filter((card) => card.errors.length === 0)
      .map((card) => createCardInput(deckId, card.frontText, card.backText, card.tags)),
    skippedRows: preview.skippedRows + preview.cards.filter((card) => card.errors.length > 0).length
  };
}

export function previewCsvCards(text: string, mapping = { front: 'front', back: 'back', tags: 'tags', image: 'image' }): ImportPreview {
  const rows = parseCsv(text);
  const warnings: string[] = [];
  let skippedRows = 0;

  if (rows.length === 0) {
    return { cards: [], skippedRows: 0, warnings: ['Soubor neobsahuje žádné řádky.'] };
  }

  const header = rows[0].map((cell) => cell.trim().toLowerCase());
  const hasHeader = header.some((cell) => ['front', 'fronttext', 'question', 'otazka'].includes(cell))
    || header.some((cell) => ['back', 'backtext', 'answer', 'odpoved'].includes(cell));

  const fieldIndex = {
    front: findColumn(header, [mapping.front, 'front', 'fronttext', 'question', 'otazka'], 0),
    back: findColumn(header, [mapping.back, 'back', 'backtext', 'answer', 'odpoved'], 1),
    tags: findColumn(header, [mapping.tags, 'tags', 'tagy'], 2),
    image: findColumn(header, [mapping.image, 'image', 'obrazek', 'media'], 3)
  };

  if (!hasHeader) {
    warnings.push('CSV nemá rozpoznanou hlavičku, používám pořadí front, back, tags, image.');
  }

  const dataRows = hasHeader ? rows.slice(1) : rows;
  const cards: ParsedImportCard[] = dataRows.map((row) => {
    const frontText = row[fieldIndex.front]?.trim() ?? '';
    const backText = row[fieldIndex.back]?.trim() ?? '';
    const card: ParsedImportCard = {
      frontText,
      backText,
      tags: normalizeTags(row[fieldIndex.tags] ?? ''),
      image: row[fieldIndex.image]?.trim(),
      errors: []
    };

    if (!row.some((cell) => cell.trim())) {
      skippedRows += 1;
      card.errors.push('Prázdný řádek.');
    }
    if (!frontText && !backText && !card.image) card.errors.push('Chybí text nebo obrázek.');

    return card;
  }).filter((card) => card.errors[0] !== 'Prázdný řádek.');

  return { cards, skippedRows, warnings };
}

export function normalizeTags(value: string): string[] {
  return Array.from(new Set(value
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)));
}

export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(field);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);

  return rows;
}

function findColumn(header: string[], names: string[], fallback: number): number {
  const normalizedNames = names.map((name) => name.toLowerCase());
  const index = header.findIndex((cell) => normalizedNames.includes(cell));
  return index >= 0 ? index : fallback;
}
