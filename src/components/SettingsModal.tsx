import { useState, useEffect } from 'react';
import { db } from '../db/database';
import { formatDateTime, nowIso } from '../utils/date';
import { useTheme, type TextSize } from '../contexts/ThemeContext';
import { processImageForCard } from '../services/imageProcessing';
import {
  deleteBackupHistoryEntry,
  downloadBackup,
  downloadBackupHistoryEntry,
  formatImportSummary,
  getBackupHistory,
  importBackupFile,
  restoreBackupHistoryEntry,
  shareBackup,
  type ImportMode
} from '../services/exportImport';
import type { BackupHistoryEntry } from '../types';

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

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const { theme, setTheme, textSize, setTextSize, customBackground, setCustomBackground, clearCustomBackground } = useTheme();
  const [interval, setInterval] = useState(7);
  const [backgroundSaving, setBackgroundSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string>();
  const [settingsMessage, setSettingsMessage] = useState<string>();
  const [hardImportSettings, setHardImportSettings] = useState(false);
  const [backupHistory, setBackupHistory] = useState<BackupHistoryEntry[]>([]);

  useEffect(() => {
    db.appMeta.get('backupInterval').then(m => m && setInterval(Number(m.value)));
    void loadBackupHistory();
  }, []);

  async function loadBackupHistory() {
    setBackupHistory(await getBackupHistory());
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
    alert(`Smazáno ${orphans.length} nepřiřazených mediálních souborů.`);
  }

  async function purgeOldLogs() {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const oldLogs = await db.reviewLogs.where('reviewedAt').below(oneYearAgo.toISOString()).toArray();
    for (const log of oldLogs) {
        await db.reviewLogs.delete(log.id);
    }
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
      const ok = window.confirm('Tento krok smaže aktuální lokální data a nahradí je obsahem zálohy. Před obnovou se stáhne bezpečnostní snapshot aktuálního stavu. Pokračovat?');
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

  async function handleShareBackup() {
    setSettingsError(undefined);
    setSettingsMessage(undefined);
    try {
      const result = await shareBackup();
      setSettingsMessage(result === 'shared'
        ? 'Sdílení JSON zálohy bylo otevřeno.'
        : 'Sdílení není v tomto prohlížeči dostupné, záloha byla stažena jako soubor.');
      await loadBackupHistory();
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Sdílení zálohy se nepodařilo.');
    }
  }

  async function handleDownloadBackup() {
    setSettingsError(undefined);
    setSettingsMessage(undefined);
    try {
      await downloadBackup();
      setSettingsMessage('JSON záloha byla vytvořena a uložena do historie.');
      await loadBackupHistory();
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Export zálohy se nepodařil.');
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
        
        <h3>Záloha a import</h3>
        <p className="muted">JSON záloha obsahuje sady, kartičky, audio data a metadata, historii učení, progress kartiček i nastavení aplikace včetně velikosti textu a vlastního pozadí. Audio je uložené jako base64, takže může být soubor výrazně větší.</p>
        <div className="button-row">
          <button className="primary-button" type="button" onClick={handleDownloadBackup}>Exportovat JSON</button>
          <button className="secondary-button" type="button" onClick={handleShareBackup}>Sdílet JSON</button>
        </div>

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
                <small>{backupReasonLabel(entry.reason)} · {formatBytes(entry.size)} · v{entry.appVersion}</small>
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
          buttonLabel="Vybrat JSON pro soft import"
          onFile={(file) => handleJsonImport('soft', file)}
        />
        <SettingsImportAction
          title="Hard import — přidat vše z JSONu"
          description="Přidá celý obsah JSONu k aktuálním datům. Může vytvořit duplicity."
          buttonLabel="Vybrat JSON pro hard import"
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
          buttonLabel="Vybrat JSON pro obnovu"
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
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} kB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
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
          accept="application/json,.json"
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
