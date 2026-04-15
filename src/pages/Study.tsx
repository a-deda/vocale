import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useStore } from '@/components/StoreProvider';
import { getWordsForReview, calculateNextReview, markIntroduced, fuzzyMatch, generateMCOptions, pickExerciseType, adjustRatingBySpeed } from '@/lib/srs';
import type { ReviewRating, ExerciseType } from '@/lib/srs';
import { Word } from '@/types/word';
import { Progress } from '@/components/ui/progress';
import IntroCard from '@/components/study/IntroCard';
import ProductionCard from '@/components/study/ProductionCard';
import FlashcardCard from '@/components/study/FlashcardCard';
import ListeningCard from '@/components/study/ListeningCard';
import FillBlankCard from '@/components/study/FillBlankCard';

type AnswerState = null | { result: 'correct' | 'almost' | 'wrong'; input: string };

const EXERCISE_LABELS: Record<ExerciseType, string> = {
  mc: 'Multiple Choice',
  production: 'Productie',
  listening: 'Luisteren',
  fillblank: 'Zin aanvullen',
  flashcard: 'Flashcard',
};

export default function Study() {
  const navigate = useNavigate();
  const { words, updateWord, updateStreak, addSession } = useStore();

  const [queue, setQueue] = useState<Word[]>(() => getWordsForReview(words));
  const [initialized, setInitialized] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answerState, setAnswerState] = useState<AnswerState>(null);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [selectedMC, setSelectedMC] = useState<string | null>(null);
  const [sessionStats, setSessionStats] = useState({ correct: 0, incorrect: 0, startTime: Date.now() });
  const totalWordsRef = useRef(0);
  const cardStartTimeRef = useRef(Date.now());
  // Store the exercise type per word to keep it stable during the card lifecycle
  const [exerciseTypeOverride, setExerciseTypeOverride] = useState<ExerciseType | null>(null);

  // Refs to avoid stale closures in setTimeout callbacks
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const sessionStatsRef = useRef(sessionStats);
  sessionStatsRef.current = sessionStats;

  useEffect(() => {
    if (!initialized && words.length > 0) {
      const reviewWords = getWordsForReview(words);
      setQueue(reviewWords);
      setInitialized(true);
    }
  }, [words, initialized]);

  const currentWord = queue[currentIndex];

  const exerciseType: ExerciseType = useMemo(() => {
    if (!currentWord) return 'production';
    if (exerciseTypeOverride) return exerciseTypeOverride;
    return pickExerciseType(currentWord);
  }, [currentWord?.id, currentWord?.status, currentWord?.consecutiveErrors, exerciseTypeOverride]);

  // Store exercise type and reset timer when word changes
  useEffect(() => {
    if (currentWord) {
      setExerciseTypeOverride(pickExerciseType(currentWord));
      cardStartTimeRef.current = Date.now();
    }
  }, [currentWord?.id]);

  const progress = queue.length > 0 ? (currentIndex / queue.length) * 100 : 0;

  const mcOptions = useMemo(() => {
    if (!currentWord || exerciseType !== 'mc') return [];
    return generateMCOptions(currentWord, words);
  }, [currentWord?.id, exerciseType]);

  const moveToNext = useCallback(() => {
    setAnswerState(null);
    setTypedAnswer('');
    setSelectedMC(null);

    const idx = currentIndexRef.current;
    const q = queueRef.current;

    if (idx < q.length - 1) {
      const nextWord = q[idx + 1];
      setExerciseTypeOverride(nextWord ? pickExerciseType(nextWord) : null);
      setCurrentIndex(idx + 1);
    } else {
      setExerciseTypeOverride(null);
      totalWordsRef.current = q.length;
      addSession({
        date: new Date().toISOString(),
        wordsStudied: q.length,
        correct: sessionStatsRef.current.correct,
        incorrect: sessionStatsRef.current.incorrect,
        duration: Math.round((Date.now() - sessionStatsRef.current.startTime) / 1000),
      });
      setCurrentIndex(q.length);
    }
  }, [addSession]);

  // MC answer handler (for intro + fallback)
  const handleMCAnswer = useCallback((selected: string) => {
    if (!currentWord || selectedMC !== null) return;
    setSelectedMC(selected);

    setTimeout(async () => {
      if (currentWord.status === 'new') {
        // Intro: mark introduced, re-add for production
        const updates = markIntroduced(currentWord);
        await updateWord(currentWord.id, updates);
        setQueue(prev => [...prev, { ...currentWord, ...updates } as Word]);
      } else {
        // Fallback MC after errors: reset consecutiveErrors on correct
        const isCorrect = selected === currentWord.translation;
        const updates: Partial<Word> = { consecutiveErrors: isCorrect ? 0 : (currentWord.consecutiveErrors ?? 0) + 1 };
        await updateWord(currentWord.id, updates);

        setSessionStats(prev => ({
          ...prev,
          correct: isCorrect ? prev.correct + 1 : prev.correct,
          incorrect: !isCorrect ? prev.incorrect + 1 : prev.incorrect,
        }));
      }
      moveToNext();
    }, 1200);
  }, [currentWord, selectedMC, updateWord, moveToNext]);

  // Typed answer handler (production, listening, fillblank)
  const handleSubmitAnswer = useCallback(() => {
    if (!currentWord || !typedAnswer.trim()) return;
    const result = fuzzyMatch(typedAnswer, currentWord.original);
    setAnswerState({ result, input: typedAnswer });

    const responseTimeMs = Date.now() - cardStartTimeRef.current;

    const ratingMap: Record<string, ReviewRating> = {
      correct: 'good',
      almost: 'almost',
      wrong: 'wrong',
    };

    setTimeout(async () => {
      const baseRating = ratingMap[result];
      const rating = adjustRatingBySpeed(baseRating, responseTimeMs, currentWord);
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

  // Skip handler
  const handleSkip = useCallback(() => {
    if (!currentWord) return;
    setAnswerState({ result: 'wrong', input: '' });

    setTimeout(async () => {
      const updates = calculateNextReview(currentWord, 'wrong');
      await updateWord(currentWord.id, updates);
      await updateStreak();

      setSessionStats(prev => ({ ...prev, incorrect: prev.incorrect + 1 }));
      moveToNext();
    }, 1500);
  }, [currentWord, updateWord, updateStreak, moveToNext]);

  // Flashcard self-rate handler
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
            {EXERCISE_LABELS[exerciseType]}
          </span>
          <span className="text-lg font-bold text-foreground">{currentIndex + 1}</span>
          <span className="text-muted-foreground"> / {queue.length}</span>
        </div>
      </div>
      <Progress value={progress} className="h-1.5 mb-6 bg-border" />

      {exerciseType === 'mc' ? (
        <IntroCard
          word={currentWord}
          options={mcOptions}
          selected={selectedMC}
          onSelect={handleMCAnswer}
        />
      ) : exerciseType === 'production' ? (
        <ProductionCard
          word={currentWord}
          typedAnswer={typedAnswer}
          onTypeAnswer={setTypedAnswer}
          answerState={answerState}
          onSubmit={handleSubmitAnswer}
          onSkip={handleSkip}
        />
      ) : exerciseType === 'listening' ? (
        <ListeningCard
          word={currentWord}
          typedAnswer={typedAnswer}
          onTypeAnswer={setTypedAnswer}
          answerState={answerState}
          onSubmit={handleSubmitAnswer}
          onSkip={handleSkip}
        />
      ) : exerciseType === 'fillblank' ? (
        <FillBlankCard
          word={currentWord}
          typedAnswer={typedAnswer}
          onTypeAnswer={setTypedAnswer}
          answerState={answerState}
          onSubmit={handleSubmitAnswer}
          onSkip={handleSkip}
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
