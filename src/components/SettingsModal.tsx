import { useState, useEffect } from 'react';
import { db } from '../db/database';
import { formatDateTime, nowIso } from '../utils/date';
import { useTheme, type TextSize } from '../contexts/ThemeContext';
import { APP_VERSION } from '../app/version';
import { processImageForCard } from '../services/imageProcessing';
import {
  deleteBackupHistoryEntry,
  createBackupZipFile,
  downloadBackup,
  downloadBackupHistoryEntry,
  downloadBackupZip,
  downloadBackupZipPart,
  formatImportSummary,
  getBackupHistory,
  importBackupFile,
  restoreBackupHistoryEntry,
  type ImportMode
} from '../services/exportImport';
import {
  deleteOneDriveBackup,
  disconnectOneDrive,
  downloadOneDriveBackup,
  getOneDriveSettings,
  listOneDriveBackups,
  saveOneDriveClientId,
  startOneDriveSignIn,
  uploadOneDriveBackup,
  type OneDriveBackupItem,
  type OneDriveSettings
} from '../services/oneDriveSync';
import type { BackupHistoryEntry, Media } from '../types';

interface SettingsModalProps {
  onClose: () => void;
}

const themes = [
  { name: 'Classic', primary: '#26312d', bg: '#f7f5ef' },
  { name: 'Deep Sea', primary: '#0d47a1', bg: '#e3f2fd' },
  { name: 'Petrol', primary: '#006064', bg: '#e0f2f1' },
  { name: 'Ocean', primary: '#1a5f7a', bg: '#e0f7fa' },
  { name: 'Forest', primary: '#2e7d32', bg: '#e8f5e9' },
  { name: 'Emerald', primary: '#00695c', bg: '#e0f2f1' },
  { name: 'Midnight', primary: '#1a237e', bg: '#e8eaf6' },
  { name: 'Sky', primary: '#0277bd', bg: '#e1f5fe' },
  { name: 'Sunset', primary: '#bf360c', bg: '#fbe9e7' },
  { name: 'Night', primary: '#4a148c', bg: '#f3e5f5' },
  { name: 'Sand', primary: '#5d4037', bg: '#efebe9' },
  { name: 'Berry', primary: '#c2185b', bg: '#fce4ec' },
  { name: 'Indigo', primary: '#3949ab', bg: '#e8eaf6' },
  { name: 'Gold', primary: '#fbc02d', bg: '#fffde7' },
  { name: 'Rose', primary: '#880e4f', bg: '#fce4ec' },
  { name: 'Slate', primary: '#37474f', bg: '#eceff1' },
];

const textSizeOptions: { value: TextSize; label: string }[] = [
  { value: 'small', label: 'Malé' },
  { value: 'default', label: 'Výchozí' },
  { value: 'large', label: 'Velké' },
  { value: 'xlarge', label: 'Velmi velké' }
];

