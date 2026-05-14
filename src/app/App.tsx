import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import HomePage from '../pages/HomePage';
import DeckPage from '../pages/DeckPage';
import StudyPage from '../pages/StudyPage';
import ImportPage from '../pages/ImportPage';
import StatsPage from '../pages/StatsPage';
import AppDrawer from '../components/AppDrawer';
import OfflineStatus from '../components/OfflineStatus';
import Modal from '../components/Modal';
import { downloadBackup } from '../services/exportImport';
import { t } from '../i18n';

type Route =
  | { name: 'home' }
  | { name: 'deck'; deckId: string }
  | { name: 'study'; deckId: string }
  | { name: 'import' }
  | { name: 'stats' };

export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const [refreshKey, setRefreshKey] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [infoModal, setInfoModal] = useState<'settings' | 'about'>();
  const [toast, setToast] = useState<string>();

  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);
  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(undefined), 2600);
    if ('vibrate' in navigator) navigator.vibrate(12);
  }, []);

  async function exportBackup() {
    try {
      await downloadBackup();
      notify(t.nav.backupExported);
    } catch {
      notify(t.common.error);
    }
  }

  return (
    <div className={`app-shell ${route.name === 'study' ? 'study-mode' : ''}`}>
      {route.name !== 'study' && (
        <header className="topbar">
          <button className="menu-button" onClick={() => setDrawerOpen(true)} aria-label={t.common.openMenu}>
            <span />
            <span />
            <span />
          </button>
          <div className="topbar-center">
            {route.name === 'home' ? (
              <button className="brand-button" onClick={() => setRoute({ name: 'home' })} aria-label={t.nav.home}>
                <span>{t.app.name}</span>
              </button>
            ) : (
              <button className="brand-button back-link" onClick={() => setRoute({ name: 'home' })}>
                ← {t.nav.home}
              </button>
            )}
          </div>
          <OfflineStatus />
        </header>
      )}

      <main className="app-main">
        <AnimatePresence mode="wait">
          <motion.div
            key={route.name}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="route-container"
          >
            {route.name === 'home' && (
              <HomePage
                refreshKey={refreshKey}
                onOpenDeck={(deckId) => setRoute({ name: 'deck', deckId })}
                onChanged={refresh}
              />
            )}

            {route.name === 'deck' && (
              <DeckPage
                deckId={route.deckId}
                refreshKey={refreshKey}
                onBack={() => setRoute({ name: 'home' })}
                onStudy={() => setRoute({ name: 'study', deckId: route.deckId })}
                onChanged={refresh}
              />
            )}

            {route.name === 'study' && (
              <StudyPage
                deckId={route.deckId}
                onBack={() => setRoute({ name: 'deck', deckId: route.deckId })}
                onChanged={refresh}
              />
            )}

            {route.name === 'import' && (
              <ImportPage
                onBack={() => setRoute({ name: 'home' })}
                onChanged={refresh}
              />
            )}

            {route.name === 'stats' && (
              <StatsPage onBack={() => setRoute({ name: 'home' })} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <AppDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onHome={() => setRoute({ name: 'home' })}
        onImport={() => setRoute({ name: 'import' })}
        onExport={exportBackup}
        onStats={() => setRoute({ name: 'stats' })}
        onSettings={() => setInfoModal('settings')}
        onAbout={() => setInfoModal('about')}
      />

      {infoModal && (
        <Modal title={infoModal === 'settings' ? t.common.settings : t.common.about} onClose={() => setInfoModal(undefined)}>
          <div className="stack">
            <p>{infoModal === 'settings' ? t.nav.settingsBody : t.nav.aboutBody}</p>
            <button className="primary-button" onClick={() => setInfoModal(undefined)}>{t.common.done}</button>
          </div>
        </Modal>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
