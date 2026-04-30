import { useMemo, useState } from 'react';
import { Flame } from 'lucide-react';
import type { StudySession } from '@/types/word';

interface Props {
  sessions: StudySession[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function localKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function intensityClass(count: number, max: number): string {
  if (count === 0) return 'bg-border/40';
  const ratio = count / max;
  if (ratio < 0.25) return 'bg-primary/30';
  if (ratio < 0.5)  return 'bg-primary/55';
  if (ratio < 0.8)  return 'bg-primary/80';
  return 'bg-accent';
}

type Period = '7d' | '30d' | 'jaar';

const PERIOD_LABELS: Record<Period, string> = {
  '7d':   '7 dagen',
  '30d':  '30 dagen',
  'jaar': 'Jaar',
};

export function ActivityHeatmap({ sessions }: Props) {
  const [period, setPeriod] = useState<Period>('30d');

  // ─── Sessiemap per dag ─────────────────────────────────────────────────
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sessions) {
      const k = localKey(new Date(s.date));
      map.set(k, (map.get(k) || 0) + s.wordsStudied);
    }
    return map;
  }, [sessions]);

  // ─── Streak ─────────────────────────────────────────────────────────────
  const { current, longest } = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let cur = 0;
    let cursor = new Date(today);
    if (!counts.has(localKey(cursor))) cursor = new Date(cursor.getTime() - DAY_MS);
    while (counts.has(localKey(cursor))) { cur++; cursor = new Date(cursor.getTime() - DAY_MS); }

    const sortedKeys = Array.from(counts.keys()).sort();
    let best = 0; let run = 0; let prev: Date | null = null;
    for (const k of sortedKeys) {
      const [y, m, d] = k.split('-').map(Number);
      const date = new Date(y, m - 1, d);
      run = (prev && date.getTime() - prev.getTime() === DAY_MS) ? run + 1 : 1;
      if (run > best) best = run;
      prev = date;
    }
    return { current: cur, longest: best };
  }, [counts]);

  // ─── Staafdiagram 7d / 30d ──────────────────────────────────────────────
  const barData = useMemo(() => {
    const n   = period === '7d' ? 7 : 30;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    // Nieuwste dag links → index 0 is vandaag
    const days = Array.from({ length: n }, (_, i) => {
      const d   = new Date(today.getTime() - i * DAY_MS);
      const key = localKey(d);
      return {
        key,
        label: i === 0 ? 'vandaag'
          : i === 1 ? 'gisteren'
          : d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }),
        count: counts.get(key) || 0,
      };
    });
    const max   = Math.max(1, ...days.map(d => d.count));
    const total = days.reduce((s, d) => s + d.count, 0);
    return { days, max, total };
  }, [counts, period]);

  // ─── Heatmap jaar ────────────────────────────────────────────────────────
  const heatmap = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);

    // Nieuwste week links: bouw 53 weken, begin bij de zondag van de huidige week
    const dayOfWeek  = today.getDay(); // 0 = zon
    const weekStart  = new Date(today);
    weekStart.setDate(today.getDate() - dayOfWeek); // terug naar zon van deze week

    const weeks: { date: Date; key: string; count: number; future: boolean }[][] = [];
    let max = 1;

    for (let w = 0; w < 53; w++) {
      const week: { date: Date; key: string; count: number; future: boolean }[] = [];
      for (let d = 0; d < 7; d++) {
        // w=0: huidige week, w=1: vorige week, etc.
        const date   = new Date(weekStart.getTime() - w * 7 * DAY_MS + d * DAY_MS);
        const key    = localKey(date);
        const count  = counts.get(key) || 0;
        const future = date.getTime() > today.getTime();
        if (!future && count > max) max = count;
        week.push({ date, key, count, future });
      }
      weeks.push(week);
    }

    // Maandlabels (linkerkant = meest recent)
    const monthLabels: { weekIdx: number; label: string }[] = [];
    let lastMonth = -1;
    weeks.forEach((week, i) => {
      const month = week[0].date.getMonth();
      if (month !== lastMonth) {
        lastMonth = month;
        monthLabels.push({ weekIdx: i, label: week[0].date.toLocaleDateString('nl-NL', { month: 'short' }) });
      }
    });

    const totalActive = Array.from(counts.values()).filter(v => v > 0).length;
    const totalWords  = Array.from(counts.values()).reduce((a, b) => a + b, 0);

    return { weeks, monthLabels, max, totalActive, totalWords };
  }, [counts]);

  return (
    <div className="glass-card rounded-xl p-5 overflow-hidden">
      {/* Header met periode-selector */}
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Activiteit</h3>
          <p className="text-xs text-muted-foreground">
            {period === 'jaar'
              ? `${heatmap.totalActive} actieve dagen • ${heatmap.totalWords} woorden`
              : `${barData.total} woorden in ${PERIOD_LABELS[period]}`}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex rounded-lg overflow-hidden border border-border shrink-0">
          {(['7d', '30d', 'jaar'] as Period[]).map(p => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 text-xs font-medium transition-colors ${
                period === p
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground bg-transparent'
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Streak banner */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-streak/10 border border-streak/20">
          <Flame className="h-5 w-5 text-streak shrink-0" />
          <div className="min-w-0">
            <p className="text-xl font-bold text-foreground leading-none">{current}</p>
            <p className="text-[10px] text-muted-foreground mt-1">huidige streak</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-lg bg-accent/10 border border-accent/20">
          <Flame className="h-5 w-5 text-accent shrink-0" />
          <div className="min-w-0">
            <p className="text-xl font-bold text-foreground leading-none">{longest}</p>
            <p className="text-[10px] text-muted-foreground mt-1">langste streak</p>
          </div>
        </div>
      </div>

      {/* ─── Staafdiagram (7d / 30d) ─── */}
      {(period === '7d' || period === '30d') && (
        <div>
          <div className="flex items-end gap-[3px] h-24">
            {barData.days.map(d => {
              const heightPct = d.count > 0 ? Math.max(6, (d.count / barData.max) * 100) : 2;
              const isToday   = d.label === 'vandaag';
              return (
                <div
                  key={d.key}
                  className="flex-1 flex flex-col justify-end group relative"
                  title={`${d.label}: ${d.count} woorden`}
                >
                  <div
                    className={`w-full rounded-t transition-all ${
                      isToday ? 'gradient-accent' : d.count > 0 ? 'gradient-primary' : 'bg-border'
                    }`}
                    style={{ height: `${heightPct}%` }}
                  />
                </div>
              );
            })}
          </div>

          {/* X-as labels: toon alleen eerste, midden en laatste */}
          <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground">
            <span className="text-accent font-medium">vandaag</span>
            {period === '30d' && (
              <span>{barData.days[14]?.date
                ? new Date(barData.days[14].key).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
                : ''}</span>
            )}
            <span>
              {barData.days[barData.days.length - 1]?.key
                ? new Date(barData.days[barData.days.length - 1].key).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
                : ''}
            </span>
          </div>
        </div>
      )}

      {/* ─── Heatmap (jaar) ─── */}
      {period === 'jaar' && (
        <>
          {/* Scroll-container: fixed hoogte, scroll naar rechts voor oudere weken */}
          <div className="w-full overflow-x-auto pb-1" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div style={{ width: `${53 * 12}px` }}>
              {/* Maandlabels */}
              <div className="flex gap-[2px] mb-1 ml-[18px]">
                {heatmap.weeks.map((_, i) => {
                  const lbl = heatmap.monthLabels.find(m => m.weekIdx === i);
                  return (
                    <div key={i} className="relative w-[10px]">
                      {lbl && (
                        <span className="absolute text-[9px] text-muted-foreground whitespace-nowrap">
                          {lbl.label}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-[2px] mt-3">
                {/* Dag-labels */}
                <div className="flex flex-col gap-[2px] mr-1 text-[9px] text-muted-foreground shrink-0">
                  {['', 'M', '', 'W', '', 'V', ''].map((d, i) => (
                    <div key={i} className="h-[10px] leading-[10px]">{d}</div>
                  ))}
                </div>

                {/* Weken — nieuwste links */}
                {heatmap.weeks.map((week, wi) => (
                  <div key={wi} className="flex flex-col gap-[2px]">
                    {week.map(cell => (
                      <div
                        key={cell.key}
                        title={`${cell.date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}: ${cell.count} woorden`}
                        className={`w-[10px] h-[10px] rounded-[2px] ${
                          cell.future ? 'bg-transparent' : intensityClass(cell.count, heatmap.max)
                        }`}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Legenda */}
          <div className="flex items-center gap-2 mt-3 text-[10px] text-muted-foreground">
            <span>recent</span>
            <div className="w-[10px] h-[10px] rounded-[2px] bg-border/40" />
            <div className="w-[10px] h-[10px] rounded-[2px] bg-primary/30" />
            <div className="w-[10px] h-[10px] rounded-[2px] bg-primary/55" />
            <div className="w-[10px] h-[10px] rounded-[2px] bg-primary/80" />
            <div className="w-[10px] h-[10px] rounded-[2px] bg-accent" />
            <span>veel</span>
            <span className="ml-auto text-muted-foreground/60">← ouder</span>
          </div>
        </>
      )}
    </div>
  );
}
