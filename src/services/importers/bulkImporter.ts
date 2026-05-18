import type { ImportPreview, ParsedImportCard } from '../../types';
import { normalizeTags } from './csvImporter';

export function previewBulkCards(input: string): ImportPreview {
  let skippedRows = 0;
  const cards: ParsedImportCard[] = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      const keep = Boolean(line);
      if (!keep) skippedRows += 1;
      return keep;
    })
    .map((line) => {
      const { frontText, backText, tagsText } = parseBulkLine(line);
      const errors: string[] = [];
      if (!frontText && !backText) errors.push('Chybí otázka nebo odpověď.');
      return {
        frontText,
        backText,
        tags: normalizeTags(tagsText),
        errors
      };
    });

  return {
    cards,
    skippedRows,
    warnings: cards.length === 0 ? ['Zadejte řádky ve formátu otázka: odpověď. Tagy můžete doplnit jako třetí část přes :: tagy.'] : []
  };
}

function parseBulkLine(line: string): { frontText: string; backText: string; tagsText: string } {
  if (line.includes('::')) {
    const [frontText = '', backText = '', tagsText = ''] = line.split('::').map((part) => part.trim());
    return { frontText, backText, tagsText };
  }

  const separatorIndex = line.indexOf(':');
  if (separatorIndex === -1) {
    return { frontText: line.trim(), backText: '', tagsText: '' };
  }

  return {
    frontText: line.slice(0, separatorIndex).trim(),
    backText: line.slice(separatorIndex + 1).trim(),
    tagsText: ''
  };
}
