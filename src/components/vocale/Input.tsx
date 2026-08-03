import React, { forwardRef } from 'react';

/** De accenten die het Italiaanse toetsenbord op een NL-layout niet geeft. */
const ACCENTS = ['à', 'è', 'é', 'ì', 'ò', 'ù', "'"];

export function AccentRow({ onInsert }: { onInsert: (char: string) => void }) {
  return (
    <div className="mt-[10px] flex gap-[6px]">
      {ACCENTS.map(char => (
        <button
          key={char}
          type="button"
          // De focus mag het invoerveld niet verlaten, anders klapt het toetsenbord dicht.
          onMouseDown={e => e.preventDefault()}
          onClick={() => onInsert(char)}
          className="h-10 flex-1 rounded-key bg-card text-[17px] font-medium text-ink transition-colors duration-[120ms] active:bg-[#F1F0F1]"
        >
          {char}
        </button>
      ))}
    </div>
  );
}

interface TypedInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Laat het veld 200 ms goud oplichten — het enige feedbackmoment bij goed. */
  flash?: boolean;
}

/**
 * Het invoerveld. Geist, niet de serif: wat jij typt is jouw handschrift,
 * de serif is voorbehouden aan Italiaans zoals de app het toont.
 */
export const TypedInput = forwardRef<HTMLInputElement, TypedInputProps>(
  ({ flash = false, className = '', ...props }, ref) => (
    <input
      ref={ref}
      {...props}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      className={
        `mt-4 h-16 w-full rounded-card px-5 text-[26px] font-medium tracking-[-0.01em] ` +
        `text-ink caret-[#D19C1D] outline-none placeholder:text-steel ` +
        `focus:shadow-[inset_0_0_0_2px_#D19C1D] ` +
        `${flash ? 'bg-active' : 'bg-card'} ${className}`
      }
      style={{ transition: flash ? 'background-color 200ms cubic-bezier(0.2,0,0.2,1)' : undefined }}
    />
  ),
);
TypedInput.displayName = 'TypedInput';
