import { useEffect, useMemo, useState } from 'react';
import JSZip from 'jszip';
import { createCardInput, createDeckInput, db, addMediaToCard } from '../db/database';
import { importBackupFile } from '../services/exportImport';
import { previewCsvCards, parseCsvCards } from '../services/importers/csvImporter';
import { previewMarkdownCards } from '../services/importers/markdownImporter';
import { importAnkiXml } from '../services/importers/ankiImporter';
import type { Deck, ImportPreview, PendingCardMedia, Card } from '../types';
import { nowIso } from '../utils/date';
import { t } from '../i18n';

interface ImportPageProps {
  onBack: () => void;
  onChanged: () => void;
}

type ImportTab = 'json' | 'csv' | 'markdown' | 'anki';

const emptyPreview: ImportPreview = { cards: [], skippedRows: 0, warnings: [] };

export default function ImportPage({ onBack, onChanged }: ImportPageProps) {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [targetDeckId, setTargetDeckId] = useState('');
  const [tab, setTab] = useState<ImportTab>('json');
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [csvText, setCsvText] = useState('');
  const [csvFileName, setCsvFileName] = useState('');
  const [csvMapping, setCsvMapping] = useState({ front: 'front', back: 'back', tags: 'tags', image: 'image' });
  const [markdownText, setMarkdownText] = useState('');
  const [ankiData, setAnkiData] = useState<{ card: Card, media: PendingCardMedia[] }[]>([]);
  const [zipFileName, setZipFileName] = useState('');

  useEffect(() => {
    loadDecks();
  }, []);

  async function loadDecks() {
    try {
      const nextDecks = await db.decks.orderBy('updatedAt').reverse().toArray();
      setDecks(nextDecks);
      setTargetDeckId((current) => current || nextDecks[0]?.id || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    }
  }

  const csvPreview = useMemo(() => csvText ? previewCsvCards(csvText, csvMapping) : emptyPreview, [csvText, csvMapping]);
  const markdownPreview = useMemo(() => markdownText ? previewMarkdownCards(markdownText) : { deckName: undefined, preview: emptyPreview }, [markdownText]);

  async function handleJson(file?: File) {
    if (!file) return;
    setError(undefined);
    try {
      const result = await importBackupFile(file);
      setMessage(t.import.importedJson(result.decks, result.cards, result.media, result.reviewLogs));
      await loadDecks();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    }
  }

  async function readCsv(file?: File) {
    if (!file) return;
    setCsvFileName(file.name);
    setCsvText(await file.text());
  }

  async function importCsv() {
    if (!targetDeckId) return;
    setError(undefined);
    try {
      const result = parseCsvCards(csvText, targetDeckId);
      await db.cards.bulkAdd(result.cards);
      await db.decks.update(targetDeckId, { updatedAt: nowIso() });
      setMessage(t.import.importedCsv(result.cards.length, result.skippedRows));
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    }
  }

  async function importMarkdown() {
    setError(undefined);
    try {
      let deckId = targetDeckId;
      if (!deckId && markdownPreview.deckName) {
        const deck = createDeckInput(markdownPreview.deckName, 'Importováno z Markdownu');
        await db.decks.add(deck);
        deckId = deck.id;
      }
      if (!deckId) throw new Error(t.import.chooseDeck);
      const cards = markdownPreview.preview.cards
        .filter((card) => card.errors.length === 0)
        .map((card) => createCardInput(deckId, card.frontText, card.backText, card.tags));
      await db.cards.bulkAdd(cards);
      await db.decks.update(deckId, { updatedAt: nowIso() });
      setMessage(t.import.importedMarkdown(cards.length));
      await loadDecks();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    }
  }

  async function handleAnkiPreview(file?: File) {
    if (!file) return;
    setError(undefined);
    setZipFileName(file.name.replace('.zip', ''));
    try {
      const zip = await JSZip.loadAsync(file);
      const xmlFile = Object.values(zip.files).find((f) => f.name.endsWith('.xml'));
      if (!xmlFile) throw new Error('Nebylo nalezeno žádné XML v ZIPu.');
      const xmlText = await xmlFile.async('string');
      
      const blobs = new Map<string, Blob>();
      const blobFolder = zip.folder('blobs');
      if (blobFolder) {
        for (const [name, file] of Object.entries(blobFolder.files)) {
          if (!file.dir) {
            blobs.set(name.replace('blobs/', ''), await file.async('blob'));
          }
        }
      }

      const result = await importAnkiXml(xmlText, blobs);
      setAnkiData(result.cards);
      setMessage(`Načteno ${result.cards.length} karet z Anki.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    }
  }

  async function executeAnkiImport(createNewDeck: boolean) {
    try {
      let deckId = targetDeckId;
      if (createNewDeck) {
        const deck = createDeckInput(zipFileName, 'Importováno z Anki');
        await db.decks.add(deck);
        deckId = deck.id;
        await loadDecks();
      }
      
      if (!deckId) throw new Error('Vyberte balíček nebo vytvořte nový.');
      
      for (const entry of ankiData) {
        const newCard = { ...entry.card, deckId: deckId };
        const id = await db.cards.add(newCard);
        for (const media of entry.media) {
             await addMediaToCard({ ...media, cardId: id, deckId: deckId });
        }
      }
      
      await db.decks.update(deckId, { updatedAt: nowIso() });
      setMessage(`Importováno ${ankiData.length} karet.`);
      setAnkiData([]);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    }
  }

  return (
    <section className="page">
      <button className="back-button" onClick={onBack}>← {t.common.back}</button>

      <div className="page-heading">
        <div>
          <p className="eyebrow">{t.common.import}</p>
          <h1>{t.import.title}</h1>
          <p className="lead">{t.import.lead}</p>
        </div>
      </div>

      <div className="mode-tabs import-tabs">
        {(['json', 'csv', 'markdown', 'anki'] as ImportTab[]).map((item) => (
          <button className={tab === item ? 'active' : ''} key={item} onClick={() => setTab(item)}>{t.import[item] ?? item.toUpperCase()}</button>
        ))}
      </div>

      {message && <p className="success-box">{message}</p>}
      {error && <p className="error-box">{error}</p>}

      {tab !== 'json' && (
        <label className="target-deck">
          {t.import.targetDeck}
          <select value={targetDeckId} onChange={(event) => setTargetDeckId(event.target.value)}>
            <option value="">{t.import.chooseDeck}</option>
            {decks.map((deck) => <option key={deck.id} value={deck.id}>{deck.name}</option>)}
          </select>
        </label>
      )}

      {tab === 'json' && (
        <section className="panel">
          <h2>{t.import.jsonTitle}</h2>
          <p>{t.import.jsonBody}</p>
          <label className="upload-button wide">
            {t.import.chooseJson}
            <input type="file" accept="application/json,.json" onChange={(event) => handleJson(event.target.files?.[0])} />
          </label>
        </section>
      )}

      {tab === 'csv' && (
        <section className="panel stack">
          <h2>{t.import.csvTitle}</h2>
          <label className="upload-button wide">
            {t.import.chooseCsv}
            <input type="file" accept=".csv,text/csv" onChange={(event) => readCsv(event.target.files?.[0])} />
          </label>
          {csvFileName && <p className="muted">{t.import.file}: {csvFileName}</p>}
          <div className="mapping-grid">
            {Object.keys(csvMapping).map((key) => (
              <label key={key}>
                {t.import.column} {key}
                <input
                  value={csvMapping[key as keyof typeof csvMapping]}
                  onChange={(event) => setCsvMapping((mapping) => ({ ...mapping, [key]: event.target.value }))}
                />
              </label>
            ))}
          </div>
          <PreviewBlock preview={csvPreview} />
          <button className="primary-button" disabled={!targetDeckId || csvPreview.cards.filter((card) => card.errors.length === 0).length === 0} onClick={importCsv}>
            {t.import.importCsv}
          </button>
        </section>
      )}

      {tab === 'markdown' && (
        <section className="panel stack">
          <h2>{t.import.markdown}</h2>
          <textarea value={markdownText} onChange={(event) => setMarkdownText(event.target.value)} rows={12} placeholder="# Balíček: Biologie&#10;&#10;## Karta&#10;Přední:&#10;Co je ATP?&#10;&#10;Zadní:&#10;Energetická měna buňky.&#10;&#10;Tagy:&#10;biologie,biochemie" />
          {markdownPreview.deckName && <p className="muted">Detekovaný balíček: {markdownPreview.deckName}</p>}
          <PreviewBlock preview={markdownPreview.preview} />
          <button className="primary-button" disabled={markdownPreview.preview.cards.filter((card) => card.errors.length === 0).length === 0} onClick={importMarkdown}>
            {t.import.importMarkdown}
          </button>
        </section>
      )}
      
      {tab === 'anki' && (
        <section className="panel">
          <h2>{'Import Anki (.zip)'}</h2>
          <p>{'Nahrajte ZIP balíček z Anki (obsahující .xml a složku blobs).'}</p>
          <label className="upload-button wide">
            {'Vybrat ZIP'}
            <input type="file" accept=".zip" onChange={(event) => handleAnkiPreview(event.target.files?.[0])} />
          </label>
          
          {ankiData.length > 0 && (
             <div className="button-row" style={{ marginTop: '1rem' }}>
               <button className="primary-button" onClick={() => executeAnkiImport(true)}>
                 {'Vytvořit balíček ' + zipFileName}
               </button>
               {decks.length > 0 && (
                 <button className="secondary-button" onClick={() => executeAnkiImport(false)}>
                   {'Přidat do existujícího balíčku'}
                 </button>
               )}
             </div>
          )}
        </section>
      )}
    </section>
  );
}

function PreviewBlock({ preview }: { preview: ImportPreview }) {
  const valid = preview.cards.filter((card) => card.errors.length === 0).length;
  return (
    <div className="import-preview">
      <div className="section-title">
        <h2>{t.common.preview}</h2>
        <span>{t.import.validRows(valid, preview.cards.length)}</span>
      </div>
      {preview.warnings.map((warning) => <p className="error-box" key={warning}>{warning}</p>)}
      <div className="preview-list">
        {preview.cards.slice(0, 8).map((card, index) => (
          <div className={`preview-row ${card.errors.length ? 'invalid' : ''}`} key={`${card.frontText}-${index}`}>
            <strong>{card.frontText || t.import.noQuestion}</strong>
            <span>{card.backText || t.import.noAnswer}</span>
            <small>{card.errors.join(' ') || card.tags.join(', ') || card.image || t.import.noTags}</small>
          </div>
        ))}
      </div>
    </div>
  );
}
