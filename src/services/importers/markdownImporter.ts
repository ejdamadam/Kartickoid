import type { ImportPreview, ParsedImportCard } from '../../types';
import { normalizeTags } from './csvImporter';

export function previewMarkdownCards(markdown: string): { deckName?: string; preview: ImportPreview } {
  const deckMatch = markdown.match(/^#\s*(?:Deck|Balíček|Balicek):\s*(.+)$/im);
  const blocks = markdown.split(/^##\s*(?:Card|Karta|Kartička|Karticka)\s*$/gim).slice(1);
  const cards: ParsedImportCard[] = [];
  const warnings: string[] = [];

  blocks.forEach((block) => {
    const frontText = extractField(block, ['Front', 'Přední', 'Predni', 'Otázka', 'Otazka']);
    const backText = extractField(block, ['Back', 'Zadní', 'Zadni', 'Odpověď', 'Odpoved']);
    const tagsText = extractField(block, ['Tags', 'Tagy']);
    const image = extractField(block, ['Image', 'Obrázek', 'Obrazek']);
    const errors: string[] = [];

    if (!frontText && !backText && !image) errors.push('Chybí text nebo obrázek.');

    cards.push({
      frontText,
      backText,
      tags: normalizeTags(tagsText),
      image: image || undefined,
      errors
    });
  });

  if (cards.length === 0) {
    warnings.push('Nenašel jsem žádný blok „## Karta”.');
  }

  return {
    deckName: deckMatch?.[1]?.trim(),
    preview: { cards, skippedRows: 0, warnings }
  };
}

function extractField(block: string, labels: string[]): string {
  const allLabels = ['Front', 'Přední', 'Predni', 'Otázka', 'Otazka', 'Back', 'Zadní', 'Zadni', 'Odpověď', 'Odpoved', 'Tags', 'Tagy', 'Image', 'Obrázek', 'Obrazek'];
  const current = labels.join('|');
  const otherLabels = allLabels.filter((item) => !labels.includes(item)).join('|');
  const regex = new RegExp(`(?:${current}):\\s*\\n([\\s\\S]*?)(?=\\n(?:${otherLabels}):\\s*\\n|$)`, 'i');
  return block.match(regex)?.[1]?.trim() ?? '';
}
