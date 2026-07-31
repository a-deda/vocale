import { Data } from './Primitives';
import type { StateCounts } from '@/lib/vocabulary';

/**
 * De toestandsbalk — het enige diagram op het overzicht. Vier vlakken die
 * samen de hele woordenschat dekken; de breedte is het aantal woorden.
 * Kleur codeert toestand, niets anders.
 */
const SEGMENTS = [
  { key: 'lapsed',   label: 'wankel', bg: 'bg-lapsed',   fg: 'text-white' },
  { key: 'active',   label: 'actief', bg: 'bg-active',   fg: 'text-ink'   },
  { key: 'anchored', label: 'vast',   bg: 'bg-ink',      fg: 'text-white' },
  { key: 'new',      label: 'nieuw',  bg: 'bg-steel',    fg: 'text-ink'   },
] as const;

export default function StateBar({ counts }: { counts: StateCounts }) {
  const present = SEGMENTS.filter(s => counts[s.key] > 0);
  if (present.length === 0) return null;

  const anchoredShare = counts.total > 0 ? Math.round((counts.anchored / counts.total) * 100) : 0;

  return (
    <div>
      <div className="flex h-[68px] gap-[3px]">
        {present.map((segment, i) => (
          <div
            key={segment.key}
            className={
              `flex min-w-[36px] items-end overflow-hidden px-[9px] py-2 ` +
              `font-mono text-[11.5px] ${segment.bg} ${segment.fg} ` +
              `${i === 0 ? 'rounded-l-[5px]' : ''} ${i === present.length - 1 ? 'rounded-r-[5px]' : ''}`
            }
            style={{ flex: counts[segment.key] }}
          >
            {counts[segment.key]}
          </div>
        ))}
      </div>
      <div className="mt-[9px] flex justify-between">
        <Data className="text-[11px]">{present[0].label}</Data>
        <Data className="text-[11px]">{anchoredShare}% vast · {counts.total} woorden</Data>
      </div>
    </div>
  );
}
