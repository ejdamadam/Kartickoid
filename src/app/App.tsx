import { useCallback, useState, useEffect } from 'react';
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
import { db } from '../db/database';
import { nowIso } from '../utils/date';
import { t } from '../i18n';

type Route =
  | { name: 'home' }
  | { name: 'deck'; deckId: string }
  | { name: 'study'; deckId: string }
  | { name: 'import' }
  | { name: 'stats' };

export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    async function checkBackupReminder() {
        const meta = await db.appMeta.get('lastBackupAt');
        const lastBackup = meta ? new Date(meta.value as string) : new Date(0);
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        if (lastBackup < sevenDaysAgo) {
            if (window.confirm('Je to více než 7 dní od poslední zálohy. Chcete nyní exportovat zálohu databáze?')) {
                await downloadBackup();
                await db.appMeta.put({ key: 'lastBackupAt', value: nowIso(), updatedAt: nowIso() });
            }
        }
    }
    checkBackupReminder();
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
        onSettings={() => {}}
        onAbout={() => {}}
      />
      
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
                onDeckCreated={(deckId) => setRoute({ name: 'deck', deckId })}
              />
            )}

            {route.name === 'stats' && (
              <StatsPage onBack={() => setRoute({ name: 'home' })} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
