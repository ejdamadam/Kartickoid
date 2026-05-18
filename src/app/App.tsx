import { useCallback, useState, useEffect, useRef, type TouchEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import HomePage from '../pages/HomePage';
import DeckPage from '../pages/DeckPage';
import StudyPage from '../pages/StudyPage';
import MatchPage from '../pages/MatchPage';
import TestPage from '../pages/TestPage';
import QuickGamePage from '../pages/QuickGamePage';
import ImportPage from '../pages/ImportPage';
import StatsPage from '../pages/StatsPage';
import HelpPage from '../pages/HelpPage';
import AppDrawer from '../components/AppDrawer';
import OfflineStatus from '../components/OfflineStatus';
import Modal from '../components/Modal';
import SettingsModal from '../components/SettingsModal';
import { downloadBackup } from '../services/exportImport';
import { completeOneDriveRedirect } from '../services/oneDriveSync';
import { db } from '../db/database';
import { nowIso } from '../utils/date';
import { t } from '../i18n';
import { APP_VERSION } from './version';
import type { StudySessionSource } from '../types';

type Route =
  | { name: 'home' }
  | { name: 'deck'; deckId: string }
  | { name: 'study'; deckIds: string[]; tags: string[]; source?: StudySessionSource; limit?: number; order?: 'default' | 'random' }
  | { name: 'match'; deckId: string }
  | { name: 'test'; deckId: string }
  | { name: 'game'; deckId: string }
  | { name: 'import' }
  | { name: 'stats' }
  | { name: 'help' };

export default function App() {
  const [routeStack, setRouteStack] = useState<Route[]>([{ name: 'home' }]);
  const route = routeStack.at(-1) ?? { name: 'home' };
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [modal, setModal] = useState<'settings' | 'about'>();

  useEffect(() => {
    void completeOneDriveRedirect().then((result) => {
      if (result.error) {
        console.warn(result.error);
      }
    });

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
  const navigate = useCallback((nextRoute: Route) => {
    setRouteStack((stack) => {
      const current = stack.at(-1);
      if (current && routeKey(current) === routeKey(nextRoute)) return stack;
      return [...stack, nextRoute];
    });
  }, []);
  const goBack = useCallback(() => {
    setRouteStack((stack) => stack.length > 1 ? stack.slice(0, -1) : stack);
  }, []);
  const canGoBack = routeStack.length > 1;
  const showBackButton = route.name !== 'home' && canGoBack;

  const gestureHandlers = useSwipeNavigation({
    drawerOpen,
    canGoBack,
    onOpenDrawer: () => setDrawerOpen(true),
    onCloseDrawer: () => setDrawerOpen(false),
    onBack: goBack
  });

  return (
    <div className="app-shell" {...gestureHandlers}>
      <AppDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onHome={() => navigate({ name: 'home' })}
        onImport={() => navigate({ name: 'import' })}
        onStats={() => navigate({ name: 'stats' })}
        onHelp={() => navigate({ name: 'help' })}
        onSettings={() => setModal('settings')}
        onAbout={() => setModal('about')}
      />

      {modal && (
          <Modal title={modal === 'settings' ? 'Nastavení' : 'O aplikaci'} onClose={() => setModal(undefined)}>
              {modal === 'settings' ? <SettingsModal onClose={() => setModal(undefined)} /> : <p>Kartičkoid v{APP_VERSION}  ukuchtil Hůlka 2026 s Koudexem a Džeminou ;-P.</p>}
          </Modal>
      )}
      
      <main className="main-content">
        {route.name !== 'study' && (
          <header className="app-header">
            <button className="icon-button" onClick={() => setDrawerOpen(true)} aria-label="Menu">☰</button>
            {showBackButton ? (
              <button
                className="back-icon-button"
                onClick={goBack}
                aria-label="Zpět"
                title="Zpět"
              >
                ←
              </button>
            ) : (
              <span className="header-spacer" aria-hidden="true" />
            )}
            <OfflineStatus />
          </header>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={routeKey(route)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
            className="route-container"
          >
            {route.name === 'home' && (
              <HomePage
                refreshKey={refreshKey}
                onOpenDeck={(deckId) => navigate({ name: 'deck', deckId })}
                onChanged={refresh}
                onCustomStudy={(deckIds, tags) => navigate({ name: 'study', deckIds, tags })}
              />
            )}

            {route.name === 'deck' && (
              <DeckPage
                deckId={route.deckId}
                refreshKey={refreshKey}
                onBack={goBack}
                onStudy={(options) => navigate({ name: 'study', deckIds: [route.deckId], tags: [], ...options })}
                onMatch={() => navigate({ name: 'match', deckId: route.deckId })}
                onTest={() => navigate({ name: 'test', deckId: route.deckId })}
                onGame={() => navigate({ name: 'game', deckId: route.deckId })}
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
                onBack={goBack}
                onChanged={refresh}
              />
            )}

            {route.name === 'match' && (
              <MatchPage deckId={route.deckId} onBack={goBack} />
            )}

            {route.name === 'test' && (
              <TestPage deckId={route.deckId} onBack={goBack} />
            )}

            {route.name === 'game' && (
              <QuickGamePage deckId={route.deckId} onBack={goBack} />
            )}

            {route.name === 'import' && (
              <ImportPage
                onChanged={refresh}
                onDeckCreated={(deckId) => navigate({ name: 'deck', deckId })}
              />
            )}

            {route.name === 'stats' && (
              <StatsPage />
            )}

            {route.name === 'help' && (
              <HelpPage />
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

function routeKey(route: Route): string {
  return JSON.stringify(route);
}

function useSwipeNavigation({ drawerOpen, canGoBack, onOpenDrawer, onCloseDrawer, onBack }: {
  drawerOpen: boolean;
  canGoBack: boolean;
  onOpenDrawer: () => void;
  onCloseDrawer: () => void;
  onBack: () => void;
}) {
  const touchStart = useRef<{ x: number; y: number; drawerOpen: boolean } | undefined>(undefined);

  return {
    onTouchStart: (event: TouchEvent<HTMLDivElement>) => {
      const touch = event.touches[0];
      touchStart.current = { x: touch.clientX, y: touch.clientY, drawerOpen };
    },
    onTouchEnd: (event: TouchEvent<HTMLDivElement>) => {
      const start = touchStart.current;
      touchStart.current = undefined;
      if (!start) return;

      const touch = event.changedTouches[0];
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      const horizontal = Math.abs(dx) > 72 && Math.abs(dx) > Math.abs(dy) * 1.8;
      if (!horizontal) return;

      if (start.drawerOpen && dx < -72) {
        onCloseDrawer();
        return;
      }

      if (!start.drawerOpen && start.x <= 28 && dx > 72) {
        onOpenDrawer();
        return;
      }

      if (!start.drawerOpen && canGoBack && start.x > 28 && start.x <= 96 && dx > 84) {
        onBack();
      }
    }
  };
}
