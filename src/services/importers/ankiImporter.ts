import type { Card, PendingCardMedia } from '../../types';
import { createId } from '../../utils/id';
import { nowIso } from '../../utils/date';

export async function importAnkiXml(xmlText: string, blobs: Map<string, Blob>): Promise<{ cards: { card: Card, media: PendingCardMedia[] }[] }> {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
  const cardElements = xmlDoc.getElementsByTagName('card');
  const result: { card: Card, media: PendingCardMedia[] }[] = [];

  for (let i = 0; i < cardElements.length; i++) {
    const cardEl = cardElements[i];
    const frontEl = cardEl.querySelector('rich-text[name="Front"]');
    const backEl = cardEl.querySelector('rich-text[name="Back"]');

    let frontContent = frontEl?.innerHTML || '';
    let backContent = backEl?.innerHTML || '';

    const cardMedia: PendingCardMedia[] = [];

    // Helper to process content and extract blobs
    const processContent = (content: string, side: 'front' | 'back') => {
      const blobRegex = /\{\{blob ([a-f0-9]+)\}\}/g;
      let cleanContent = content;
      let match;
      while ((match = blobRegex.exec(content)) !== null) {
        const hash = match[1];
        const blob = blobs.get(hash);
        if (blob) {
          cardMedia.push({
            id: createId('media'),
            side,
            blob,
            mimeType: blob.type || 'image/jpeg',
            type: 'image',
            name: hash,
            createdAt: nowIso()
          });
        }
      }
      return cleanContent.replace(blobRegex, '');
    };

    const cleanFront = processContent(frontContent, 'front');
    const cleanBack = processContent(backContent, 'back');

    const newCard: Card = {
      id: createId('card'),
      deckId: '',
      frontText: cleanFront,
      backText: cleanBack,
      imageIds: [],
      tags: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
      dueAt: nowIso(),
      intervalDays: 0,
      ease: 2.5,
      repetitions: 0,
      lapses: 0
    };

    result.push({ card: newCard, media: cardMedia });
  }

  return { cards: result };
}
