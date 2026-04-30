import React, { useRef, useEffect } from 'react';
import { Word } from '@/types/word';
import { Check, X, Minus } from 'lucide-react';
import DiffHighlight from './DiffHighlight';
import AnnotationTags from './AnnotationTags';
import { formatTranslationsClean, stripAnnotations } from '@/lib/translation-utils';

type AnswerState = { result: 'correct' | 'almost' | 'wrong'; input: string };

interface ProductionCardProps {
  word:        Word;
  /** nl_it = toon NL, typ IT (standaard); it_nl = toon IT, typ NL */
  direction:   'nl_it' | 'it_nl';
  typedAnswer: string;
  onTypeAnswer: (v: string) => void;
  answerState: AnswerState | null;
  onSubmit:    () => void;
  onSkip?:     () => void;
  /** Andere Italiaanse woorden met dezelfde NL-vertaling (alleen nl_it). */
  alternatives?: string[];
}

export default function ProductionCard({
  word, direction, typedAnswer, onTypeAnswer, answerState, onSubmit, onSkip, alternatives = [],
}: ProductionCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!answerState) {
      const attempts = [50, 150, 300];
      const timers   = attempts.map(delay =>
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.focus();
            inputRef.current.click();
          }
        }, delay)
      );
      return () => timers.forEach(clearTimeout);
    }
  }, [word.id, direction, answerState]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !answerState) {
      if (typedAnswer.trim()) onSubmit();
      else if (onSkip) onSkip();
    }
  };

  const hasInput = typedAnswer.trim().length > 0;

  const prompt      = direction === 'nl_it' ? 'Vertaal naar het Italiaans' : 'Vertaal naar het Nederlands';
  const shown       = direction === 'nl_it' ? formatTranslationsClean(word.translation) : stripAnnotations(word.original);
  const shownRaw    = direction === 'nl_it' ? word.translation : word.original; // voor annotatie-tags
  const placeholder = direction === 'nl_it' ? 'Typ het Italiaanse woord...' : 'Typ de Nederlandse vertaling...';
  const correct     = direction === 'nl_it' ? word.original : formatTranslationsClean(word.translation);

  return (
    <div className="space-y-6">
      <div className="glass-card rounded-2xl p-8 text-center">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          {prompt}
        </span>
        <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-3">{shown}</h2>
        <AnnotationTags text={shownRaw} />
      </div>

      {!answerState ? (
        <div className="space-y-3">
          <input
            ref={inputRef}
            type="text"
            value={typedAnswer}
            onChange={e => onTypeAnswer(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            autoFocus
            className="w-full rounded-xl bg-card border border-border px-4 py-3.5 text-lg text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 text-center"
          />
          <button
            type="button"
            onClick={hasInput ? onSubmit : onSkip}
            className={`w-full rounded-xl px-6 py-3 text-sm font-semibold transition-opacity ${
              hasInput
                ? 'gradient-primary text-primary-foreground'
                : 'bg-destructive/10 border border-destructive/30 text-destructive hover:bg-destructive/20'
            }`}
          >
            {hasInput ? 'Controleer' : 'Ik weet het niet'}
          </button>
        </div>
      ) : (
        <ProductionFeedback
          correct={correct}
          word={word}
          direction={direction}
          answerState={answerState}
          alternatives={alternatives}
        />
      )}
    </div>
  );
}

function ProductionFeedback({
  correct, word, direction, answerState, alternatives = [],
}: {
  correct:     string;
  word:        Word;
  direction:   'nl_it' | 'it_nl';
  answerState: AnswerState;
  alternatives?: string[];
}) {
  const { result, input } = answerState;

  const feedbackConfig = {
    correct: { icon: Check, label: 'Goed!',  color: 'text-success',     bg: 'bg-success/10 border-success/30' },
    almost:  { icon: Minus, label: 'Bijna!', color: 'text-warning',     bg: 'bg-warning/10 border-warning/30' },
    wrong:   { icon: X,     label: 'Fout',   color: 'text-destructive', bg: 'bg-destructive/10 border-destructive/30' },
  }[result];

  const FeedbackIcon = feedbackConfig.icon;

  return (
    <div className="space-y-4 animate-slide-up">
      <div className={`rounded-xl border p-4 flex items-center gap-3 ${feedbackConfig.bg}`}>
        <FeedbackIcon className={`h-6 w-6 ${feedbackConfig.color}`} />
        <div>
          <p className={`font-semibold ${feedbackConfig.color}`}>{feedbackConfig.label}</p>
          {result === 'almost' ? (
            <DiffHighlight input={input} correct={direction === 'nl_it' ? word.original : correct} />
          ) : result === 'wrong' && input && (
            <p className="text-sm text-muted-foreground">
              Jouw antwoord: <span className="text-foreground">{input}</span>
            </p>
          )}
        </div>
      </div>

      <div className="glass-card rounded-xl p-4 text-center">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
          {direction === 'nl_it' ? 'Correcte spelling' : 'Correcte vertaling'}
        </p>
        <p className="text-2xl font-bold text-foreground">{correct}</p>
      </div>

      {alternatives.length > 0 && direction === 'nl_it' && (
        <div className="glass-card rounded-xl p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 text-center">
            Ook goed
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {alternatives.map(alt => (
              <span key={alt} className="px-2.5 py-1 rounded-md bg-secondary text-sm text-foreground font-medium">
                {alt}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
