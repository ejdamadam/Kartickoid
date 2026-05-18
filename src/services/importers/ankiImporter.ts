import type { Card, CardSide, PendingCardMedia } from '../../types';
import { processImportedMedia } from '../mediaProcessing';
import { createId } from '../../utils/id';
import { nowIso } from '../../utils/date';

export interface ParsedAnkiCard {
  card: Card;
  mediaRefs: AnkiMediaRef[];
}

export interface AnkiMediaRef {
  hash: string;
  side: CardSide;
  mimeType?: string;
  name?: string;
  compressAudio?: boolean;
  readAudioDuration?: boolean;
}

function sanitizeHtml(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  
  function clean(node: Node) {
    Array.from(node.childNodes).forEach(child => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        if (!['P', 'DIV', 'UL', 'OL', 'LI', 'B', 'I', 'STRONG', 'EM', 'BR', 'SUB', 'SUP'].includes(el.tagName.toUpperCase())) {
           while (el.firstChild) el.parentNode?.insertBefore(el.firstChild, el);
           el.parentNode?.removeChild(el);
        } else {
           while (el.attributes.length > 0) el.removeAttribute(el.attributes[0].name);
           clean(child);
        }
      } else if (child.nodeType === Node.TEXT_NODE) {
        child.textContent = child.textContent?.replace(/\s+/g, ' ') || '';
      }
    });
  }
  
  clean(div);
  return div.innerHTML.trim();
}

function findNamedChild(parent: Element, tagName: string, name: string): Element | undefined {
  const normalizedTag = tagName.toLowerCase();
  const normalizedName = name.toLowerCase();
  return Array.from(parent.children).find((child) => (
    child.localName.toLowerCase() === normalizedTag
    && (child.getAttribute('name') ?? '').toLowerCase() === normalizedName
  ));
}

function findDirectChild(parent: Element, tagName: string): Element | undefined {
  const normalizedTag = tagName.toLowerCase();
  return Array.from(parent.children).find((child) => child.localName.toLowerCase() === normalizedTag);
}

export function previewAnkiXml(xmlText: string): { cardCount: number; deckName?: string } {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
  const deckEl = xmlDoc.querySelector('deck');
  return {
    cardCount: xmlDoc.getElementsByTagName('card').length,
    deckName: deckEl?.getAttribute('name') || undefined
  };
}

export function parseAnkiXml(xmlText: string): ParsedAnkiCard[] {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
  const deckEl = xmlDoc.querySelector('deck');
  const deckTags = deckEl?.getAttribute('tags')?.split(',').map(t => t.trim()).filter(Boolean) || [];
  
  const cardElements = xmlDoc.getElementsByTagName('card');
  const result: ParsedAnkiCard[] = [];

  for (let i = 0; i < cardElements.length; i++) {
    const cardEl = cardElements[i];
    
    const frontEl = findNamedChild(cardEl, 'rich-text', 'front');
    const backEl = findNamedChild(cardEl, 'rich-text', 'back');
    const speechEl = findNamedChild(cardEl, 'audio', 'speech');
    const audioEl = speechEl ? findDirectChild(speechEl, 'audio') : undefined;
    const textEl = findNamedChild(cardEl, 'text', 'text');

    let frontText = '';
    let backText = '';
    const mediaRefs: AnkiMediaRef[] = [];

    if (audioEl) {
      frontText = '';
      backText = textEl?.textContent || '';
      const hash = audioEl.getAttribute('id') || '';
      if (hash) {
        mediaRefs.push({
          hash,
          side: 'front',
          mimeType: audioEl.getAttribute('type') || 'audio/mpeg',
          name: 'Audio',
          compressAudio: false,
          readAudioDuration: false
        });
      }
    } else if (frontEl || backEl) {
      const processContent = (content: string, side: CardSide) => {
        const blobRegex = /\{\{blob ([a-f0-9]+)\}\}/g;
        let match;
        while ((match = blobRegex.exec(content)) !== null) {
          mediaRefs.push({
            hash: match[1],
            side,
            name: match[1],
            compressAudio: false,
            readAudioDuration: false
          });
        }
        return sanitizeHtml(content.replace(blobRegex, ''));
      };
      frontText = processContent(frontEl?.innerHTML || '', 'front');
      backText = processContent(backEl?.innerHTML || '', 'back');
    }

    const timestamp = nowIso();
    const newCard: Card = {
      id: createId('card'),
      deckId: '',
      frontText,
      backText,
      imageIds: [],
      tags: deckTags,
      createdAt: timestamp,
      updatedAt: timestamp,
      dueAt: timestamp,
      intervalDays: 0,
      ease: 2.5,
      repetitions: 0,
      lapses: 0,
      starred: false
    };

    result.push({ card: newCard, mediaRefs });
  }

  return result;
}

export async function importAnkiXml(
  xmlText: string,
  blobs: Map<string, Blob>,
  options: { onProgress?: (processed: number, total: number) => void } = {}
): Promise<{ cards: { card: Card, media: PendingCardMedia[] }[] }> {
  const parsedCards = parseAnkiXml(xmlText);
  const result: { card: Card, media: PendingCardMedia[] }[] = [];

  for (let i = 0; i < parsedCards.length; i++) {
    const parsed = parsedCards[i];
    const cardMedia: PendingCardMedia[] = [];

    for (const mediaRef of parsed.mediaRefs) {
      const blob = blobs.get(mediaRef.hash);
      if (blob) {
        cardMedia.push(await processImportedMedia(blob, mediaRef.side, {
          mimeType: mediaRef.mimeType,
          name: mediaRef.name,
          compressAudio: mediaRef.compressAudio,
          readAudioDuration: mediaRef.readAudioDuration
        }));
      }
    }

    result.push({ card: parsed.card, media: cardMedia });
    options.onProgress?.(i + 1, parsedCards.length);
  }

  return { cards: result };
}
