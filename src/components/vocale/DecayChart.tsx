import { useRef } from 'react';
import { Data, Label } from './Primitives';
import type { DecayDay } from '@/lib/vocabulary';

/**
 * De vervalstrook: veertien dagen, vaste schaal, één lijn op de sessiegrootte.
 *
 * De schaal loopt tot anderhalve sessie, dus de lijn ligt op tweederde hoogte en
 * dezelfde hoogte betekent morgen hetzelfde als vandaag. Een meebewegende schaal
 * zou dat verband breken: dan is een rustige week net zo hoog als een volle.
 * Wat boven de schaal uitkomt — een achterstand na een week weg — krijgt een
 * driehoekje in plaats van een staaf die de rest plat drukt.
 *
 * Twee kleuren, allebei al in gebruik: inkt voor een dag die in één sessie past,
 * rood voor een dag die dat niet doet. Goud blijft van de knop — anders zou
 * dezelfde kleur hier iets anders betekenen dan in de toestandsbalk.
 */

const PLOT_HEIGHT = 110;

/** De lijn ligt op de sessiegrootte; de schaal loopt tot anderhalve sessie. */
const LINE = '66.667%';

interface DecayChartProps {
  days:  DecayDay[];
  /** De sessiegrootte: één sessie is de lijn waar een dag onder hoort te blijven. */
  limit: number;
  /** Vervangt de piekdag rechtsonder wanneer er een achterstand ligt. */
  note?: string;
  onPickDay: (index: number) => void;
}

export default function DecayChart({ days, limit, note, onPickDay }: DecayChartProps) {
  const barsRef = useRef<HTMLDivElement>(null);

  const total = days.reduce((sum, day) => sum + day.count, 0);
  if (total === 0) return null;

  // De piek gaat over de dagen die nog komen; die van vandaag staat al als
  // kopgetal boven de grafiek.
  const peak = days.reduce(
    (best, day, i) => (i > 0 && day.count > best.count ? { i, count: day.count } : best),
    { i: 0, count: 0 },
  );
  const scale = Math.round(limit * 1.5);

  /**
   * Eén staaf is ~19 px breed, ver onder de 44 px die een raakdoel nodig heeft.
   * Daarom is de hele grafiek het doel en bepaalt de x-positie welke dag opengaat;
   * via het toetsenbord (geen positie) is dat de zwaarste dag die nog komt.
   */
  const pick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = barsRef.current?.getBoundingClientRect();
    if (event.detail === 0 || !rect || rect.width === 0) {
      onPickDay(peak.count > 0 ? peak.i : 0);
      return;
    }
    const ratio = (event.clientX - rect.left) / rect.width;
    onPickDay(Math.min(days.length - 1, Math.max(0, Math.floor(ratio * days.length))));
  };

  return (
    <div>
      <Label className="mb-[9px]">wat er vervalt · lijn is één sessie</Label>

      <button type="button" onClick={pick} aria-label="Toon een dag" className="block w-full text-left">
        <div className="relative" style={{ height: PLOT_HEIGHT }}>
          <div className="absolute inset-x-0 border-t border-dashed border-steel" style={{ bottom: LINE }} />
          <div ref={barsRef} className="relative flex h-full items-end gap-[3px]">
            {days.map((day, i) => (
              <Bar key={day.date} count={day.count} limit={limit} scale={scale} today={i === 0} />
            ))}
          </div>
          <span
            className="absolute right-0 z-10 mb-[-8px] bg-paper px-1 font-mono text-[10px] text-ink-weak"
            style={{ bottom: LINE }}
          >
            {limit}
          </span>
        </div>

        <div className="mt-2 flex gap-[3px]">
          {days.map((day, i) => (
            <span
              key={day.date}
              className={
                `min-w-0 flex-1 text-center font-mono text-[10px] ` +
                `${i === 0 ? 'font-medium text-ink' : 'text-ink-weak'}`
              }
            >
              {day.label}
            </span>
          ))}
        </div>
      </button>

      <div className="mt-3 flex justify-between border-t border-[rgba(1,25,54,0.09)] pt-[10px]">
        <Data className="text-[11px]">{total} in {days.length} dagen</Data>
        {note
          ? <Data className="text-[11px]">{note}</Data>
          : peak.count > 0 && (
            <Data className="text-[11px]">
              piek {days[peak.i].label} {Number(days[peak.i].date.slice(8))} · {peak.count}
            </Data>
          )}
      </div>
    </div>
  );
}

function Bar({
  count, limit, scale, today,
}: { count: number; limit: number; scale: number; today: boolean }) {
  const above = count > limit;
  return (
    <span
      className="relative block min-h-[2px] min-w-0 flex-1 rounded-t-[3px]"
      style={{
        height:     `${(Math.min(count, scale) / scale) * 100}%`,
        background: above ? 'var(--lapsed)' : 'var(--ink)',
        // Vandaag draagt de actie, dus die staat vol; de rest is context. Een dag
        // boven de lijn staat altijd vol — die is geen context meer.
        opacity: above || today ? 1 : 0.45,
      }}
    >
      {count > scale && (
        <span
          aria-hidden
          className="absolute left-1/2 top-[-7px] h-0 w-0 -translate-x-1/2"
          style={{
            borderLeft:   '4px solid transparent',
            borderRight:  '4px solid transparent',
            borderBottom: '5px solid var(--lapsed)',
          }}
        />
      )}
    </span>
  );
}
