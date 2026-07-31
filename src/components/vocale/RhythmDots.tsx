import { Data } from './Primitives';
import type { Rhythm } from '@/lib/vocabulary';

/** Ritme over veertien dagen — nadrukkelijk geen streak, geen vlam, geen freezes. */
export default function RhythmDots({ rhythm }: { rhythm: Rhythm }) {
  return (
    <div className="flex items-center gap-[6px]">
      {rhythm.days.map((studied, i) => (
        <span
          key={i}
          className={studied ? 'h-[9px] w-[9px] rounded-full bg-ink' : 'h-[7px] w-[7px] rounded-full bg-steel'}
        />
      ))}
      <Data className="ml-auto whitespace-nowrap">
        {rhythm.studied}/{rhythm.days.length}
        {rhythm.streak > 0 ? ` · ${rhythm.streak} op rij` : ' · ritme gebroken'}
      </Data>
    </div>
  );
}
