import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/components/StoreProvider';
import {
  ANCHOR_DAYS, GRADE, FSRS_MODES, buildSession,
  emptyFsrsState, gradeForAnswer, intervalText, previewInterval, reviewCard,
} from '@/lib/fsrs';
import type { FsrsGrade, FsrsMode, FsrsState, QueueItem } from '@/lib/fsrs';
import { fuzzyMatch, fuzzyMatchWithAlternatives, generateMCOptions } from '@/lib/srs';
import { findSynonymOriginals } from '@/lib/synonyms';
import { splitTranslations, stripAnnotations } from '@/lib/translation-utils';
import { buildOverview, countStates } from '@/lib/vocabulary';
import { localDateKey } from '@/lib/store';
import { Word } from '@/types/word';
import { Screen, ScreenHeader, SessionHeader } from '@/components/vocale/Primitives';
import ProductionCard from '@/components/study/ProductionCard';
import ListeningCard from '@/components/study/ListeningCard';
import IntroCard from '@/components/study/IntroCard';
import FeedbackCard from '@/components/study/FeedbackCard';
import CorrectionEditor from '@/components/study/CorrectionEditor';
import SessionEnd from '@/components/study/SessionEnd';
import type { SessionTally } from '@/components/study/SessionEnd';

type MatchResult = 'correct' | 'almost' | 'wrong';
type QueuedWord  = QueueItem & { word: Word };

/** Minimaal aantal kaarten tussen een kennismaking en de getypte herhaling. */
const MIN_SPACING = 3;
/**
 * Hoe lang een goed antwoord blijft staan. Ruimer dan de kale flits vroeg,
 * want het briefje met het volgende interval moet leesbaar zijn.
 */
const FLASH_MS = 900;

