import { useEffect, useRef, useState } from 'react';
import { Word } from '@/types/word';
import { mergeTranslation } from '@/lib/translation-utils';
import { Button } from '@/components/vocale/Primitives';

/**
 * Een fout opgeslagen woord corrigeren zonder de sessie te verlaten. Na opslaan
 * wordt het lopende antwoord opnieuw beoordeeld tegen de nieuwe gegevens.
 */
export default function CorrectionEditor({
  word, input, typedDutch, showUseMyAnswer, onCancel, onSave,
}: {
  word:            Word;
  input:           string;
  typedDutch:      boolean;
  showUseMyAnswer: boolean;
  onCancel:        () => void;
  onSave:          (original: string, translation: string) => void;
}) {
  const [original, setOriginal]       = useState(word.original);
  const [translation, setTranslation] = useState(word.translation);
  const originalRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => originalRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, []);

  const useMyAnswer = () => {
    // Bij IT→NL is jouw antwoord een extra betekenis; bij NL→IT klopt de
    // opgeslagen Italiaanse spelling niet en vervangt jouw antwoord die.
    if (typedDutch) setTranslation(prev => mergeTranslation(prev, input.trim()));
    else setOriginal(input.trim());
  };

  const save = () => onSave(original.trim(), translation.trim());
  const fieldClass =
    'h-[52px] w-full rounded-card bg-paper px-[18px] text-[19px] font-medium text-ink ' +
    'caret-[#D19C1D] outline-none focus:shadow-[inset_0_0_0_2px_#D19C1D]';

  return (
    <div className="rounded-card bg-card p-5">
      <h3 className="mb-4 text-[16px] font-semibold text-ink">Woord aanpassen</h3>

      <label className="mb-[6px] block text-[12px] font-medium tracking-[0.02em] text-ink-weak">italiaans</label>
      <input
        ref={originalRef}
        value={original}
        onChange={e => setOriginal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); }}
        className={fieldClass}
      />

      <label className="mb-[6px] mt-4 block text-[12px] font-medium tracking-[0.02em] text-ink-weak">nederlands</label>
      <input
        value={translation}
        onChange={e => setTranslation(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); }}
        className={fieldClass}
      />

      {showUseMyAnswer && (
        <button
          type="button"
          onClick={useMyAnswer}
          className="mt-4 border-b border-[rgba(1,25,54,0.25)] text-left text-[14px] text-ink"
        >
          {typedDutch
            ? `Mijn antwoord toevoegen als betekenis: ${input.trim()}`
            : `Mijn antwoord overnemen: ${input.trim()}`}
        </button>
      )}

      <div className="mt-5 flex gap-[9px]">
        <Button variant="quiet" className="h-[52px] w-auto flex-none bg-paper px-5 text-[16px] font-medium" onClick={onCancel}>
          Annuleren
        </Button>
        <Button className="h-[52px] flex-1 text-[16px]" onClick={save}>Opslaan</Button>
      </div>
    </div>
  );
}
