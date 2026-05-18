import { useEffect, useMemo, useState } from 'react';
import JSZip from 'jszip';
import { createCardInput, createDeckInput, db, addMediaToCard } from '../db/database';
import { downloadBackup, downloadBackupZip, formatImportSummary, importBackupFile, type ImportMode } from '../services/exportImport';
import { previewCsvCards, parseCsvCards } from '../services/importers/csvImporter';
import { previewMarkdownCards } from '../services/importers/markdownImporter';
import { parseAnkiXml, previewAnkiXml } from '../services/importers/ankiImporter';
import { processImportedMedia } from '../services/mediaProcessing';
import type { Deck, ImportPreview } from '../types';
import { nowIso } from '../utils/date';
import { t } from '../i18n';

interface ImportPageProps {
  onChanged: () => void;
  onDeckCreated?: (deckId: string) => void;
}

type ImportTab = 'json' | 'csv' | 'markdown' | 'anki';
type SkippedAnkiMediaReason = 'missing' | 'empty' | 'unsupported';
type SkippedAnkiMedia = { hash: string; side: 'front' | 'back'; reason: SkippedAnkiMediaReason };

const emptyPreview: ImportPreview = { cards: [], skippedRows: 0, warnings: [] };

export default function ImportPage({ onChanged, onDeckCreated }: ImportPageProps) {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [targetDeckId, setTargetDeckId] = useState('');
  const [tab, setTab] = useState<ImportTab>('json');
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [jsonImportSettings, setJsonImportSettings] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [csvFileName, setCsvFileName] = useState('');
  const [csvMapping, setCsvMapping] = useState({ front: 'front', back: 'back', tags: 'tags', image: 'image' });
  const [markdownText, setMarkdownText] = useState('');
  const [ankiFile, setAnkiFile] = useState<File>();
  const [ankiCardCount, setAnkiCardCount] = useState(0);
  const [zipFileName, setZipFileName] = useState('');
  const [ankiStatus, setAnkiStatus] = useState<string>();
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number } | null>(null);
  const [exportLabel, setExportLabel] = useState<string>('');

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

  async function handleJson(mode: ImportMode, file?: File) {
    if (!file) return;
    setError(undefined);
    setMessage(undefined);

    if (mode === 'hard') {
      const ok = window.confirm('Tento režim přidá celý obsah JSONu k aktuálním datům a může vytvořit duplicity. Pokračovat?');
      if (!ok) return;
    }

    if (mode === 'reset') {
      const ok = window.confirm('Tento krok smaže aktuální lokální data a nahradí je obsahem zálohy. Před obnovou se uloží bezpečnostní snapshot do historie záloh bez stahování souboru. Pokračovat?');
      if (!ok) return;
    }

    try {
      const result = await importBackupFile(file, {
        mode,
        importSettings: mode === 'soft' || mode === 'reset' || jsonImportSettings,
        createSafetySnapshot: mode === 'reset'
      });
      setMessage(formatImportSummary(result));
      await loadDecks();
      onChanged();
      if (mode === 'reset') {
        window.setTimeout(() => window.location.reload(), 600);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    }
  }

  async function handleDownloadZipBackup() {
    setError(undefined);
    setMessage(undefined);
    setExportProgress(null);
    setExportLabel('');
    try {
      await downloadBackupZip((current, total, label) => {
          setExportProgress({ current, total });
          if (label) setExportLabel(label);
      });
      setMessage('ZIP záloha byla vytvořena. Je vhodná pro kompletní obnovu včetně médií.');
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setExportProgress(null);
      setExportLabel('');
    }
  }

  async function handleDownloadJsonBackup() {
    setError(undefined);
    setMessage(undefined);
    setExportProgress(null);
    setExportLabel('');
    try {
      await downloadBackup((current, total, label) => {
          setExportProgress({ current, total });
          if (label) setExportLabel(label);
      });
      setMessage('JSON záloha byla vytvořena.');
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setExportProgress(null);
      setExportLabel('');
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
    setMessage(undefined);
    setAnkiFile(undefined);
    setAnkiCardCount(0);
    setZipFileName(file.name.replace(/\.zip$/i, ''));
    setAnkiStatus('Načítám ZIP z Anki…');
    try {
      const zip = await JSZip.loadAsync(file);
      const xmlFile = findAnkiXmlEntry(zip);
      if (!xmlFile) throw new Error('Nebylo nalezeno žádné XML v ZIPu.');
      setAnkiStatus('Čtu seznam kartiček…');
      const xmlText = await xmlFile.async('string');
      const preview = previewAnkiXml(xmlText);
      setAnkiFile(file);
      setAnkiCardCount(preview.cardCount);
      if (preview.deckName) setZipFileName(preview.deckName);
      setMessage(`Připraveno ${preview.cardCount} karet z Anki. Média se na mobilu načtou a uloží postupně až při importu.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setAnkiStatus(undefined);
    }
  }

  async function executeAnkiImport(createNewDeck: boolean) {
    if (!ankiFile) return;
    setError(undefined);
    setMessage(undefined);
    setAnkiStatus('Otevírám Anki ZIP…');
    try {
      let deckId = targetDeckId;
      let createdDeckId: string | undefined;
      if (createNewDeck) {
        const deck = createDeckInput(zipFileName, 'Importováno z Anki');
        await db.decks.add(deck);
        deckId = deck.id;
        createdDeckId = deck.id;
        await loadDecks();
      }
      
      if (!deckId) throw new Error('Vyberte balíček nebo vytvořte nový.');

      const zip = await JSZip.loadAsync(ankiFile);
      const xmlFile = findAnkiXmlEntry(zip);
      if (!xmlFile) throw new Error('Nebylo nalezeno žádné XML v ZIPu.');
      setAnkiStatus('Čtu seznam kartiček…');
      const parsedCards = parseAnkiXml(await xmlFile.async('string'));
      let importedCards = 0;
      let importedMedia = 0;
      const skippedMedia = { missing: 0, empty: 0, unsupported: 0 };
      let cardsWithSkippedMedia = 0;
      
      for (let index = 0; index < parsedCards.length; index++) {
        const entry = parsedCards[index];
        setAnkiStatus(`Ukládám kartičky z Anki (${index + 1}/${parsedCards.length})…`);
        const newCard = { ...entry.card, deckId };
        const id = newCard.id;
        await db.cards.add(newCard);
        const skippedForCard: SkippedAnkiMedia[] = [];

        for (let mediaIndex = 0; mediaIndex < entry.mediaRefs.length; mediaIndex++) {
          const mediaRef = entry.mediaRefs[mediaIndex];
          setAnkiStatus(`Ukládám média z Anki (${index + 1}/${parsedCards.length}, soubor ${mediaIndex + 1}/${entry.mediaRefs.length})…`);
          const zipEntry = findAnkiBlobEntry(zip, mediaRef.hash);
          if (!zipEntry) {
            skippedMedia.missing += 1;
            skippedForCard.push({ hash: mediaRef.hash, side: mediaRef.side, reason: 'missing' });
            continue;
          }
          const blob = await zipEntry.async('blob');
          if (blob.size === 0) {
            skippedMedia.empty += 1;
            skippedForCard.push({ hash: mediaRef.hash, side: mediaRef.side, reason: 'empty' });
            continue;
          }
          try {
            const media = await processImportedMedia(blob, mediaRef.side, {
              mimeType: mediaRef.mimeType,
              name: mediaRef.name,
              compressAudio: mediaRef.compressAudio,
              readAudioDuration: mediaRef.readAudioDuration,
              onProgress: (_, label) => {
                if (label) {
                  setAnkiStatus(`Ukládám média z Anki (${index + 1}/${parsedCards.length}, soubor ${mediaIndex + 1}/${entry.mediaRefs.length}) - ${label}`);
                }
              }
            });
            await addMediaToCard({ ...media, cardId: id, deckId });
            importedMedia += 1;
          } catch (err) {
            console.warn('Anki médium bylo přeskočeno:', mediaRef.hash, err);
            skippedMedia.unsupported += 1;
            skippedForCard.push({ hash: mediaRef.hash, side: mediaRef.side, reason: 'unsupported' });
          }
          await new Promise((resolve) => window.setTimeout(resolve, 0));
        }

        if (skippedForCard.length > 0) {
          cardsWithSkippedMedia += 1;
          await db.cards.update(id, {
            backText: appendSkippedMediaNote(newCard.backText, skippedForCard),
            tags: Array.from(new Set([...newCard.tags, 'import-problem'])),
            updatedAt: nowIso()
          });
        }

        importedCards += 1;
        if (index % 3 === 0) {
          await new Promise((resolve) => window.setTimeout(resolve, 0));
        }
      }
      
      await db.decks.update(deckId, { updatedAt: nowIso() });
      const skippedTotal = skippedMedia.missing + skippedMedia.empty + skippedMedia.unsupported;
      setMessage(`Importováno ${importedCards} karet z Anki a ${importedMedia} médií.${skippedTotal > 0 ? ` Přeskočeno ${skippedTotal} médií u ${cardsWithSkippedMedia} karet (${formatSkippedMediaSummary(skippedMedia)}). Dotčené karty mají tag import-problem a poznámku v odpovědi.` : ''}`);
      setAnkiFile(undefined);
      setAnkiCardCount(0);
      onChanged();
      if (createdDeckId && onDeckCreated) onDeckCreated(createdDeckId);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setAnkiStatus(undefined);
    }
  }

  return (
    <section className="page">
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
      {ankiStatus && <p className="success-box" role="status">{ankiStatus}</p>}
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
        <section className="panel stack">
          <h2>Záloha a import</h2>
          <div className="settings-help-box" style={{ marginBottom: '0.5rem', borderLeft: '4px solid var(--primary-color)' }}>
            <strong>Padá vám aplikace při exportu?</strong>
            <p className="muted" style={{ margin: '0.4rem 0 0' }}>U velkých knihoven (zejména na iPhone) může dojít k vyčerpání paměti. V takovém případě jděte do <strong>Nastavení → Rozdělený export</strong> a stáhněte si zálohu po částech. Ty pak můžete nahrát sem jednu po druhé pomocí <em>Soft importu</em>.</p>
          </div>
          <p>ZIP je doporučená kompletní záloha: ukládá backup.json a média jako samostatné soubory, takže je vhodnější pro obnovu celého balíku dat. JSON zůstává jako doplňková pokročilá varianta.</p>
          <div className="button-row export-priority-row">
            <button className="primary-button" type="button" onClick={handleDownloadZipBackup} disabled={exportProgress !== null}>Exportovat ZIP zálohu</button>
            <button className="secondary-button" type="button" onClick={handleDownloadJsonBackup} disabled={exportProgress !== null}>Exportovat JSON</button>
          </div>

          {exportProgress && (
            <div className="preview-row" style={{ gap: '0.8rem', marginTop: '0.5rem' }}>
              <strong>{exportLabel || 'Exportuji data...'}</strong>
              <div className="progress-track">
                <span style={{ width: `${(exportProgress.current / exportProgress.total) * 100}%` }} />
              </div>
              <small className="muted">{exportProgress.current === exportProgress.total && exportProgress.total === 100 ? '100%' : `${exportProgress.current} / ${exportProgress.total}`}</small>
            </div>
          )}

          <JsonImportAction
            title="Soft import — sloučit bez duplicit"
            description="Zkontroluje existující data a přidá jen nové nebo novější změny."
            buttonLabel="Vybrat JSON/ZIP pro soft import"
            onFile={(file) => handleJson('soft', file)}
          />

          <JsonImportAction
            title="Hard import — přidat vše z JSONu"
            description="Přidá celý obsah JSONu k aktuálním datům. Může vytvořit duplicity."
            buttonLabel="Vybrat JSON/ZIP pro hard import"
            onFile={(file) => handleJson('hard', file)}
          />
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={jsonImportSettings}
              onChange={(event) => setJsonImportSettings(event.target.checked)}
            />
            Importovat při hard importu také nastavení aplikace
          </label>

          <JsonImportAction
            title="Reset / Obnovit ze zálohy"
            description="Nahradí celý aktuální stav aplikace obsahem zálohy."
            buttonLabel="Vybrat JSON/ZIP pro obnovu"
            danger
            onFile={(file) => handleJson('reset', file)}
          />
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
            <input
              type="file"
              accept=".zip"
              disabled={Boolean(ankiStatus)}
              onChange={(event) => {
                handleAnkiPreview(event.target.files?.[0]);
                event.currentTarget.value = '';
              }}
            />
          </label>
          <p className="muted">
            U větších audio balíčků se média ukládají postupně po kartách, aby import prošel i na iPhonu s menší dostupnou pamětí.
          </p>
          
          {ankiFile && ankiCardCount > 0 && (
             <div className="button-row" style={{ marginTop: '1rem' }}>
               <button className="primary-button" disabled={Boolean(ankiStatus)} onClick={() => executeAnkiImport(true)}>
                 {'Vytvořit balíček ' + zipFileName}
               </button>
               {decks.length > 0 && (
                 <button className="secondary-button" disabled={Boolean(ankiStatus)} onClick={() => executeAnkiImport(false)}>
                   {`Přidat ${ankiCardCount} karet do existujícího balíčku`}
                 </button>
               )}
             </div>
          )}
        </section>
      )}
    </section>
  );
}

function findAnkiXmlEntry(zip: JSZip): JSZip.JSZipObject | null {
  return Object.values(zip.files).find((file) => !file.dir && file.name.toLowerCase().endsWith('.xml')) ?? null;
}

function findAnkiBlobEntry(zip: JSZip, hash: string): JSZip.JSZipObject | null {
  return zip.file(`blobs/${hash}`)
    ?? zip.file(hash)
    ?? Object.values(zip.files).find((file) => !file.dir && file.name.split('/').pop() === hash)
    ?? null;
}

function appendSkippedMediaNote(html: string, skipped: SkippedAnkiMedia[]): string {
  const items = skipped.map((item) => (
    `<li>${mediaSideLabel(item.side)}: ${skippedMediaReasonLabel(item.reason)} <code>${item.hash}</code></li>`
  )).join('');
  const note = `<div class="import-warning" data-import-warning="true"><strong>Import:</strong> Přeskočeno ${skipped.length} médií v této kartě.<ul>${items}</ul></div>`;
  return `${html || ''}${note}`;
}

function formatSkippedMediaSummary(skipped: Record<SkippedAnkiMediaReason, number>): string {
  return [
    skipped.missing > 0 ? `chybí ${skipped.missing}` : '',
    skipped.empty > 0 ? `prázdné ${skipped.empty}` : '',
    skipped.unsupported > 0 ? `nepodporované ${skipped.unsupported}` : ''
  ].filter(Boolean).join(', ');
}

function skippedMediaReasonLabel(reason: SkippedAnkiMediaReason): string {
  if (reason === 'missing') return 'soubor v ZIPu chybí';
  if (reason === 'empty') return 'soubor je prázdný';
  return 'soubor nejde zpracovat';
}

function mediaSideLabel(side: 'front' | 'back'): string {
  return side === 'front' ? 'přední strana' : 'zadní strana';
}

function JsonImportAction({ title, description, buttonLabel, danger, onFile }: {
  title: string;
  description: string;
  buttonLabel: string;
  danger?: boolean;
  onFile: (file?: File) => void;
}) {
  return (
    <div className={`preview-row ${danger ? 'invalid' : ''}`}>
      <strong>{title}</strong>
      <span>{description}</span>
      <label className={`upload-button wide ${danger ? 'danger-button' : ''}`}>
        {buttonLabel}
        <input
          type="file"
          accept="application/json,.json,.zip,application/zip,application/x-zip-compressed"
          onChange={(event) => {
            onFile(event.target.files?.[0]);
            event.currentTarget.value = '';
          }}
        />
      </label>
    </div>
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
