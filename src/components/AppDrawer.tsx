import { motion } from 'framer-motion';
import { t } from '../i18n';

interface AppDrawerProps {
  open: boolean;
  onClose: () => void;
  onHome: () => void;
  onImport: () => void;
  onExport: () => void;
  onStats: () => void;
  onSettings: () => void;
  onAbout: () => void;
}

export default function AppDrawer({ open, onClose, onHome, onImport, onExport, onStats, onSettings, onAbout }: AppDrawerProps) {
  if (!open) return null;

  const items = [
    { label: t.nav.home, action: onHome },
    { label: t.common.import, action: onImport },
    { label: t.nav.exportBackup, action: onExport },
    { label: t.common.statistics, action: onStats },
    { label: t.common.settings, action: onSettings },
    { label: t.common.about, action: onAbout }
  ];

  return (
    <div className="drawer-layer">
      <motion.button
        className="drawer-backdrop"
        aria-label={t.common.closeMenu}
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      <motion.aside
        className="app-drawer"
        initial={{ x: '-100%' }}
        animate={{ x: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.18}
        onDragEnd={(_event, info) => {
          if (info.offset.x < -80) onClose();
        }}
      >
        <div className="drawer-header">
          <span className="brand-mark">{t.app.mark}</span>
          <div>
            <strong>{t.app.name}</strong>
            <p>{t.nav.cleanMainHint}</p>
          </div>
        </div>
        <nav className="drawer-nav" aria-label="Menu">
          {items.map((item) => (
            <button
              type="button"
              key={item.label}
              onClick={() => {
                item.action();
                onClose();
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </motion.aside>
    </div>
  );
}
