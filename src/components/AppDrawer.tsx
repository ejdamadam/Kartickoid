import { useState } from 'react';
import { motion } from 'framer-motion';
import { t } from '../i18n';
import { APP_VERSION } from '../app/version';

interface AppDrawerProps {
  open: boolean;
  onClose: () => void;
  onHome: () => void;
  onImport: () => void;
  onStats: () => void;
  onHelp: () => void;
  onSettings: () => void;
  onAbout: () => void;
}

export default function AppDrawer({ open, onClose, onHome, onImport, onStats, onHelp, onSettings, onAbout }: AppDrawerProps) {
  const items = [
    { label: t.nav.decks, action: onHome },
    { label: t.common.import, action: onImport },
    { label: t.common.statistics, action: onStats },
    { label: 'Návod', action: onHelp },
    { label: t.common.settings, action: onSettings },
    { label: t.common.about, action: onAbout },
  ];

  const [clickCount, setClickCount] = useState(0);

  const handleEasterEgg = () => {
    const next = clickCount + 1;
    if (next >= 5) {
      alert('Hejou ty magore!! Všecičko nejlepší Aliíiíiíií!');
      setClickCount(0);
    } else {
      setClickCount(next);
    }
  };

  return (
    <div className="drawer-layer" style={{ pointerEvents: open ? 'auto' : 'none' }}>
      <motion.button
        className="drawer-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: open ? 1 : 0 }}
        onClick={onClose}
        aria-label={t.common.closeMenu}
      />
      <motion.aside
        className="app-drawer"
        initial={{ x: '-100%' }}
        animate={{ x: open ? '0%' : '-100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      >
        <header className="drawer-header" onClick={handleEasterEgg} style={{ cursor: 'pointer' }}>
          <div className="brand-mark">{t.app.mark}</div>
          <div>
            <strong>{t.app.name}</strong>
            <p>{t.app.localStudy}</p>
          </div>
        </header>

        <nav className="drawer-nav">
          {items.map((item, index) => (
            <button
              key={`${item.label}-${index}`}
              onClick={() => {
                item.action();
                onClose();
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <p className="drawer-version">v{APP_VERSION}</p>
      </motion.aside>
    </div>
  );
}
