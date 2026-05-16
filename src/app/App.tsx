import { useCallback, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import HomePage from '../pages/HomePage';
import DeckPage from '../pages/DeckPage';
import StudyPage from '../pages/StudyPage';
import ImportPage from '../pages/ImportPage';
import StatsPage from '../pages/StatsPage';
import HelpPage from '../pages/HelpPage';
import AppDrawer from '../components/AppDrawer';
import OfflineStatus from '../components/OfflineStatus';
import Modal from '../components/Modal';
import SettingsModal from '../components/SettingsModal';
import { downloadBackup } from '../services/exportImport';
import { db } from '../db/database';
import { nowIso } from '../utils/date';
import { t } from '../i18n';
import { APP_VERSION } from './version';
import type { StudySessionSource } from '../types';

type Route =
  | { name: 'home' }
  | { name: 'deck'; deckId: string }
  | { name: 'study'; deckIds: string[]; tags: string[]; source?: StudySessionSource; limit?: number; order?: 'default' | 'random' }
  | { name: 'import' }
  | { name: 'stats' }
  | { name: 'help' };

export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [modal, setModal] = useState<'settings' | 'about'>();

  useEffect(() => {
    async function checkBackupReminder() {
        // Wait briefly for initial DB sync or just ensure we don't trigger if meta is undefined
        const meta = await db.appMeta.get('lastBackupAt');
        
        // If meta is undefined, it means this is a fresh install or no backup ever made.
        // Don't spam the user immediately.
        if (!meta) {
            await db.appMeta.put({ key: 'lastBackupAt', value: nowIso(), updatedAt: nowIso() });
            return;
        }

        const intervalMeta = await db.appMeta.get('backupInterval');
        const interval = intervalMeta ? Number(intervalMeta.value) : 7;

        const lastBackup = new Date(meta.value as string);
        const limitDate = new Date();
        limitDate.setDate(limitDate.getDate() - interval);

        if (lastBackup < limitDate) {
            if (window.confirm(`Je to více než ${interval} dní od poslední zálohy. Chcete nyní exportovat zálohu databáze?`)) {
                await downloadBackup();
                await db.appMeta.put({ key: 'lastBackupAt', value: nowIso(), updatedAt: nowIso() });
            }
        }
    }
    
    // Add a small delay to allow initial load to settle
    const timer = setTimeout(checkBackupReminder, 2000);
    return () => clearTimeout(timer);
  }, []);

  const refresh = useCallback(() => setRefreshKey((prev) => prev + 1), []);

  return (
    <div className="app-shell">
      <AppDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onHome={() => setRoute({ name: 'home' })}
        onImport={() => setRoute({ name: 'import' })}
        onExport={downloadBackup}
        onStats={() => setRoute({ name: 'stats' })}
        onHelp={() => setRoute({ name: 'help' })}
        onSettings={() => setModal('settings')}
        onAbout={() => setModal('about')}
      />

      {modal && (
          <Modal title={modal === 'settings' ? 'Nastavení' : 'O aplikaci'} onClose={() => setModal(undefined)}>
              {modal === 'settings' ? <SettingsModal onClose={() => setModal(undefined)} /> : <p>Kartičkoid v{APP_VERSION}</p>}
          </Modal>
      )}
      
      <main className="main-content">
        {route.name !== 'study' && (
          <header className="app-header">
            <button className="icon-button" onClick={() => setDrawerOpen(true)} aria-label="Menu">☰</button>
            <button className="text-button" onClick={() => setRoute({ name: 'home' })}>← Domů</button>
            <OfflineStatus />
          </header>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={route.name}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            className="route-container"
          >
            {route.name === 'home' && (
              <HomePage
                refreshKey={refreshKey}
                onOpenDeck={(deckId) => setRoute({ name: 'deck', deckId })}
                onChanged={refresh}
                onCustomStudy={(deckIds, tags) => setRoute({ name: 'study', deckIds, tags })}
              />
            )}

            {route.name === 'deck' && (
              <DeckPage
                deckId={route.deckId}
                refreshKey={refreshKey}
                onBack={() => setRoute({ name: 'home' })}
                onStudy={(options) => setRoute({ name: 'study', deckIds: [route.deckId], tags: [], ...options })}
                onChanged={refresh}
              />
            )}

            {route.name === 'study' && (
              <StudyPage
                deckIds={route.deckIds}
                tags={route.tags}
                initialSource={route.source}
                initialLimit={route.limit}
                initialOrder={route.order}
                onBack={() => {
                    if (route.deckIds.length === 1) {
                        setRoute({ name: 'deck', deckId: route.deckIds[0] });
                    } else {
                        setRoute({ name: 'home' });
                    }
                }}
                onChanged={refresh}
              />
            )}

            {route.name === 'import' && (
              <ImportPage
                onBack={() => setRoute({ name: 'home' })}
                onChanged={refresh}
                onDeckCreated={(deckId) => setRoute({ name: 'deck', deckId })}
              />
            )}

            {route.name === 'stats' && (
              <StatsPage onBack={() => setRoute({ name: 'home' })} />
            )}

            {route.name === 'help' && (
              <HelpPage onBack={() => setRoute({ name: 'home' })} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