interface StorageOverview {
  decks: number;
  cards: number;
  media: number;
  reviewLogs: number;
  mediaBytes: number;
  imageBytes: number;
  audioBytes: number;
  backupBytes: number;
  backupCount: number;
  appDataBytes: number;
  estimatedTotalBytes: number;
  browserUsageBytes?: number;
  browserQuotaBytes?: number;
  persistentStorage?: boolean;
}

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const { theme, setTheme, textSize, setTextSize, colorMode, setColorMode, customBackground, setCustomBackground, clearCustomBackground } = useTheme();
  const [interval, setInterval] = useState(7);
  const [backgroundSaving, setBackgroundSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string>();
  const [settingsMessage, setSettingsMessage] = useState<string>();
  const [hardImportSettings, setHardImportSettings] = useState(false);
  const [backupHistory, setBackupHistory] = useState<BackupHistoryEntry[]>([]);
  const [storageOverview, setStorageOverview] = useState<StorageOverview>();
  const [oneDriveSettings, setOneDriveSettings] = useState<OneDriveSettings>();
  const [oneDriveClientId, setOneDriveClientId] = useState('');
  const [oneDriveBackups, setOneDriveBackups] = useState<OneDriveBackupItem[]>([]);
  const [oneDriveBusy, setOneDriveBusy] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number } | null>(null);
  const [exportLabel, setExportLabel] = useState<string>('');
  const [skipHistoryForLargeZip, setSkipHistoryForLargeLargeZip] = useState(true);
  const [mediaPerPart, setMediaPerPart] = useState(100);
  const [segmentedParts, setSegmentedParts] = useState<Media[][] | null>(null);

  useEffect(() => {
    db.appMeta.get('backupInterval').then(m => m && setInterval(Number(m.value)));
    db.appMeta.get('mediaPerPart').then(m => m && setMediaPerPart(Number(m.value)));
    void loadBackupHistory();
    void loadStorageOverview();
    void loadOneDriveState();
  }, []);

  async function updateMediaPerPart(value: number) {
    setMediaPerPart(value);
    await db.appMeta.put({ key: 'mediaPerPart', value, updatedAt: nowIso() });
  }

  async function loadBackupHistory() {
    setBackupHistory(await getBackupHistory());
  }

  async function loadOneDriveState() {
    const settings = await getOneDriveSettings();
    setOneDriveSettings(settings);
    setOneDriveClientId(settings?.clientId ?? '');
    if (settings?.connected) {
      try {
        setOneDriveBackups(await listOneDriveBackups());
      } catch {
        setOneDriveBackups([]);
      }
    }
  }

  async function loadStorageOverview() {
    const [decks, cards, media, reviewLogs, appMeta, backups] = await Promise.all([
      db.decks.toArray(),
      db.cards.toArray(),
      db.media.toArray(),
      db.reviewLogs.toArray(),
      db.appMeta.toArray(),
      getBackupHistory()
    ]);
    const imageBytes = media.filter((item) => item.type === 'image').reduce((sum, item) => sum + item.blob.size, 0);
    const audioBytes = media.filter((item) => item.type === 'audio').reduce((sum, item) => sum + item.blob.size, 0);
    const mediaBytes = imageBytes + audioBytes;
    const backupBytes = backups.reduce((sum, item) => sum + item.size, 0);
    const appDataBytes = estimateJsonSize({
      decks,
      cards,
      reviewLogs,
      appMeta,
      media: media.map(({ blob: _blob, ...item }) => item),
      backups: backups.map(({ blob: _blob, ...item }) => item)
    });
    const storageEstimate = await navigator.storage?.estimate?.();
    const persistentStorage = await navigator.storage?.persisted?.();

    setStorageOverview({
      decks: decks.length,
      cards: cards.length,
      media: media.length,
      reviewLogs: reviewLogs.length,
      mediaBytes,
      imageBytes,
      audioBytes,
      backupBytes,
      backupCount: backups.length,
      appDataBytes,
      estimatedTotalBytes: appDataBytes + mediaBytes + backupBytes,
      browserUsageBytes: storageEstimate?.usage,
      browserQuotaBytes: storageEstimate?.quota,
      persistentStorage
    });
  }

  async function updateInterval(days: number) {
    setInterval(days);
    await db.appMeta.put({ key: 'backupInterval', value: days, updatedAt: nowIso() });
  }

  async function purgeOrphanMedia() {
    const allMedia = await db.media.toArray();
    const allCards = await db.cards.toArray();
    const cardIds = new Set(allCards.map(c => c.id));
    const orphans = allMedia.filter(m => !cardIds.has(m.cardId));
    
    for (const media of orphans) {
        await db.media.delete(media.id);
    }
    await loadStorageOverview();
    alert(`Smazáno ${orphans.length} nepřiřazených mediálních souborů.`);
  }

  async function purgeOldLogs() {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const oldLogs = await db.reviewLogs.where('reviewedAt').below(oneYearAgo.toISOString()).toArray();
    for (const log of oldLogs) {
        await db.reviewLogs.delete(log.id);
    }
    await loadStorageOverview();
    alert(`Smazáno ${oldLogs.length} záznamů starších než 1 rok.`);
  }

  function applyTheme(nextTheme: typeof themes[0]) {
    setTheme(nextTheme);
  }

  async function updateBackground(file?: File) {
    if (!file) return;
    setBackgroundSaving(true);
    setSettingsError(undefined);
    try {
      const processed = await processImageForCard(file, 'front');
      await setCustomBackground({
        dataUrl: await blobToDataUrl(processed.blob),
        name: file.name || 'vlastni-pozadi',
        updatedAt: nowIso()
      });
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Pozadí se nepodařilo uložit.');
    } finally {
      setBackgroundSaving(false);
    }
  }

  async function handleJsonImport(mode: ImportMode, file?: File) {
    if (!file) return;
    setSettingsError(undefined);
    setSettingsMessage(undefined);

    if (mode === 'hard') {
      const ok = window.confirm('Tento režim přidá celý obsah JSONu k aktuálním datům a může vytvořit duplicity. Pokračovat?');
      if (!ok) return;
    }

    if (mode === 'reset') {
      const ok = window.confirm('Tento krok smaže aktuální lokální data a nahradí je obsahem zálohy. Před obnovou se uloží bezpečnostní snapshot do historie záloh bez stahování souboru. Pokračovat?');
      if (!ok) return;
    }

    try {
      const summary = await importBackupFile(file, {
        mode,
        importSettings: mode === 'soft' || mode === 'reset' || hardImportSettings,
        createSafetySnapshot: mode === 'reset'
      });
      setSettingsMessage(formatImportSummary(summary));
      window.setTimeout(() => window.location.reload(), 900);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Import se nepodařil.');
    }
  }

  async function handleDownloadBackup() {
    setSettingsError(undefined);
    setSettingsMessage(undefined);
    setExportProgress(null);
    setExportLabel('');
    try {
      await downloadBackup((current, total, label) => {
          setExportProgress({ current, total });
          if (label) setExportLabel(label);
      });
      setSettingsMessage('JSON záloha byla vytvořena a uložena do historie.');
      await loadBackupHistory();
      await loadStorageOverview();
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Export zálohy se nepodařil.');
    } finally {
      setExportProgress(null);
      setExportLabel('');
    }
  }

  async function handleDownloadZipBackup() {
    setSettingsError(undefined);
    setSettingsMessage(undefined);
    setExportProgress(null);
    setExportLabel('');
    try {
      await downloadBackupZip(
        (current, total, label) => {
          setExportProgress({ current, total });
          if (label) setExportLabel(label);
        },
        { skipHistory: skipHistoryForLargeZip }
      );
      setSettingsMessage(`ZIP záloha byla vytvořena${skipHistoryForLargeZip ? '' : ' a uložena do historie'}. Média jsou uložená jako samostatné soubory.`);
      await loadBackupHistory();
      await loadStorageOverview();
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Export ZIP zálohy se nepodařil.');
    } finally {
      setExportProgress(null);
      setExportLabel('');
    }
  }

  async function handlePrepareSegmentedExport() {
    setSettingsError(undefined);
    setSegmentedParts(null);
    try {
      const allMedia = await db.media.toArray();
      const parts: Media[][] = [];
      for (let i = 0; i < allMedia.length; i += mediaPerPart) {
        parts.push(allMedia.slice(i, i + mediaPerPart));
      }
      if (parts.length === 0) {
          parts.push([]); // At least one part for structure even if no media
      }
      setSegmentedParts(parts);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Příprava rozděleného exportu selhala.');
    }
  }

  async function handleDownloadPart(index: number) {
    if (!segmentedParts) return;
    setExportProgress(null);
    setExportLabel('');
    try {
      await downloadBackupZipPart(
        segmentedParts[index],
        index + 1,
        segmentedParts.length,
        (current, total, label) => {
          setExportProgress({ current, total });
          if (label) setExportLabel(label);
        }
      );
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : `Export dílu ${index + 1} selhal.`);
    } finally {
      setExportProgress(null);
      setExportLabel('');
    }
  }

  async function handleRestoreHistory(id: string) {
    const ok = window.confirm('Tento krok smaže aktuální lokální data a nahradí je vybranou historickou zálohou. Před obnovou se vytvoří bezpečnostní snapshot. Pokračovat?');
    if (!ok) return;
    setSettingsError(undefined);
    setSettingsMessage(undefined);
    try {
      const summary = await restoreBackupHistoryEntry(id);
      setSettingsMessage(formatImportSummary(summary));
      await loadBackupHistory();
      window.setTimeout(() => window.location.reload(), 900);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Obnova z historie se nepodařila.');
    }
  }

  async function handleDeleteHistory(id: string) {
    const ok = window.confirm('Smazat tuto položku z lokální historie záloh?');
    if (!ok) return;
    await deleteBackupHistoryEntry(id);
    await loadBackupHistory();
    await loadStorageOverview();
  }

  async function handleSaveOneDriveClientId() {
    setSettingsError(undefined);
    setSettingsMessage(undefined);
    try {
      const settings = await saveOneDriveClientId(oneDriveClientId);
      setOneDriveSettings(settings);
      setSettingsMessage('OneDrive konfigurace byla uložena.');
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'OneDrive konfiguraci se nepodařilo uložit.');
    }
  }

  async function handleConnectOneDrive() {
    setSettingsError(undefined);
    setSettingsMessage(undefined);
    try {
      await startOneDriveSignIn(oneDriveClientId);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Přihlášení k OneDrive se nepodařilo spustit.');
    }
  }

  async function handleDisconnectOneDrive() {
    const ok = window.confirm('Odpojit OneDrive z tohoto zařízení? Cloudové zálohy zůstanou uložené v OneDrive.');
    if (!ok) return;
    await disconnectOneDrive();
    setOneDriveSettings(undefined);
    setOneDriveBackups([]);
    setSettingsMessage('OneDrive byl odpojený z tohoto zařízení.');
  }

  async function handleRefreshOneDriveBackups() {
    setOneDriveBusy(true);
    setSettingsError(undefined);
    setSettingsMessage(undefined);
    try {
      setOneDriveBackups(await listOneDriveBackups());
      setOneDriveSettings(await getOneDriveSettings());
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Seznam OneDrive záloh se nepodařilo načíst.');
    } finally {
      setOneDriveBusy(false);
    }
  }

  async function handleUploadOneDriveBackup() {
    setOneDriveBusy(true);
    setSettingsError(undefined);
    setSettingsMessage(undefined);
    setExportProgress(null);
    setExportLabel('');
    try {
      const file = await createBackupZipFile((current, total, label) => {
          setExportProgress({ current, total });
          if (label) setExportLabel(label);
      });
      await uploadOneDriveBackup(file.blob, file.name);
      setSettingsMessage(`ZIP záloha ${file.name} byla nahrána na OneDrive.`);
      await loadOneDriveState();
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Upload zálohy na OneDrive se nepodařil.');
    } finally {
      setOneDriveBusy(false);
      setExportProgress(null);
      setExportLabel('');
    }
  }

  async function handleRestoreOneDriveBackup(item: OneDriveBackupItem) {
    const ok = window.confirm(`Obnovit lokální data ze zálohy ${item.name}? Před obnovou se vytvoří bezpečnostní snapshot.`);
    if (!ok) return;
    setOneDriveBusy(true);
    setSettingsError(undefined);
    setSettingsMessage(undefined);
    try {
      const blob = await downloadOneDriveBackup(item.name);
      const summary = await importBackupFile(new File([blob], item.name, { type: 'application/zip' }), {
        mode: 'reset',
        importSettings: true,
        createSafetySnapshot: true
      });
      setSettingsMessage(formatImportSummary(summary));
      window.setTimeout(() => window.location.reload(), 900);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Obnova z OneDrive se nepodařila.');
    } finally {
      setOneDriveBusy(false);
    }
  }

  async function handleDeleteOneDriveBackup(item: OneDriveBackupItem) {
    const ok = window.confirm(`Smazat OneDrive zálohu ${item.name}?`);
    if (!ok) return;
    setOneDriveBusy(true);
    setSettingsError(undefined);
    setSettingsMessage(undefined);
    try {
      await deleteOneDriveBackup(item.name);
      setSettingsMessage('OneDrive záloha byla smazána.');
      await handleRefreshOneDriveBackups();
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'OneDrive zálohu se nepodařilo smazat.');
    } finally {
      setOneDriveBusy(false);
    }
  }

  async function forceUpdate() {
    if (window.confirm('Aplikace se restartuje a vynutí stažení nejnovější verze. Pokračovat?')) {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
        }
      }
      window.location.reload();
    }
  }

  return (
      <div className="stack">
        {settingsError && <p className="error-box">{settingsError}</p>}
        {settingsMessage && <p className="success-box">{settingsMessage}</p>}

        <h3>Motiv</h3>
        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', padding: '10px 0' }}>
          {themes.map(t => (
            <button key={t.name} onClick={() => applyTheme(t)} 
                style={{ 
                    background: t.primary, 
                    width: '45px', 
                    height: '45px', 
                    borderRadius: '50%', 
                    border: theme.name === t.name ? '4px solid #aaa' : '2px solid #ddd',
                    padding: '2px',
                    cursor: 'pointer',
                    transition: 'transform 0.2s',
                    boxShadow: theme.name === t.name ? '0 0 0 2px #fff' : 'none'
                }}
                aria-label={t.name}
            />
          ))}
        </div>

        <h3>Velikost textu</h3>
        <div className="segmented settings-segmented" role="group" aria-label="Velikost textu">
          {textSizeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={textSize === option.value ? 'active' : ''}
              onClick={() => setTextSize(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <h3>Režim zobrazení</h3>
        <div className="segmented settings-segmented two-options" role="group" aria-label="Režim zobrazení">
          <button type="button" className={colorMode === 'light' ? 'active' : ''} onClick={() => setColorMode('light')}>Světlý</button>
          <button type="button" className={colorMode === 'dark' ? 'active' : ''} onClick={() => setColorMode('dark')}>Tmavý</button>
        </div>

        <h3>Vlastní pozadí</h3>
        <div className="settings-background-row">
          <label className="upload-button secondary-button">
            {backgroundSaving ? 'Ukládám…' : 'Nahrát obrázek'}
            <input
              type="file"
              accept="image/*"
              disabled={backgroundSaving}
              onChange={(event) => {
                void updateBackground(event.target.files?.[0]);
                event.currentTarget.value = '';
              }}
            />
          </label>
          <button className="secondary-button" type="button" onClick={() => void clearCustomBackground()} disabled={!customBackground}>
            Resetovat pozadí
          </button>
        </div>
        {customBackground && <p className="muted">Aktivní pozadí: {customBackground.name}</p>}

        <section className="storage-overview">
          <div className="section-title">
            <h3>Využití úložiště</h3>
            <button className="tiny-button" type="button" onClick={() => void loadStorageOverview()}>Přepočítat</button>
          </div>
          {storageOverview ? (
            <>
              <div className="metric-grid storage-metric-grid">
                <span><strong>{formatBytes(storageOverview.estimatedTotalBytes)}</strong> odhad dat aplikace</span>
                <span><strong>{formatBytes(storageOverview.mediaBytes)}</strong> média</span>
                <span><strong>{formatBytes(storageOverview.backupBytes)}</strong> lokální zálohy</span>
                <span><strong>{formatBytes(storageOverview.appDataBytes)}</strong> texty a metadata</span>
              </div>
              <div className="storage-breakdown">
                <span>{storageOverview.decks} balíčků</span>
                <span>{storageOverview.cards} kartiček</span>
                <span>{storageOverview.media} médií</span>
                <span>{storageOverview.reviewLogs} záznamů procvičování</span>
                <span>Obrázky {formatBytes(storageOverview.imageBytes)}</span>
                <span>Audio {formatBytes(storageOverview.audioBytes)}</span>
                <span>{storageOverview.backupCount} záloh v historii</span>
              </div>
              {storageOverview.browserUsageBytes !== undefined && (
                <p className="muted">
                  Prohlížeč hlásí využití {formatBytes(storageOverview.browserUsageBytes)}
                  {storageOverview.browserQuotaBytes ? ` z limitu přibližně ${formatBytes(storageOverview.browserQuotaBytes)}` : ''}.
                  {storageOverview.persistentStorage !== undefined ? ` Trvalé úložiště: ${storageOverview.persistentStorage ? 'ano' : 'ne'}.` : ''}
                </p>
              )}
              <p className="muted">Jde o praktický odhad: média a uložené zálohy se počítají podle velikosti blobů, texty a metadata podle JSON reprezentace.</p>
            </>
          ) : (
            <p className="muted">Počítám velikost dat...</p>
          )}
        </section>
        
        <h3>Záloha a import</h3>
        <p className="muted">ZIP je doporučená kompletní záloha: obsahuje backup.json a média jako samostatné soubory. JSON ponechte hlavně pro pokročilou kontrolu nebo starší workflow.</p>
        
        <label className="checkbox-row" style={{ marginBottom: '0.5rem' }}>
          <input
            type="checkbox"
            checked={skipHistoryForLargeZip}
            onChange={(event) => setSkipHistoryForLargeLargeZip(event.target.checked)}
          />
          Při exportu ZIPu neukládat kopii do vnitřní historie záloh (bezpečnější pro iPhone a velké knihovny)
        </label>
        
        {exportProgress && (
          <div className="preview-row" style={{ gap: '0.8rem', marginBottom: '1rem' }}>
             <strong>{exportLabel || 'Exportuji data...'}</strong>
             <div className="progress-track">
                <span style={{ width: `${(exportProgress.current / exportProgress.total) * 100}%` }} />
             </div>
             <small className="muted">{exportProgress.current === exportProgress.total && exportProgress.total === 100 ? '100%' : `${exportProgress.current} / ${exportProgress.total}`}</small>
          </div>
        )}

        <div className="button-row">
          <button className="primary-button" type="button" onClick={handleDownloadZipBackup} disabled={exportProgress !== null}>Exportovat ZIP zálohu</button>
          <button className="secondary-button" type="button" onClick={handleDownloadBackup} disabled={exportProgress !== null}>Exportovat JSON</button>
        </div>

        <details className="panel onedrive-collapsible" style={{ background: 'rgba(233, 228, 216, 0.2)' }}>
           <summary className="section-title">
             <h3>Rozdělený export (pro iPhone / velké knihovny)</h3>
             <span>volitelné</span>
           </summary>
           <p className="muted">Pokud aplikace při exportu padá (časté na iPhone), rozdělte zálohu na více menších souborů. Každý díl bude obsahovat část vašich obrázků a zvuků. Při obnově pak postupně nahrajte všechny stažené ZIPy pomocí "Soft importu".</p>
           <label>
             Počet médií v jednom dílu
             <input type="number" value={mediaPerPart} onChange={e => updateMediaPerPart(Number(e.target.value))} min="10" max="500" />
           </label>
           <div className="button-row">
             <button className="secondary-button" type="button" onClick={handlePrepareSegmentedExport}>Připravit díly k exportu</button>
           </div>
           
           {segmentedParts && (
             <div className="backup-history-list" style={{ marginTop: '1rem' }}>
               <p><strong>Připraveno {segmentedParts.length} dílů.</strong> Klikněte postupně na všechna tlačítka níže:</p>
               {segmentedParts.map((_, idx) => (
                 <div key={idx} className="backup-history-row">
                   <span>Díl {idx + 1} z {segmentedParts.length}</span>
                   <button className="primary-button tiny-button" onClick={() => handleDownloadPart(idx)} disabled={exportProgress !== null}>Stáhnout díl {idx + 1}</button>
                 </div>
               ))}
             </div>
           )}
        </details>

        <details className="onedrive-panel onedrive-collapsible">
          <summary className="section-title">
            <h3>OneDrive zálohy</h3>
            <span>{oneDriveSettings?.connected ? 'připojeno · ve vývoji' : 've vývoji'}</span>
          </summary>
          <p className="muted">
            OneDrive zálohy jsou ve vývoji jako doplňková cloudová možnost. Zálohování používá aplikační složku Kartičkoid v OneDrive a vyžaduje vlastní Microsoft Entra Application (client) ID se scope Files.ReadWrite.AppFolder a redirect URI této aplikace.
          </p>
          <details className="settings-help-box">
            <summary>Jak OneDrive zprovoznit</summary>
            <ol>
              <li>Otevřete Microsoft Entra admin center a vytvořte novou registraci aplikace.</li>
              <li>Jako typ účtů zvolte osobní Microsoft účty nebo kombinaci pracovních a osobních účtů podle toho, kde OneDrive používáte.</li>
              <li>V části Authentication přidejte platformu Single-page application a jako Redirect URI vložte hodnotu zobrazenou níže.</li>
              <li>V části API permissions přidejte Microsoft Graph oprávnění <code>Files.ReadWrite.AppFolder</code>. Oprávnění umožní přístup jen do aplikační složky Kartičkoid v OneDrive.</li>
              <li>Zkopírujte Application (client) ID, vložte ho sem a klikněte na Uložit konfiguraci.</li>
              <li>Klikněte na Připojit OneDrive, dokončete Microsoft přihlášení a po návratu do aplikace použijte Nahrát ZIP zálohu na OneDrive.</li>
            </ol>
            <p className="muted">Pro lokální test použijte přesně aktuálně zobrazené redirect URI. Pro nasazenou GitHub Pages verzi bude potřeba přidat i její produkční URL.</p>
          </details>
          <label>
            Microsoft Application (client) ID
            <input
              value={oneDriveClientId}
              onChange={(event) => setOneDriveClientId(event.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            />
          </label>
          <p className="muted">Redirect URI pro registraci: <code>{typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : ''}</code></p>
          <div className="button-row">
            <button className="secondary-button" type="button" onClick={handleSaveOneDriveClientId} disabled={oneDriveBusy}>Uložit konfiguraci</button>
            <button className="primary-button" type="button" onClick={handleConnectOneDrive} disabled={oneDriveBusy || !oneDriveClientId.trim()}>
              {oneDriveSettings?.connected ? 'Znovu přihlásit OneDrive' : 'Připojit OneDrive'}
            </button>
            {oneDriveSettings?.connected && (
              <button className="secondary-button" type="button" onClick={handleDisconnectOneDrive} disabled={oneDriveBusy}>Odpojit</button>
            )}
          </div>
          {oneDriveSettings?.connected && (
            <>
              <p className="muted">
                Připojeno {oneDriveSettings.accountName ? `jako ${oneDriveSettings.accountName}` : 'k OneDrive'}.
                {oneDriveSettings.lastBackupAt ? ` Poslední upload: ${formatDateTime(oneDriveSettings.lastBackupAt)}.` : ''}
              </p>
              <div className="button-row">
                <button className="primary-button" type="button" onClick={handleUploadOneDriveBackup} disabled={oneDriveBusy || exportProgress !== null}>
                  {oneDriveBusy ? 'Pracuji…' : 'Nahrát ZIP zálohu na OneDrive'}
                </button>
                <button className="secondary-button" type="button" onClick={handleRefreshOneDriveBackups} disabled={oneDriveBusy}>Načíst cloudové zálohy</button>
              </div>

              {exportProgress && (
                <div className="preview-row" style={{ gap: '0.8rem', marginTop: '0.5rem' }}>
                  <strong>{exportLabel || 'Příprava zálohy...'}</strong>
                  <div className="progress-track">
                      <span style={{ width: `${(exportProgress.current / exportProgress.total) * 100}%` }} />
                  </div>
                  <small className="muted">{exportProgress.current === exportProgress.total && exportProgress.total === 100 ? '100%' : `${exportProgress.current} / ${exportProgress.total}`}</small>
                </div>
              )}
              <div className="backup-history-list">
                {oneDriveBackups.length === 0 ? (
                  <p className="muted">Zatím tu není žádná OneDrive záloha načtená z aplikační složky.</p>
                ) : oneDriveBackups.map((entry) => (
                  <div className="backup-history-row" key={entry.id}>
                    <div>
                      <strong>{entry.name}</strong>
                      <small>{formatDateTime(entry.modifiedAt)} · {formatBytes(entry.size)}</small>
                    </div>
                    <div className="button-row">
                      <button className="tiny-button" type="button" onClick={() => void handleRestoreOneDriveBackup(entry)} disabled={oneDriveBusy}>Obnovit</button>
                      {entry.webUrl && <a className="tiny-button" href={entry.webUrl} target="_blank" rel="noreferrer">Otevřít</a>}
                      <button className="tiny-button" type="button" onClick={() => void handleDeleteOneDriveBackup(entry)} disabled={oneDriveBusy}>Smazat</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </details>

        <section className="backup-history-list">
          <div className="section-title">
            <h3>Historie záloh</h3>
            <span>{backupHistory.length} / 8</span>
          </div>
          {backupHistory.length === 0 ? (
            <p className="muted">Zatím tu není žádná lokálně uložená záloha.</p>
          ) : backupHistory.map((entry) => (
            <div className="backup-history-row" key={entry.id}>
              <div>
                <strong>{formatDateTime(entry.createdAt)}</strong>
                <small>{backupReasonLabel(entry.reason)} · {(entry.format ?? 'json').toUpperCase()} · {formatBytes(entry.size)} · v{entry.appVersion}</small>
              </div>
              <div className="button-row">
                <button className="tiny-button" type="button" onClick={() => void downloadBackupHistoryEntry(entry.id)}>Stáhnout</button>
                <button className="tiny-button" type="button" onClick={() => void handleRestoreHistory(entry.id)}>Obnovit</button>
                <button className="tiny-button" type="button" onClick={() => void handleDeleteHistory(entry.id)}>Smazat</button>
              </div>
            </div>
          ))}
        </section>

        <SettingsImportAction
          title="Soft import — sloučit bez duplicit"
          description="Zkontroluje existující data a přidá jen nové nebo novější změny."
          buttonLabel="Vybrat JSON/ZIP pro soft import"
          onFile={(file) => handleJsonImport('soft', file)}
        />
        <SettingsImportAction
          title="Hard import — přidat vše z JSONu"
          description="Přidá celý obsah JSONu k aktuálním datům. Může vytvořit duplicity."
          buttonLabel="Vybrat JSON/ZIP pro hard import"
          onFile={(file) => handleJsonImport('hard', file)}
        />
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={hardImportSettings}
            onChange={(event) => setHardImportSettings(event.target.checked)}
          />
          Importovat při hard importu také nastavení aplikace
        </label>
        <SettingsImportAction
          title="Reset / Obnovit ze zálohy"
          description="Nahradí celý aktuální stav aplikace obsahem zálohy."
          buttonLabel="Vybrat JSON/ZIP pro obnovu"
          danger
          onFile={(file) => handleJsonImport('reset', file)}
        />

        <h3>Připomenutí zálohy</h3>
        <label>
            Interval připomenutí (dny):
            <input type="number" value={interval} onChange={(e) => updateInterval(Number(e.target.value))} min="1" style={{ marginLeft: '10px', width: '80px', padding: '5px' }} />
        </label>
        
        <h3>Údržba databáze</h3>
        <button className="secondary-button" onClick={purgeOrphanMedia}>Smazat nepřiřazená média</button>
        <button className="secondary-button" onClick={purgeOldLogs}>Smazat historii starší 1 rok</button>
        <button className="secondary-button" onClick={forceUpdate} style={{ color: '#d32f2f' }}>Vynutit aktualizaci aplikace</button>
        <p className="muted">Verze aplikace: v{APP_VERSION}</p>
        <button className="secondary-button" type="button" onClick={onClose}>Zavřít</button>
      </div>
  );
}

function backupReasonLabel(reason: BackupHistoryEntry['reason']): string {
  if (reason === 'share') return 'sdílení';
  if (reason === 'reset-safety') return 'bezpečnostní snapshot';
  return 'ruční export';
}

function formatBytes(value: number): string {
  if (value <= 0) return '0 kB';
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} kB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function estimateJsonSize(value: unknown): number {
  return new Blob([JSON.stringify(value)]).size;
}

function SettingsImportAction({ title, description, buttonLabel, danger, onFile }: {
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

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Pozadí se nepodařilo načíst.'));
    reader.readAsDataURL(blob);
  });
}
