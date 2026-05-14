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
      const [frontText = '', backText = '', tagsText = ''] = line.split('::').map((part) => part.trim());
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
    warnings: cards.length === 0 ? ['Zadejte řádky ve formátu Otázka :: Odpověď :: tagy.'] : []
  };
}
