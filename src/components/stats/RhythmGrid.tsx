import type { Rhythm } from '@/lib/vocabulary';

/**
 * Het ritme over een kwartaal: negentig stippen, tien per rij.
 *
 * Bewust een ander beeld dan de veertien stippen op het overzicht. Die staan op
 * één regel en zijn te tellen; negentig op een rij zou een streepjescode worden.
 * Als raster is de vorm van je gewoonte in één blik te zien — een gat van een
 * week is een gat, geen onderbreking in een lijn.
 *
 * Geen vlam, geen langste reeks, geen freezes: alleen welke dagen gevuld zijn.
 */
export default function RhythmGrid({ rhythm }: { rhythm: Rhythm }) {
  return (
    <div className="grid w-full grid-cols-10 gap-[6px]">
      {rhythm.days.map((studied, i) => (
        <span
          key={i}
          className={`aspect-square rounded-full ${studied ? 'bg-ink' : 'bg-steel/40'}`}
        />
      ))}
    </div>
  );
}
