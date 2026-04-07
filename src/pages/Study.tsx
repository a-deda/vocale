import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useStore } from '@/components/StoreProvider';
import { getWordsForReview, calculateNextReview, markIntroduced, fuzzyMatch, generateMCOptions } from '@/lib/srs';
import type { ReviewRating } from '@/lib/srs';
import { Word } from '@/types/word';
import { Progress } from '@/components/ui/progress';
import IntroCard from '@/components/study/IntroCard';
import ProductionCard from '@/components/study/ProductionCard';
import FlashcardCard from '@/components/study/FlashcardCard';

type Phase = 'intro' | 'production' | 'flashcard';
type AnswerState = null | { result: 'correct' | 'almost' | 'wrong'; input: string };

export default function Study() {
  const navigate = useNavigate();
  const { words, updateWord, updateStreak, addSession } = useStore();

  // Dynamic queue: starts with due words, intro'd words get re-added for production
  const [queue, setQueue] = useState<Word[]>(() => getWordsForReview(words));
  const [initialized, setInitialized] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answerState, setAnswerState] = useState<AnswerState>(null);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [selectedMC, setSelectedMC] = useState<string | null>(null);
  const [sessionStats, setSessionStats] = useState({ correct: 0, incorrect: 0, startTime: Date.now() });
  const totalWordsRef = useRef(0);

  const currentWord = queue[currentIndex];
  const progress = queue.length > 0 ? (currentIndex / queue.length) * 100 : 0;

  // Determine phase based on word status
  const phase: Phase = useMemo(() => {
    if (!currentWord) return 'production';
    if (currentWord.status === 'new') return 'intro';
    if (currentWord.status === 'learning') return 'production';
    return 'flashcard'; // review, stable
  }, [currentWord?.id, currentWord?.status]);

  const mcOptions = useMemo(() => {
    if (!currentWord || phase !== 'intro') return [];
    return generateMCOptions(currentWord, words);
  }, [currentWord?.id, phase]);

  const moveToNext = useCallback(() => {
    setAnswerState(null);
    setTypedAnswer('');
    setSelectedMC(null);

    if (currentIndex < queue.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      totalWordsRef.current = queue.length;
      addSession({
        date: new Date().toISOString(),
        wordsStudied: queue.length,
        correct: sessionStats.correct,
        incorrect: sessionStats.incorrect,
        duration: Math.round((Date.now() - sessionStats.startTime) / 1000),
      });
      setCurrentIndex(queue.length); // triggers complete screen
    }
  }, [currentIndex, queue.length, addSession, sessionStats]);

  // INTRO: after MC answer, mark introduced and re-add to queue for production
  const handleMCAnswer = useCallback((selected: string) => {
    if (!currentWord || selectedMC !== null) return;
    setSelectedMC(selected);

    setTimeout(async () => {
      const updates = markIntroduced(currentWord);
      await updateWord(currentWord.id, updates);

      // Re-add word to end of queue as 'learning' for production phase
      setQueue(prev => [
        ...prev,
        { ...currentWord, ...updates } as Word,
      ]);

      moveToNext();
    }, 1200);
  }, [currentWord, selectedMC, updateWord, moveToNext]);

  // PRODUCTION: submit typed answer, auto-rate after delay
  const handleSubmitAnswer = useCallback(() => {
    if (!currentWord || !typedAnswer.trim()) return;
    const result = fuzzyMatch(typedAnswer, currentWord.original);
    setAnswerState({ result, input: typedAnswer });

    // Map fuzzy result to SRS rating
    const ratingMap: Record<string, ReviewRating> = {
      correct: 'good',
      almost: 'almost',
      wrong: 'wrong',
    };

    setTimeout(async () => {
      const rating = ratingMap[result];
      const updates = calculateNextReview(currentWord, rating);
      await updateWord(currentWord.id, updates);
      await updateStreak();

      setSessionStats(prev => ({
        ...prev,
        correct: result === 'correct' ? prev.correct + 1 : prev.correct,
        incorrect: result !== 'correct' ? prev.incorrect + 1 : prev.incorrect,
      }));

      moveToNext();
    }, 1500);
  }, [currentWord, typedAnswer, updateWord, updateStreak, moveToNext]);

  // FLASHCARD: manual rating
  const handleFlashcardRate = useCallback(async (rating: ReviewRating) => {
    if (!currentWord) return;
    const updates = calculateNextReview(currentWord, rating);
    await updateWord(currentWord.id, updates);
    await updateStreak();

    setSessionStats(prev => ({
      ...prev,
      correct: (rating === 'good' || rating === 'easy') ? prev.correct + 1 : prev.correct,
      incorrect: (rating !== 'good' && rating !== 'easy') ? prev.incorrect + 1 : prev.incorrect,
    }));

    moveToNext();
  }, [currentWord, updateWord, updateStreak, moveToNext]);

  // Empty state
  if (queue.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-slide-up">
        <div className="text-6xl mb-4">🎉</div>
        <h2 className="text-2xl font-bold text-foreground">Alles bijgewerkt!</h2>
        <p className="text-muted-foreground mt-2">Geen woorden klaar voor herhaling. Kom later terug.</p>
        <button onClick={() => navigate('/')} className="mt-6 gradient-primary rounded-lg px-6 py-2.5 text-sm font-semibold text-primary-foreground">
          Terug naar Dashboard
        </button>
      </div>
    );
  }

  // Session complete
  if (currentIndex >= queue.length) {
    const totalTime = Math.round((Date.now() - sessionStats.startTime) / 1000);
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-slide-up">
        <div className="text-6xl mb-4">⚡</div>
        <h2 className="text-2xl font-bold text-foreground">Sessie Voltooid!</h2>
        <div className="grid grid-cols-3 gap-4 mt-6 w-full max-w-sm">
          <div className="glass-card rounded-xl p-4">
            <p className="text-2xl font-bold text-foreground">{totalWordsRef.current}</p>
            <p className="text-[10px] text-muted-foreground uppercase">Woorden</p>
          </div>
          <div className="glass-card rounded-xl p-4">
            <p className="text-2xl font-bold text-success">{sessionStats.correct}</p>
            <p className="text-[10px] text-muted-foreground uppercase">Goed</p>
          </div>
          <div className="glass-card rounded-xl p-4">
            <p className="text-2xl font-bold text-foreground">{Math.floor(totalTime / 60)}:{String(totalTime % 60).padStart(2, '0')}</p>
            <p className="text-[10px] text-muted-foreground uppercase">Tijd</p>
          </div>
        </div>
        <button onClick={() => navigate('/')} className="mt-6 gradient-primary rounded-lg px-6 py-2.5 text-sm font-semibold text-primary-foreground">
          Terug naar Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto animate-slide-up">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => navigate('/')} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-2 py-0.5 rounded-full bg-secondary">
            {phase === 'intro' ? 'Introductie' : phase === 'production' ? 'Productie' : 'Flashcard'}
          </span>
          <span className="text-lg font-bold text-foreground">{currentIndex + 1}</span>
          <span className="text-muted-foreground"> / {queue.length}</span>
        </div>
      </div>
      <Progress value={progress} className="h-1.5 mb-6 bg-border" />

      {phase === 'intro' ? (
        <IntroCard
          word={currentWord}
          options={mcOptions}
          selected={selectedMC}
          onSelect={handleMCAnswer}
        />
      ) : phase === 'production' ? (
        <ProductionCard
          word={currentWord}
          typedAnswer={typedAnswer}
          onTypeAnswer={setTypedAnswer}
          answerState={answerState}
          onSubmit={handleSubmitAnswer}
        />
      ) : (
        <FlashcardCard
          word={currentWord}
          onRate={handleFlashcardRate}
        />
      )}
    </div>
  );
}
