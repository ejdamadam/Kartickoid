import { useEffect, useMemo, useState } from 'react';
import { t } from '../i18n';
import { getStatsOverview, type StatsOverview } from '../services/stats';
import { formatDateTime } from '../utils/date';
import RichTextDisplay from '../components/RichTextDisplay';

export default function StatsPage() {
  const [stats, setStats] = useState<StatsOverview>();
  const [error, setError] = useState<string>();
  const [deckSort, setDeckSort] = useState<'last' | 'worst' | 'most' | 'hard'>('last');

  useEffect(() => {
    getStatsOverview().then(setStats).catch((err) => setError(err instanceof Error ? err.message : t.common.error));
  }, []);

  const maxWeek = useMemo(() => Math.max(1, ...(stats?.weeklyActivity.map((day) => day.count) ?? [1])), [stats]);
  const sortedDeckActivity = useMemo(() => {
    const items = [...(stats?.deckActivity ?? [])];
    return items.sort((a, b) => {
      if (deckSort === 'worst') return a.successRate - b.successRate || b.answeredCount - a.answeredCount;
      if (deckSort === 'most') return b.answeredCount - a.answeredCount;
      if (deckSort === 'hard') return b.hardCards - a.hardCards;
      return (b.lastReviewedAt ?? '').localeCompare(a.lastReviewedAt ?? '');
    });
  }, [deckSort, stats]);

  return (
    <section className="page">
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
            <h2>{t.stats.distribution}</h2>
            <div className="stats-row">
              {Object.entries(stats.ratingDistribution).map(([rating, count]) => (
                <div key={rating}>
                  <strong>{count}</strong>
                  <small style={{ display: 'block' }}>{rating}</small>
                </div>
              ))}
            </div>
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

          <section className="panel stack">
            <div className="section-title">
              <h2>Aktivita podle balíčků</h2>
              <label className="compact-select">
                Řadit
                <select value={deckSort} onChange={(event) => setDeckSort(event.target.value as typeof deckSort)}>
                  <option value="last">poslední aktivita</option>
                  <option value="worst">nejhorší úspěšnost</option>
                  <option value="most">nejvíce procvičováno</option>
                  <option value="hard">nejvíce těžkých</option>
                </select>
              </label>
            </div>
            {sortedDeckActivity.length === 0 ? <p className="muted">{t.stats.noData}</p> : (
              <div className="activity-table">
                <div className="activity-row activity-head">
                  <span>Balíček</span>
                  <span>Odpovědi</span>
                  <span>Správně / špatně</span>
                  <span>Úspěšnost</span>
                  <span>Těžké</span>
                  <span>Poslední aktivita</span>
                </div>
                {sortedDeckActivity.map((deck) => (
                  <div className="activity-row" key={deck.deckId}>
                    <strong>{deck.deckName}</strong>
                    <span>{deck.answeredCount}</span>
                    <span>{deck.correctAnswers} / {deck.wrongAnswers}</span>
                    <span>{deck.successRate} %</span>
                    <span>{deck.hardCards}</span>
                    <span>{deck.lastReviewedAt ? formatDateTime(deck.lastReviewedAt) : t.common.never}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="stats-columns">
            <section className="panel stack">
              <h2>{t.stats.hardestCards}</h2>
              {stats.hardestCards.length === 0 ? <p className="muted">{t.stats.noData}</p> : stats.hardestCards.map((item) => (
                <div className="compact-row" key={item.card.id}>
                  <RichTextDisplay content={item.card.frontText || item.card.backText || t.deck.imageOnly} />
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
