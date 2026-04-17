import { useMemo } from 'react';
import { Flame } from 'lucide-react';
import type { StudySession } from '@/types/word';

interface Props {
  sessions: StudySession[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function localKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function intensityClass(count: number, max: number): string {
  if (count === 0) return 'bg-border/40';
  const ratio = count / max;
  if (ratio < 0.25) return 'bg-primary/30';
  if (ratio < 0.5) return 'bg-primary/55';
  if (ratio < 0.8) return 'bg-primary/80';
  return 'bg-accent';
}

export function ActivityHeatmap({ sessions }: Props) {
  const { weeks, monthLabels, max, totals } = useMemo(() => {
    // Build map of activity by local date
    const counts = new Map<string, number>();
    for (const s of sessions) {
      const k = localKey(new Date(s.date));
      counts.set(k, (counts.get(k) || 0) + s.wordsStudied);
    }

    // Range: 53 weeks ending today. Align so each column is a Mon-Sun week.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Find the Sunday at the end of current week (so today's column is rightmost full week)
    const dayOfWeek = today.getDay(); // 0 = Sun
    const endSaturday = new Date(today);
    endSaturday.setDate(today.getDate() + (6 - dayOfWeek));
    const totalDays = 53 * 7;
    const start = new Date(endSaturday);
    start.setDate(endSaturday.getDate() - (totalDays - 1));

    const weeks: { date: Date; key: string; count: number; future: boolean }[][] = [];
    let max = 1;
    let totalDaysActive = 0;
    let totalWords = 0;

    for (let w = 0; w < 53; w++) {
      const week: { date: Date; key: string; count: number; future: boolean }[] = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(start.getTime() + (w * 7 + d) * DAY_MS);
        const key = localKey(date);
        const count = counts.get(key) || 0;
        const future = date.getTime() > today.getTime();
        if (!future && count > 0) {
          totalDaysActive++;
          totalWords += count;
        }
        if (count > max) max = count;
        week.push({ date, key, count, future });
      }
      weeks.push(week);
    }

    // Month labels: show month name above first week of each month
    const monthLabels: { weekIdx: number; label: string }[] = [];
    let lastMonth = -1;
    weeks.forEach((week, i) => {
      const firstDay = week[0].date;
      if (firstDay.getMonth() !== lastMonth) {
        lastMonth = firstDay.getMonth();
        monthLabels.push({
          weekIdx: i,
          label: firstDay.toLocaleDateString('nl-NL', { month: 'short' }),
        });
      }
    });

    return { weeks, monthLabels, max, totals: { days: totalDaysActive, words: totalWords } };
  }, [sessions]);

  // Streak calculations
  const { current, longest } = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of sessions) {
      const k = localKey(new Date(s.date));
      counts.set(k, (counts.get(k) || 0) + s.wordsStudied);
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Current streak: count back from today (or yesterday if today empty)
    let current = 0;
    let cursor = new Date(today);
    if (!counts.has(localKey(cursor))) {
      cursor = new Date(cursor.getTime() - DAY_MS);
    }
    while (counts.has(localKey(cursor))) {
      current++;
      cursor = new Date(cursor.getTime() - DAY_MS);
    }

    // Longest streak: scan all dates with activity
    const sortedKeys = Array.from(counts.keys()).sort();
    let longest = 0;
    let run = 0;
    let prev: Date | null = null;
    for (const k of sortedKeys) {
      const [y, m, d] = k.split('-').map(Number);
      const date = new Date(y, m - 1, d);
      if (prev && (date.getTime() - prev.getTime()) === DAY_MS) {
        run++;
      } else {
        run = 1;
      }
      if (run > longest) longest = run;
      prev = date;
    }
    return { current, longest };
  }, [sessions]);

  return (
    <div className="glass-card rounded-xl p-5">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Jaaroverzicht</h3>
          <p className="text-xs text-muted-foreground">
            {totals.days} actieve dagen • {totals.words} woorden
          </p>
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

      {/* Heatmap — horizontal scroll on mobile */}
      <div className="overflow-x-auto -mx-1 px-1 pb-1">
        <div className="inline-block min-w-full">
          {/* Month labels */}
          <div className="flex gap-[2px] mb-1 ml-[18px]">
            {weeks.map((_, i) => {
              const label = monthLabels.find(m => m.weekIdx === i);
              return (
                <div key={i} className="w-[10px] text-[9px] text-muted-foreground">
                  {label ? <span className="absolute">{label.label}</span> : null}
                </div>
              );
            })}
          </div>

          <div className="flex gap-[2px]">
            {/* Day-of-week labels (Mon, Wed, Fri) */}
            <div className="flex flex-col gap-[2px] mr-1 text-[9px] text-muted-foreground">
              {['', 'M', '', 'W', '', 'V', ''].map((d, i) => (
                <div key={i} className="h-[10px] leading-[10px]">{d}</div>
              ))}
            </div>

            {/* Weeks (columns) — Sun..Sat */}
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[2px]">
                {week.map(cell => (
                  <div
                    key={cell.key}
                    title={`${cell.date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}: ${cell.count} woorden`}
                    className={`w-[10px] h-[10px] rounded-[2px] ${
                      cell.future ? 'bg-transparent' : intensityClass(cell.count, max)
                    }`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 mt-4 text-[10px] text-muted-foreground">
        <span>Minder</span>
        <div className="w-[10px] h-[10px] rounded-[2px] bg-border/40" />
        <div className="w-[10px] h-[10px] rounded-[2px] bg-primary/30" />
        <div className="w-[10px] h-[10px] rounded-[2px] bg-primary/55" />
        <div className="w-[10px] h-[10px] rounded-[2px] bg-primary/80" />
        <div className="w-[10px] h-[10px] rounded-[2px] bg-accent" />
        <span>Meer</span>
      </div>
    </div>
  );
}
