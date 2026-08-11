import { useEffect } from 'react';
import { Data, ItalianText, Label } from './Primitives';
import { dayTitle } from '@/lib/vocabulary';
import type { DecayDay } from '@/lib/vocabulary';

/**
 * Eén dag uit de vervalstrook, uitgeklapt. De staven zijn te smal om aan te
 * wijzen, dus het blad is de plek waar je een dag daadwerkelijk leest — en
 * waar je met twee grote knoppen langs de dagen loopt in plaats van te mikken.
 */
export default function DaySheet({
  days, index, limit, today, onIndex, onClose,
}: {
  days:    DecayDay[];
  index:   number;
  limit:   number;
  today:   string;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const day  = days[index];
  const over = day.count - limit;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape')     onClose();
      if (e.key === 'ArrowLeft'  && index > 0)               onIndex(index - 1);
      if (e.key === 'ArrowRight' && index < days.length - 1) onIndex(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, days.length, onIndex, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Sluiten"
        onClick={onClose}
        className="absolute inset-0 bg-[rgba(1,25,54,0.25)]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={dayTitle(day.date, today)}
        className="relative w-full max-w-[420px] rounded-t-card bg-card px-5 pt-4"
        style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto mb-4 h-1 w-[38px] rounded-full bg-[#DCD9D9]" />

        <div className="flex items-baseline justify-between">
          <span className="text-[23px] font-bold tracking-[-0.025em] text-ink">
            {dayTitle(day.date, today)}
          </span>
          <Data>{day.count === 1 ? '1 woord' : `${day.count} woorden`}</Data>
        </div>
        {over > 0 && (
          <p className="mt-1 text-[13.5px] text-ink-weak">{over} meer dan één sessie.</p>
        )}

        {day.words.length === 0 ? (
          <p className="py-7 text-[15px] text-ink-weak">Deze dag is leeg.</p>
        ) : (
          <>
            <Label className="mt-4">zwakste eerst</Label>
            <div className="mt-1 max-h-[240px] overflow-y-auto">
              {day.words.map((word, i) => (
                <div
                  key={word.id}
                  className={
                    `flex items-baseline justify-between py-[11px] ` +
                    `${i < day.words.length - 1 ? 'border-b border-[rgba(139,158,183,0.45)]' : ''}`
                  }
                >
                  <ItalianText className="text-[19px]">{word.original}</ItalianText>
                  <Data>{Math.round(word.stability)} d</Data>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="mt-3 flex justify-between border-t border-[rgba(1,25,54,0.1)] pt-3">
          <Step onClick={() => onIndex(index - 1)} disabled={index === 0}>
            ← {index > 0 ? short(days[index - 1], index - 1) : ''}
          </Step>
          <Step onClick={() => onIndex(index + 1)} disabled={index === days.length - 1}>
            {index < days.length - 1 ? short(days[index + 1], index + 1) : ''} →
          </Step>
        </div>
      </div>
    </div>
  );
}

/** Buurdag in de knop: `vandaag`, `morgen`, anders de weekdag met zijn datum. */
function short(day: DecayDay, index: number): string {
  if (index === 0) return 'vandaag';
  if (index === 1) return 'morgen';
  return `${day.label} ${Number(day.date.slice(8))}`;
}

function Step({
  onClick, disabled, children,
}: { onClick: () => void; disabled: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="min-h-[44px] min-w-[44px] px-1 text-left text-[14px] text-ink-weak disabled:opacity-0"
    >
      {children}
    </button>
  );
}
