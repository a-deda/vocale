import { Word } from '@/types/word';
import { stripAnnotations } from '@/lib/translation-utils';
import { ItalianText, TextAction } from '@/components/vocale/Primitives';
import PromptCard from './PromptCard';

interface IntroCardProps {
  word:     Word;
  options:  string[];
  selected: string | null;
  correct:  string;
  onSelect: (option: string) => void;
  onEdit:   () => void;
}

/** Meerkeuze — uitsluitend een kennismakingsvorm. Daarna wordt dit woord getypt. */
export default function IntroCard({
  word, options, selected, correct, onSelect, onEdit,
}: IntroCardProps) {
  return (
    <>
      <PromptCard label="nieuw woord">
        <ItalianText className="text-[38px] font-medium leading-[1.1]">
          {stripAnnotations(word.original)}
        </ItalianText>
      </PromptCard>

      <div className="mb-[10px] mt-[22px] text-[15px] text-ink-weak">Wat betekent dit woord?</div>

      <div className="flex flex-col gap-[9px]">
        {options.map(option => {
          const chosen = selected === option;
          const isRight = option === correct;

          // Na een keuze kleurt alleen wat betekenis draagt: het juiste antwoord
          // goud, jouw misser tangerine. De rest blijft gewoon papier.
          let tone = 'bg-card text-ink';
          if (selected !== null && isRight)         tone = 'bg-active text-ink';
          else if (selected !== null && chosen)     tone = 'bg-lapsed text-white';
          else if (selected !== null)               tone = 'bg-card text-ink-weak';

          return (
            <button
              key={option}
              disabled={selected !== null}
              onClick={() => onSelect(option)}
              className={`rounded-card px-5 py-[17px] text-left text-[17px] font-medium transition-colors duration-[120ms] ${tone}`}
            >
              {option}
            </button>
          );
        })}
      </div>

      <div className="mt-[22px] text-center">
        <TextAction onClick={onEdit}>woord aanpassen</TextAction>
      </div>
    </>
  );
}
