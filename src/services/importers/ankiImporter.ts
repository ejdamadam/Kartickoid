import type { Card, PendingCardMedia } from '../../types';
import { createId } from '../../utils/id';
import { nowIso } from '../../utils/date';

function sanitizeHtml(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  
  // Recursively clean and normalize
  function clean(node: Node) {
    node.childNodes.forEach(child => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        if (!['UL', 'LI', 'B', 'I', 'STRONG', 'EM', 'BR'].includes(el.tagName)) {
           // Unwrap tags: replace element with its children
           while (el.firstChild) el.parentNode?.insertBefore(el.firstChild, el);
           el.parentNode?.removeChild(el);
        } else {
           // Remove all attributes from allowed tags
           while (el.attributes.length > 0) el.removeAttribute(el.attributes[0].name);
           clean(child);
        }
      } else if (child.nodeType === Node.TEXT_NODE) {
        // Clean up excessive whitespace
        child.textContent = child.textContent?.replace(/\s+/g, ' ') || '';
      }
    });
  }
  
  clean(div);
  return div.innerHTML.trim();
}

export async function importAnkiXml(xmlText: string, blobs: Map<string, Blob>): Promise<{ cards: { card: Card, media: PendingCardMedia[] }[] }> {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
  const deckEl = xmlDoc.querySelector('deck');
  const deckTags = deckEl?.getAttribute('tags')?.split(',').map(t => t.trim()) || [];
  
  const cardElements = xmlDoc.getElementsByTagName('card');
  const result: { card: Card, media: PendingCardMedia[] }[] = [];

  for (let i = 0; i < cardElements.length; i++) {
    const cardEl = cardElements[i];
    const frontEl = cardEl.querySelector('rich-text[name="Front"]');
    const backEl = cardEl.querySelector('rich-text[name="Back"]');

    let frontContent = frontEl?.innerHTML || '';
    let backContent = backEl?.innerHTML || '';

    const cardMedia: PendingCardMedia[] = [];

    const processContent = (content: string, side: 'front' | 'back') => {
      const blobRegex = /\{\{blob ([a-f0-9]+)\}\}/g;
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
            type: blob.type.startsWith('audio/') ? 'audio' : 'image',
            name: hash,
            createdAt: nowIso()
          });
        }
      }
      return sanitizeHtml(content.replace(blobRegex, ''));
    };

    const cleanFront = processContent(backContent, 'front');
    const cleanBack = processContent(frontContent, 'back');

    const newCard: Card = {
      id: createId('card'),
      deckId: '',
      frontText: cleanFront,
      backText: cleanBack,
      imageIds: [],
      tags: deckTags,
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
