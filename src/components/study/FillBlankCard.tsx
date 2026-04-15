import React, { useRef, useEffect } from 'react';
import { Word } from '@/types/word';
import { Check, X, Minus } from 'lucide-react';
import DiffHighlight from './DiffHighlight';

type AnswerState = { result: 'correct' | 'almost' | 'wrong'; input: string };

interface FillBlankCardProps {
  word: Word;
  typedAnswer: string;
  onTypeAnswer: (v: string) => void;
  answerState: AnswerState | null;
  onSubmit: () => void;
  onSkip?: () => void;
}

/** Replace the target word in the sentence with a blank */
function makeCloze(sentence: string, target: string): string {
  // Case-insensitive replace, keep surrounding text
  const regex = new RegExp(`\\b${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
  return sentence.replace(regex, '______');
}

export default function FillBlankCard({
  word, typedAnswer, onTypeAnswer, answerState, onSubmit, onSkip,
}: FillBlankCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const sentence = word.exampleSentence || '';
  const cloze = makeCloze(sentence, word.original);

  useEffect(() => {
    if (!answerState) {
      const timers = [50, 150, 300].map(d =>
        setTimeout(() => { inputRef.current?.focus(); inputRef.current?.click(); }, d)
      );
      return () => timers.forEach(clearTimeout);
    }
  }, [word.id, answerState]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !answerState) {
      if (typedAnswer.trim()) onSubmit();
      else onSkip?.();
    }
  };

  const hasInput = typedAnswer.trim().length > 0;

  return (
    <div className="space-y-6">
      <div className="glass-card rounded-2xl p-8 text-center">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          Vul het ontbrekende woord in
        </span>
        <p className="text-xl md:text-2xl font-semibold text-foreground mt-4 leading-relaxed">
          {cloze}
        </p>
        <p className="text-sm text-muted-foreground mt-3">
          Vertaling: <span className="font-medium text-foreground">{word.translation}</span>
        </p>
      </div>

      {!answerState ? (
        <div className="space-y-3">
          <input
            ref={inputRef}
            type="text"
            value={typedAnswer}
            onChange={e => onTypeAnswer(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Typ het ontbrekende woord..."
            autoFocus
            className="w-full rounded-xl bg-card border border-border px-4 py-3.5 text-lg text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 text-center"
          />
          <button
            onClick={hasInput ? onSubmit : onSkip}
            className={`w-full rounded-xl px-6 py-3 text-sm font-semibold transition-opacity ${
              hasInput
                ? 'gradient-primary text-primary-foreground disabled:opacity-40'
                : 'bg-destructive/10 border border-destructive/30 text-destructive hover:bg-destructive/20'
            }`}
          >
            {hasInput ? 'Controleer' : 'Ik weet het niet'}
          </button>
        </div>
      ) : (
        <FillBlankFeedback word={word} answerState={answerState} sentence={sentence} />
      )}
    </div>
  );
}

function FillBlankFeedback({ word, answerState, sentence }: { word: Word; answerState: AnswerState; sentence: string }) {
  const { result, input } = answerState;
  const config = {
    correct: { icon: Check, label: 'Goed!', color: 'text-success', bg: 'bg-success/10 border-success/30' },
    almost: { icon: Minus, label: 'Bijna!', color: 'text-warning', bg: 'bg-warning/10 border-warning/30' },
    wrong: { icon: X, label: 'Fout', color: 'text-destructive', bg: 'bg-destructive/10 border-destructive/30' },
  }[result];
  const Icon = config.icon;

  return (
    <div className="space-y-4 animate-slide-up">
      <div className={`rounded-xl border p-4 flex items-center gap-3 ${config.bg}`}>
        <Icon className={`h-6 w-6 ${config.color}`} />
        <div>
          <p className={`font-semibold ${config.color}`}>{config.label}</p>
          {result === 'almost' ? (
            <DiffHighlight input={input} correct={word.original} />
          ) : result === 'wrong' && input && (
            <p className="text-sm text-muted-foreground">
              Jouw antwoord: <span className="text-foreground">{input}</span>
            </p>
          )}
        </div>
      </div>
      <div className="glass-card rounded-xl p-4 text-center">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Correcte zin</p>
        <p className="text-lg font-semibold text-foreground">{sentence}</p>
        <p className="text-sm text-muted-foreground mt-2">
          Antwoord: <span className="font-bold text-foreground">{word.original}</span>
        </p>
      </div>
    </div>
  );
}