export default function Study() {
  const navigate = useNavigate();
  const {
    words, stats, sessions, fsrsStates, reviewLogs,
    upsertFsrsState, addReviewLog, updateStreak, addSession, updateWord,
  } = useStore();

  const today = localDateKey();

  // ─── Wachtrij ───────────────────────────────────────────────────────────
  const [queue, setQueue]               = useState<QueuedWord[]>([]);
  const [initialized, setInitialized]   = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (initialized || words.length === 0) return;

    const allCardStates: Record<string, Partial<Record<FsrsMode, FsrsState>>> = {};
    for (const w of words) allCardStates[w.id] = fsrsStates[w.id] ?? {};

    const wordMap = new Map(words.map(w => [w.id, w]));
    const resolved = buildSession(allCardStates, today, stats.dailyGoal)
      .map(item => {
        const word = wordMap.get(item.cardId);
        return word ? { ...item, word } : null;
      })
      .filter((x): x is QueuedWord => x !== null);

    setQueue(resolved);
    setInitialized(true);
  }, [words, fsrsStates, initialized, today, stats.dailyGoal]);

  // ─── UI-state ───────────────────────────────────────────────────────────
  const [typedAnswer, setTypedAnswer] = useState('');
  const [selectedMC, setSelectedMC]   = useState<string | null>(null);
  const [flash, setFlash]             = useState(false);
  /** "over 3 weken" — staat op het veld zolang de flits duurt. */
  const [intervalNote, setIntervalNote] = useState<string | null>(null);
  const [editOpen, setEditOpen]       = useState(false);

  /** Gepauzeerd feedbackscherm: de beoordeling wordt pas bij 'Verder' weggeschreven. */
  const [pending, setPending] = useState<{
    item:       QueuedWord;
    usedMode:   FsrsMode;
    kind:       'mc' | 'typed';
    input:      string;
    result:     MatchResult;
    responseMs: number | null;
  } | null>(null);
  const [corrected, setCorrected] = useState(false);

  const [pendingPool, setPendingPool] = useState<{ item: QueuedWord; addedAtIndex: number }[]>([]);

  const cardStartTimeRef = useRef(Date.now());
  const sessionStartRef  = useRef(Date.now());
  const currentIndexRef  = useRef(currentIndex);
  const queueRef         = useRef(queue);
  const pendingPoolRef   = useRef(pendingPool);
  const retriedCardsRef  = useRef(new Set<string>());
  /** Per uniek woord het laatste resultaat, zodat de sessietellers op elkaar kloppen. */
  const wordResultsRef   = useRef(new Map<string, boolean>());
  const sessionSavedRef  = useRef(false);

  /** Wat deze sessie opleverde; de eindkaart leest hieruit. */
  const tallyRef = useRef<{ anchored: string[]; almost: number; responseTimes: number[] }>({
    anchored: [], almost: 0, responseTimes: [],
  });
  const [tally, setTally] = useState<SessionTally | null>(null);

  /** Hoeveel woorden er wankel stonden toen de sessie begon. */
  const lapsedBeforeRef = useRef<number | null>(null);
  useEffect(() => {
    if (lapsedBeforeRef.current === null && words.length > 0) {
      lapsedBeforeRef.current = countStates(words, fsrsStates, today).lapsed;
    }
  }, [words, fsrsStates, today]);

  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { queueRef.current        = queue;        }, [queue]);
  useEffect(() => { pendingPoolRef.current  = pendingPool;  }, [pendingPool]);

  // ─── Luisteren tijdelijk uit ────────────────────────────────────────────
  const [listeningMutedUntil, setListeningMutedUntil] = useState<number | null>(() => {
    const stored = sessionStorage.getItem('listeningMutedUntil');
    if (!stored) return null;
    const until = parseInt(stored, 10);
    return until > Date.now() ? until : null;
  });
  const isListeningMuted = listeningMutedUntil !== null && listeningMutedUntil > Date.now();

  const muteListening = useCallback(() => {
    const until = Date.now() + 30 * 60 * 1000;
    setListeningMutedUntil(until);
    sessionStorage.setItem('listeningMutedUntil', String(until));
  }, []);

  /** Is luisteren gedempt, wijk dan uit naar meerkeuze — niet naar typen. */
  const effectiveMode = useCallback((item: QueuedWord): FsrsMode =>
    item.mode === 'listen_type' && isListeningMuted ? 'mc' : item.mode,
  [isListeningMuted]);

  const currentItem = queue[currentIndex];
  const mode: FsrsMode = currentItem ? effectiveMode(currentItem) : 'typed_nl_it';

  useEffect(() => {
    if (currentItem) cardStartTimeRef.current = Date.now();
  }, [currentItem?.cardId, mode]);

  // ─── Betekenis en opties per kaart ──────────────────────────────────────
  const activeMeaning = useMemo(() => {
    if (!currentItem) return '';
    const parts = splitTranslations(currentItem.word.translation);
    return parts.length <= 1 ? currentItem.word.translation : parts[Math.floor(Math.random() * parts.length)];
  }, [currentItem?.cardId, currentItem?.mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeMeaningRef = useRef(activeMeaning);
  useEffect(() => { activeMeaningRef.current = activeMeaning; }, [activeMeaning]);

  const mcOptions = useMemo(() => {
    if (!currentItem || mode !== 'mc') return [];
    return generateMCOptions({ ...currentItem.word, translation: activeMeaning }, words);
  }, [currentItem?.cardId, mode, words, activeMeaning]);

  // ─── Wegschrijven ───────────────────────────────────────────────────────

  const persistReview = useCallback(async (
    item: QueuedWord, grade: number, usedMode: FsrsMode, responseMs: number | null,
  ) => {
    const existing = fsrsStates[item.cardId]?.[usedMode] ?? emptyFsrsState();
    const { newState, logPartial } = reviewCard(existing, grade, today);

    // Een woord dat nu pas de verankerdrempel passeert, telt als vast geworden.
    if ((existing.stability ?? 0) < ANCHOR_DAYS && (newState.stability ?? 0) >= ANCHOR_DAYS) {
      tallyRef.current.anchored.push(stripAnnotations(item.word.original));
    }

    await upsertFsrsState(item.cardId, usedMode, newState);
    await addReviewLog({ ...logPartial, cardId: item.cardId, mode: usedMode, responseMs });
    await updateStreak();

    const allStates = { ...(fsrsStates[item.cardId] ?? {}), [usedMode]: newState };
    const maxStability = Math.max(0, ...FSRS_MODES.map(m => allStates[m]?.stability ?? 0));
    const newStatus: Word['status'] =
      maxStability >= 21 ? 'stable' :
      maxStability >= 7  ? 'review' :
      maxStability > 0   ? 'learning' : 'new';

    await updateWord(item.cardId, {
      status: newStatus,
      lastReview: newState.lastReviewedAt ?? undefined,
      consecutiveErrors: grade === GRADE.FORGOT ? (item.word.consecutiveErrors ?? 0) + 1 : 0,
    });
  }, [fsrsStates, today, upsertFsrsState, addReviewLog, updateStreak, updateWord]);

  const saveSession = useCallback(() => {
    if (sessionSavedRef.current) return null;

    const results = wordResultsRef.current;
    if (results.size === 0) return null;

    sessionSavedRef.current = true;
    const correct = [...results.values()].filter(Boolean).length;

    void addSession({
      date:         new Date().toISOString(),
      wordsStudied: results.size,
      correct,
      incorrect:    results.size - correct,
      duration:     Math.round((Date.now() - sessionStartRef.current) / 1000),
    });

    const { anchored, almost, responseTimes } = tallyRef.current;
    return {
      words:    results.size,
      anchored,
      almost,
      avgResponseMs: responseTimes.length > 0
        ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
        : null,
    };
  }, [addSession]);

  // Stopt de gebruiker halverwege, dan telt die sessie nog steeds mee.
  useEffect(() => {
    const flush = () => { saveSession(); };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [saveSession]);

  const moveToNext = useCallback(() => {
    setTypedAnswer('');
    setSelectedMC(null);
    setPending(null);
    setCorrected(false);
    setFlash(false);
    setIntervalNote(null);

    const idx  = currentIndexRef.current;
    let   q    = queueRef.current;
    const pool = pendingPoolRef.current;

    const atEnd     = idx >= q.length - 1;
    const readyItem = pool.find(p => atEnd || idx - p.addedAtIndex >= MIN_SPACING);
    if (readyItem) {
      const remaining = q.length - 1 - idx;
      const offset    = 1 + (remaining > 1 ? Math.floor(Math.random() * Math.min(3, remaining)) : 0);
      const newQueue  = [...q];
      newQueue.splice(idx + offset, 0, readyItem.item);
      const newPool = pool.filter(p => p !== readyItem);
      queueRef.current       = newQueue;
      pendingPoolRef.current = newPool;
      setQueue(newQueue);
      setPendingPool(newPool);
      q = newQueue;
    }

    if (idx < q.length - 1) {
      setCurrentIndex(prev => prev + 1);
      return;
    }

    const totals = saveSession();
    if (totals) setTally(totals);
    setCurrentIndex(q.length);
  }, [saveSession]);

  const queueFollowUp = useCallback((item: QueuedWord) => {
    const entry = { item, addedAtIndex: currentIndexRef.current };
    pendingPoolRef.current = [...pendingPoolRef.current, entry];
    setPendingPool(prev => [...prev, entry]);
  }, []);

  // ─── Beoordelen ─────────────────────────────────────────────────────────

  const evaluateTyped = useCallback((
    input: string, word: Word, usedMode: FsrsMode,
  ): MatchResult => {
    if (usedMode === 'typed_nl_it') {
      return fuzzyMatchWithAlternatives(input, word.original, findSynonymOriginals(word, words));
    }
    if (usedMode === 'typed_it_nl' || usedMode === 'mc') {
      return fuzzyMatch(input, word.translation);
    }
    return fuzzyMatch(input, word.original);
  }, [words]);

  const commit = useCallback((
    item: QueuedWord, usedMode: FsrsMode, kind: 'mc' | 'typed',
    result: MatchResult, responseMs: number | null,
  ) => {
    const grade = gradeForAnswer(
      kind === 'mc' ? 'mc' : usedMode, result, responseMs, item.word.original.length,
    );

    if (result === 'almost') tallyRef.current.almost++;
    if (responseMs !== null) tallyRef.current.responseTimes.push(responseMs);

    void persistReview(item, grade, usedMode, responseMs);
    wordResultsRef.current.set(item.cardId, result === 'correct');

    // Een geslaagde kennismaking wordt in dezelfde sessie omgezet in productie.
    const introduced = usedMode === 'mc' || usedMode === 'listen_type';
    if (introduced && result === 'correct') {
      queueFollowUp({ cardId: item.cardId, mode: 'typed_nl_it', dueDate: null, word: item.word });
    }

    // Bij fout: één herkansing later in deze sessie.
    const retryKey = item.cardId + usedMode;
    if (result === 'wrong' && !retriedCardsRef.current.has(retryKey)) {
      retriedCardsRef.current.add(retryKey);
      queueFollowUp(item);
    }

    moveToNext();
  }, [persistReview, queueFollowUp, moveToNext]);

  const pause = useCallback((
    item: QueuedWord, usedMode: FsrsMode, kind: 'mc' | 'typed',
    input: string, result: MatchResult, responseMs: number | null,
  ) => {
    setPending({ item, usedMode, kind, input, result, responseMs });
  }, []);

  const handleSubmitAnswer = useCallback(() => {
    if (!currentItem || !typedAnswer.trim()) return;

    const usedMode   = effectiveMode(currentItem);
    const result     = evaluateTyped(typedAnswer, currentItem.word, usedMode);
    const responseMs = Date.now() - cardStartTimeRef.current;

    if (result === 'correct') {
      // Geen feedbackscherm: het veld kleurt goud en er komt een briefje op met
      // wanneer dit woord terugkomt — hoe vlotter je was, hoe verder weg.
      const grade    = gradeForAnswer(usedMode, result, responseMs, currentItem.word.original.length);
      const existing = fsrsStates[currentItem.cardId]?.[usedMode] ?? emptyFsrsState();
      setFlash(true);
      setIntervalNote(`over ${intervalText(previewInterval(existing, grade, today))}`);
      setTimeout(() => commit(currentItem, usedMode, 'typed', result, responseMs), FLASH_MS);
      return;
    }
    pause(currentItem, usedMode, 'typed', typedAnswer, result, responseMs);
  }, [currentItem, typedAnswer, effectiveMode, evaluateTyped, commit, pause, fsrsStates, today]);

  const handleSkip = useCallback(() => {
    if (!currentItem) return;
    pause(currentItem, effectiveMode(currentItem), 'typed', '', 'wrong', null);
  }, [currentItem, effectiveMode, pause]);

  const mcCorrect = activeMeaning.replace(/\s*\([^)]+\)/g, '').trim();

  const handleMCAnswer = useCallback((selected: string) => {
    if (!currentItem || selectedMC !== null) return;
    setSelectedMC(selected);

    const isCorrect = selected === activeMeaningRef.current.replace(/\s*\([^)]+\)/g, '').trim();
    if (isCorrect) {
      setTimeout(() => commit(currentItem, currentItem.mode, 'mc', 'correct', null), 700);
      return;
    }
    setTimeout(() => pause(currentItem, currentItem.mode, 'mc', selected, 'wrong', null), 700);
  }, [currentItem, selectedMC, commit, pause]);

  const handleContinue = useCallback(() => {
    if (!pending) return;
    commit(pending.item, pending.usedMode, pending.kind, pending.result, pending.responseMs);
  }, [pending, commit]);

  const handleMarkCorrect = useCallback(() => {
    if (!pending) return;
    commit(pending.item, pending.usedMode, pending.kind, 'correct', pending.responseMs);
  }, [pending, commit]);

  /** Sla een correctie op en herbeoordeel het lopende antwoord meteen. */
  const applyCorrection = useCallback((cardId: string, original: string, translation: string) => {
    if (!original || !translation) return;
    void updateWord(cardId, { original, translation });
    setQueue(prev => prev.map(item =>
      item.cardId === cardId ? { ...item, word: { ...item.word, original, translation } } : item,
    ));
  }, [updateWord]);

  const handleSaveCorrection = useCallback((original: string, translation: string) => {
    if (!pending) return;
    applyCorrection(pending.item.cardId, original, translation);

    const word = { ...pending.item.word, original, translation };
    setPending({
      ...pending,
      item:   { ...pending.item, word },
      result: evaluateTyped(pending.input, word, pending.usedMode),
    });
    setCorrected(true);
  }, [pending, applyCorrection, evaluateTyped]);

  // ─── Render ─────────────────────────────────────────────────────────────

  const overview = useMemo(
    () => buildOverview(words, fsrsStates, sessions, reviewLogs, today),
    [words, fsrsStates, sessions, reviewLogs, today],
  );

  /** Wat er ná deze sessie nog te doen valt; alles wat due was is nu vooruitgeschoven. */
  const aheadCount = useMemo(
    () => buildSession(
      Object.fromEntries(words.map(w => [w.id, fsrsStates[w.id] ?? {}])),
      today,
      stats.dailyGoal,
    ).length,
    [words, fsrsStates, today, stats.dailyGoal],
  );

  const startAnotherRound = useCallback(() => {
    wordResultsRef.current.clear();
    retriedCardsRef.current.clear();
    tallyRef.current = { anchored: [], almost: 0, responseTimes: [] };
    sessionSavedRef.current = false;
    sessionStartRef.current = Date.now();
    lapsedBeforeRef.current = null;
    setTally(null);
    setPendingPool([]);
    setCurrentIndex(0);
    setInitialized(false);
  }, []);

  if (initialized && queue.length === 0) {
    return (
      <Screen>
        <ScreenHeader onMenu={() => navigate('/menu')} />
        <div className="text-[26px] font-semibold leading-[1.25] tracking-[-0.02em] text-ink">
          Niets vervalt vandaag.
          {overview.dueTomorrow > 0 && <><br />Morgen vervallen er {overview.dueTomorrow}.</>}
        </div>
      </Screen>
    );
  }

  if (currentIndex >= queue.length && queue.length > 0 && tally) {
    return (
      <Screen>
        <ScreenHeader onMenu={() => navigate('/menu')} />
        <SessionEnd
          tally={tally}
          counts={overview.counts}
          lapsedBefore={lapsedBeforeRef.current ?? overview.counts.lapsed}
          dueTomorrow={overview.dueTomorrow}
          aheadCount={aheadCount}
          onClose={() => navigate('/')}
          onWorkAhead={startAnotherRound}
        />
      </Screen>
    );
  }

  if (!currentItem) return null;

  const displayWord = { ...currentItem.word, translation: activeMeaning };

  if (editOpen) {
    return (
      <Screen>
        <SessionHeader onBack={() => setEditOpen(false)} position={currentIndex + 1} total={queue.length} />
        <CorrectionEditor
          word={currentItem.word}
          input={typedAnswer}
          typedDutch={mode === 'typed_it_nl'}
          showUseMyAnswer={typedAnswer.trim().length > 0}
          onCancel={() => setEditOpen(false)}
          onSave={(original, translation) => {
            applyCorrection(currentItem.cardId, original, translation);
            setEditOpen(false);
          }}
        />
      </Screen>
    );
  }

  if (pending) {
    const existing = fsrsStates[pending.item.cardId]?.[pending.usedMode] ?? emptyFsrsState();
    const grade = gradeForAnswer(
      pending.kind === 'mc' ? 'mc' : pending.usedMode,
      pending.result, pending.responseMs, pending.item.word.original.length,
    );

    return (
      <Screen>
        <SessionHeader onBack={() => navigate('/')} position={currentIndex + 1} total={queue.length} />
        <FeedbackCard
          word={pending.item.word}
          input={pending.input}
          mode={pending.usedMode as 'mc' | 'typed_nl_it' | 'typed_it_nl' | 'listen_type'}
          result={pending.result}
          responseMs={pending.responseMs}
          intervalDays={previewInterval(existing, grade, today)}
          corrected={corrected}
          onSave={handleSaveCorrection}
          onMarkCorrect={handleMarkCorrect}
          onContinue={handleContinue}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <SessionHeader onBack={() => navigate('/')} position={currentIndex + 1} total={queue.length} />

      {mode === 'mc' ? (
        <IntroCard
          word={displayWord}
          options={mcOptions}
          selected={selectedMC}
          correct={mcCorrect}
          onSelect={handleMCAnswer}
          onEdit={() => setEditOpen(true)}
        />
      ) : mode === 'listen_type' ? (
        <ListeningCard
          word={currentItem.word}
          typedAnswer={typedAnswer}
          onTypeAnswer={setTypedAnswer}
          onSubmit={handleSubmitAnswer}
          onSkip={handleSkip}
          onMute={muteListening}
          flash={flash}
        />
      ) : (
        <ProductionCard
          word={mode === 'typed_nl_it' ? displayWord : currentItem.word}
          direction={mode === 'typed_it_nl' ? 'it_nl' : 'nl_it'}
          typedAnswer={typedAnswer}
          onTypeAnswer={setTypedAnswer}
          onSubmit={handleSubmitAnswer}
          onSkip={handleSkip}
          onEdit={() => setEditOpen(true)}
          flash={flash}
          intervalNote={intervalNote}
        />
      )}
    </Screen>
  );
}
