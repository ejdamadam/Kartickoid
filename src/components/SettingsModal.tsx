import { useState, useEffect } from 'react';
import Modal from './Modal';
import { db } from '../db/database';
import { nowIso } from '../utils/date';

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

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const [selectedTheme, setSelectedTheme] = useState(JSON.parse(localStorage.getItem('app-theme') || '{"name": "Classic"}').name);
  const [interval, setInterval] = useState(7);

  useEffect(() => {
    db.appMeta.get('backupInterval').then(m => m && setInterval(Number(m.value)));
  }, []);

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

  function applyTheme(theme: typeof themes[0]) {
    const styleId = 'custom-theme-styles';
    let style = document.getElementById(styleId) as HTMLStyleElement;
    if (!style) {
        style = document.createElement('style');
        style.id = styleId;
        document.head.appendChild(style);
    }
    
    const hexToRgb = (hex: string) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `${r}, ${g}, ${b}`;
    };

    style.innerHTML = `
      :root { 
        --primary-color: ${theme.primary}; 
        --primary-rgb: ${hexToRgb(theme.primary)};
        --bg-color: ${theme.bg}; 
        --bg-rgb: ${hexToRgb(theme.bg)};
      }`;
    
    localStorage.setItem('app-theme', JSON.stringify(theme));
    setSelectedTheme(theme.name);
    window.location.reload(); // Reload pro jistotu
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
    <Modal title="Nastavení" onClose={onClose}>
      <div className="stack">
        <h3>Motiv</h3>
        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', padding: '10px 0' }}>
          {themes.map(t => (
            <button key={t.name} onClick={() => applyTheme(t)} 
                style={{ 
                    background: t.primary, 
                    width: '45px', 
                    height: '45px', 
                    borderRadius: '50%', 
                    border: selectedTheme === t.name ? '4px solid #aaa' : '2px solid #ddd',
                    padding: '2px',
                    cursor: 'pointer',
                    transition: 'transform 0.2s',
                    boxShadow: selectedTheme === t.name ? '0 0 0 2px #fff' : 'none'
                }}
                aria-label={t.name}
            />
          ))}
        </div>
        
        <h3>Zálohování</h3>
        <label>
            Interval připomenutí (dny):
            <input type="number" value={interval} onChange={(e) => updateInterval(Number(e.target.value))} min="1" style={{ marginLeft: '10px', width: '80px', padding: '5px' }} />
        </label>
        
        <h3>Údržba databáze</h3>
        <button className="secondary-button" onClick={purgeOrphanMedia}>Smazat nepřiřazená média</button>
        <button className="secondary-button" onClick={purgeOldLogs}>Smazat historii starší 1 rok</button>
        <button className="secondary-button" onClick={forceUpdate} style={{ color: '#d32f2f' }}>Vynutit aktualizaci aplikace</button>
      </div>
    </Modal>
  );
}
