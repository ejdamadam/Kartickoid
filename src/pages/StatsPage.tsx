import { useEffect, useMemo, useState } from 'react';
import { t } from '../i18n';
import { getStatsOverview, type StatsOverview } from '../services/stats';
import { formatDateTime } from '../utils/date';

interface StatsPageProps {
  onBack: () => void;
}

export default function StatsPage({ onBack }: StatsPageProps) {
  const [stats, setStats] = useState<StatsOverview>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    getStatsOverview().then(setStats).catch((err) => setError(err instanceof Error ? err.message : t.common.error));
  }, []);

  const maxWeek = useMemo(() => Math.max(1, ...(stats?.weeklyActivity.map((day) => day.count) ?? [1])), [stats]);

  return (
    <section className="page">
      <button className="back-button" onClick={onBack}>← {t.common.back}</button>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t.common.statistics}</p>
          <h1>{t.stats.title}</h1>
          <p className="lead">{t.stats.lead}</p>
        </div>
      </div>

      {error && <p className="error-box">{error}</p>}
      {!stats ? (
        <div className="skeleton-grid">
          <span />
          <span />
          <span />
        </div>
      ) : (
        <>
          <div className="stats-row">
            <span><strong>{stats.reviewedToday}</strong> {t.stats.today}</span>
            <span><strong>{stats.streak}</strong> {t.stats.streak}</span>
            <span><strong>{stats.dueCount}</strong> {t.stats.due}</span>
            <span><strong>{stats.totalCards}</strong> {t.stats.total}</span>
          </div>

          <section className="panel stack">
            <div className="section-title">
              <h2>{t.stats.successRate}</h2>
              <span>{stats.successRate} %</span>
            </div>
            <div className="progress-track"><span style={{ width: `${stats.successRate}%` }} /></div>
          </section>

          <section className="panel stack">
            <h2>{t.stats.weeklyActivity}</h2>
            <div className="mini-graph">
              {stats.weeklyActivity.map((day) => (
                <div className="mini-bar" key={day.label}>
                  <span style={{ height: `${Math.max(8, (day.count / maxWeek) * 100)}%` }} />
                  <small>{day.label}</small>
                </div>
              ))}
            </div>
          </section>

          <div className="stats-columns">
            <section className="panel stack">
              <h2>{t.stats.hardestCards}</h2>
              {stats.hardestCards.length === 0 ? <p className="muted">{t.stats.noData}</p> : stats.hardestCards.map((item) => (
                <div className="compact-row" key={item.card.id}>
                  <strong>{item.card.frontText || item.card.backText || t.deck.imageOnly}</strong>
                  <span>{item.misses}×</span>
                </div>
              ))}
            </section>
            <section className="panel stack">
              <h2>{t.stats.recentActivity}</h2>
              {stats.recentLogs.length === 0 ? <p className="muted">{t.stats.noData}</p> : stats.recentLogs.map((log) => (
                <div className="compact-row" key={log.id}>
                  <strong>{formatDateTime(log.reviewedAt)}</strong>
                  <span>{log.rating}</span>
                </div>
              ))}
            </section>
          </div>
        </>
      )}
    </section>
  );
}
