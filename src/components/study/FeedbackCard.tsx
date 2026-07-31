import { useEffect, useRef, useState } from 'react';
import { Word } from '@/types/word';
import { formatTranslationsClean, stripAnnotations } from '@/lib/translation-utils';
import { formatSeconds } from '@/lib/vocabulary';
import { Button, Data, Hairline, ItalianText } from '@/components/vocale/Primitives';
import AnswerDiff from './AnswerDiff';
import CorrectionEditor from './CorrectionEditor';

type CorrectableMode = 'mc' | 'typed_nl_it' | 'typed_it_nl' | 'listen_type';

interface FeedbackCardProps {
  word:        Word;
  /** Wat je typte of koos; leeg bij overslaan. */
  input:       string;
  mode:        CorrectableMode;
  result:      'correct' | 'almost' | 'wrong';
  /** Tijd tot de eerste toets; null bij overslaan en bij meerkeuze. */
  responseMs:  number | null;
  /** Het interval in dagen dat deze beoordeling oplevert. */
  intervalDays: number;
  corrected:   boolean;
  onSave:      (original: string, translation: string) => void;
  onMarkCorrect: () => void;
  onContinue:  () => void;
}

export default function FeedbackCard({
  word, input, mode, result, responseMs, intervalDays,
  corrected, onSave, onMarkCorrect, onContinue,
}: FeedbackCardProps) {
  const [editing, setEditing] = useState(false);
  const continueRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (editing) return;
    const timer = setTimeout(() => continueRef.current?.focus(), 300);
    return () => clearTimeout(timer);
  }, [editing]);

  // Bij IT→NL typte je het Nederlands; dan is de Italiaanse kant niet in geding.
  const typedDutch = mode === 'typed_it_nl';
  const correct = typedDutch
    ? formatTranslationsClean(word.translation)
    : stripAnnotations(word.original);

  if (editing) {
    return (
      <CorrectionEditor
        word={word}
        input={input}
        typedDutch={typedDutch}
        showUseMyAnswer={mode !== 'mc' && input.trim().length > 0}
        onCancel={() => setEditing(false)}
        onSave={(original, translation) => {
          onSave(original, translation);
          setEditing(false);
        }}
      />
    );
  }

  return (
    <>
      <h2 className="mb-5 text-[20px] font-semibold leading-[1.35] tracking-[-0.02em] text-ink">
        {verdict(result, input, correct, corrected)}
      </h2>

      <div className="rounded-card bg-card p-5">
        <div className="flex items-baseline gap-4 py-2">
          <span className="w-[42px] flex-none text-[12px] font-medium tracking-[0.02em] text-ink-weak">jij</span>
          <div className={`text-[30px] font-medium tracking-[-0.01em] ${result === 'wrong' ? 'text-ink-weak' : 'text-ink'}`}>
            <AnswerDiff input={input} correct={correct} result={result === 'correct' ? 'almost' : result} />
          </div>
        </div>

        <div className="flex items-baseline gap-4 py-2">
          <span className="w-[42px] flex-none text-[12px] font-medium tracking-[0.02em] text-ink-weak">juist</span>
          {typedDutch ? (
            <div className="text-[30px] font-medium tracking-[-0.01em] text-ink">{correct}</div>
          ) : (
            <ItalianText className="text-[34px] font-medium">{correct}</ItalianText>
          )}
        </div>

        {word.exampleSentence && (
          <>
            <Hairline className="my-[14px]" />
            <ItalianText className="block text-[19px] leading-[1.45] not-italic">
              <span className="italic">{word.exampleSentence}</span>
            </ItalianText>
          </>
        )}

        <Data className="mt-[14px] block">{consequence(result, responseMs, intervalDays)}</Data>

        {/* Na een correctie is de beoordeling opnieuw gemaakt; dat moet je kunnen zien. */}
        {corrected && (
          <Data className="mt-2 block">woord aangepast · beoordeling opnieuw gemaakt</Data>
        )}
      </div>

      {result !== 'correct' && input.trim().length > 0 && (
        <Button variant="secondary" className="mt-[22px] h-[52px] text-[16px]" onClick={onMarkCorrect}>
          Toch goed rekenen
        </Button>
      )}

      <div className="mt-[9px] flex gap-[9px]">
        <Button variant="quiet" className="w-auto flex-none px-5 text-[16px] font-medium" onClick={() => setEditing(true)}>
          Aanpassen
        </Button>
        <Button ref={continueRef} className="flex-1" onClick={onContinue}>Verder</Button>
      </div>
    </>
  );
}

/** Twee tot vijf woorden, eindigend op een punt. Die punt maakt het vlak. */
function verdict(
  result: 'correct' | 'almost' | 'wrong',
  input: string,
  correct: string,
  corrected: boolean,
): string {
  if (corrected && result === 'correct') return 'Aangepast — nu goed gerekend.';
  if (result === 'correct') return 'Goed gerekend.';
  if (result === 'wrong')   return 'Nog niet.';
  return accentsOnly(input, correct) ? 'Bijna — je mist het accent.' : 'Bijna.';
}

function consequence(
  result: 'correct' | 'almost' | 'wrong',
  responseMs: number | null,
  intervalDays: number,
): string {
  const parts: string[] = [];
  if (responseMs !== null) parts.push(formatSeconds(responseMs));
  if (result === 'wrong') {
    parts.push('telt als vergeten', 'terug in deze sessie');
  } else {
    parts.push(result === 'almost' ? 'telt als moeizaam' : 'telt als goed', `+${intervalDays} d`);
  }
  return parts.join(' · ');
}

const stripDiacritics = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function accentsOnly(input: string, correct: string): boolean {
  if (!input) return false;
  return input.toLowerCase() !== correct.toLowerCase()
    && stripDiacritics(input) === stripDiacritics(correct);
}
