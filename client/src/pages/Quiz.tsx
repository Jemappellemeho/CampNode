// Student quiz player.
// Scores each question type and saves quiz statistics.
import { useState, useEffect } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import axios from "axios"; // Nur noch für axios.isAxiosError() gebraucht
import { ArrowLeft, Trophy, GripVertical, CheckCircle2, XCircle } from "lucide-react";
import { api } from "../utils/api";

export default function Quiz() {
  const navigate = useNavigate();
  const location = useLocation();
  const { topicId } = useParams();
  const [quiz, setQuiz] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [finished, setFinished] = useState(false);
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState<any>(null); 
  const [multiSelect, setMultiSelect] = useState<number[]>([]);
  const [reorderList, setReorderList] = useState<any[]>([]);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [loadError, setLoadError] = useState('');
  const [answerResults, setAnswerResults] = useState<Array<{ type: string; correct: boolean; pointsEarned: number }>>([]);
  const markAsSkip = Boolean((location.state as { markAsSkip?: boolean } | null)?.markAsSkip);

  // Namespaced keys for localStorage to track opened resources and completed quizzes per user.
  const getResourceStorageKey = (userId?: string) => `campnode:resource-opened:${userId || 'anon'}`;
  const getQuizStorageKey = (userId?: string) => `campnode:quiz-completed:${userId || 'anon'}`;

  const loadStoredIds = (key: string) => {
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
    } catch {
      return [];
    }
  };

  const persistStoredIds = (key: string, ids: string[]) => {
    localStorage.setItem(key, JSON.stringify(Array.from(new Set(ids))));
  };

  const shuffleArray = (array: any[]) => {
    if (!Array.isArray(array)) return [];
    const copy = [...array];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  };

  const arraysEqual = (left: any[], right: any[]) => (
    left.length === right.length && left.every((item, index) => item === right[index])
  );

  // Use professor-defined points with a safe fallback.
  const getQuestionPoints = (question: any) => {
    const points = Number(question?.points);
    return Number.isFinite(points) && points > 0 ? points : 1;
  };

  // Max score is the sum of all question points.
  const getTotalQuizPoints = () => (
    Array.isArray(quiz?.questions)
      ? quiz.questions.reduce((total: number, question: any) => total + getQuestionPoints(question), 0)
      : 0
  );

  // Normalize text for strict answer comparison.
  const normalizeAnswerText = (value: string) => String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Split typed answers into clear list items.
  const splitAnswerItems = (value: string) => String(value || "")
    .split(/[,;\n]+|\s+\/\s+/g)
    .map((item) => normalizeAnswerText(item))
    .filter(Boolean);

  // Slash means alternatives for the same required answer.
  const buildAnswerGroups = (acceptedAnswers: string[]) => (
    Array.isArray(acceptedAnswers) ? acceptedAnswers : []
  )
    .map((answer) => String(answer || "")
      .split("/")
      .map((variant) => normalizeAnswerText(variant))
      .filter(Boolean))
    .filter((group) => group.length > 0);

  // Choose grading mode when older quizzes do not define it.
  const getOpenAnswerGradingMode = (question: any, acceptedAnswers: string[]) => {
    if (question?.gradingMode === "all" || question?.gradingMode === "any") return question.gradingMode;

    const questionText = String(question?.question || "").toLowerCase();
    const asksForOne = /\b(name one|one phrase|which key term|which term|name the|what is|worum|wann|welche[rsmn]? begriff)\b/i.test(questionText);
    if (asksForOne) return "any";
    return acceptedAnswers.length > 1 ? "all" : "any";
  };

  // Minimum matched required answers for partial credit.
  const getPartialCreditThreshold = (question: any, requiredCount: number, fallback = 1) => {
    const rawThreshold = Number(question?.partialCreditThreshold);
    if (Number.isFinite(rawThreshold) && rawThreshold > 0) {
      return Math.min(requiredCount, Math.max(1, Math.round(rawThreshold)));
    }

    return Math.min(requiredCount, Math.max(1, Math.round(fallback)));
  };

  // Score checkbox questions with optional partial credit.
  const scoreMultipleSelect = (selectedIndices: number[], questionForScoring: any = q) => {
    const correct = Array.isArray(questionForScoring?.correctIndices) ? questionForScoring.correctIndices : [];
    if (!correct.length) return 0;

    const selectedSet = new Set(selectedIndices);
    const matchedCount = correct.filter((index: number) => selectedSet.has(index)).length;

    // Full credit requires the exact correct set.
    if (matchedCount === correct.length && selectedIndices.length === correct.length) return 1;

    // Partial credit rewards any enough-correct selection.
    const partialEnabled = questionForScoring?.partialCreditEnabled !== false;
    if (!partialEnabled) return 0;

    // Teacher controls how many correct choices are enough for 0.5.
    const partialThreshold = getPartialCreditThreshold(questionForScoring, correct.length);
    return matchedCount >= partialThreshold ? 0.5 : 0;
  };

  // Score open answers with strict matching.
  const scoreOpenAnswer = (selectedAnswer: string, acceptedAnswers: string[], questionForScoring: any = q) => {
    const normalizedSelected = normalizeAnswerText(selectedAnswer);
    if (!normalizedSelected) return 0;

    const accepted = Array.isArray(acceptedAnswers) ? acceptedAnswers : [];
    const answerGroups = buildAnswerGroups(accepted);
    if (!answerGroups.length) return 0;

    const selectedItems = splitAnswerItems(selectedAnswer);
    const selectedText = ` ${normalizedSelected} `;
    const matchesGroup = (group: string[]) => group.some((variant) => {
      const variantText = ` ${variant} `;
      return selectedItems.includes(variant) || selectedText.includes(variantText);
    });

    const mode = getOpenAnswerGradingMode(questionForScoring, accepted);
    if (mode === "any") return answerGroups.some(matchesGroup) ? 1 : 0;

    const matchedCount = answerGroups.filter(matchesGroup).length;
    if (matchedCount === answerGroups.length) return 1;

    // Teacher can require full correctness only.
    if (questionForScoring?.partialCreditEnabled === false) return 0;

    const partialThreshold = getPartialCreditThreshold(questionForScoring, answerGroups.length);
    return matchedCount >= partialThreshold ? 0.5 : 0;
  };

  const buildReorderStart = (items: any[]) => {
    if (!Array.isArray(items)) return [];
    if (items.length < 2) return [...items];

    // Reorder questions should never start already solved.
    let shuffled = shuffleArray(items);
    let attempts = 0;

    while (attempts < 6 && arraysEqual(shuffled, items)) {
      shuffled = shuffleArray(items);
      attempts += 1;
    }

    if (arraysEqual(shuffled, items)) {
      const fallback = [...items];
      [fallback[0], fallback[1]] = [fallback[1], fallback[0]];
      return fallback;
    }

    return shuffled;
  };

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get(`/topics/quizzes/topic/${topicId}`);
        setLoadError('');
        
        if (res.data && Array.isArray(res.data.questions) && res.data.questions.length > 0) {
          setQuiz(res.data);
          const firstQ = res.data.questions[0];
          if (firstQ?.type === 'reorder') {
            setReorderList(buildReorderStart(firstQ.items));
          }
        } else {
          // If backend sends an empty quiz, don't let it crash
          setQuiz({ questions: [] });
        }
      } catch (e) { 
        console.error("API Error:", e);
        const message = axios.isAxiosError(e)
          ? e.response?.data?.error || 'Could not load quiz.'
          : 'Could not load quiz.';
        setLoadError(message);
      } finally { 
        setLoading(false); 
      }
    };
    if (topicId) load();
  }, [topicId]);

  const q = quiz?.questions?.[currentIdx];

  const isCorrect = () => {
    if (!q) return false;
    if (q.type === "multiple_choice") return selected === q.correctIndex;
    if (q.type === "true_false") {
      const trueFalseOptions = currentIdx % 2 === 0 ? ["True", "False"] : ["False", "True"];
      return trueFalseOptions[selected] === String(q.correctAnswer ? "True" : "False");
    }
    
    // SAFE STRING CHECK: Prevents .toLowerCase().trim() from crashing on null
    if (q.type === "open_answer") {
      const validAnswers = Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers : [];
      return scoreOpenAnswer(String(selected || ""), validAnswers, q) >= 1;
    }
    
    if (q.type === "multiple_select") {
      return scoreMultipleSelect(multiSelect, q) >= 1;
    }
    
    if (q.type === "reorder") {
      const sourceItems = Array.isArray(q.items) ? q.items : [];
      const order = Array.isArray(q.correctOrder) ? q.correctOrder : sourceItems.map((_: unknown, idx: number) => idx);
      const correctItems = order.map((itemIndex: number) => sourceItems[itemIndex]).filter(Boolean);
      return JSON.stringify(reorderList) === JSON.stringify(correctItems);
    }
    
    return false;
  };

  const getCorrectAnswerText = () => {
    if (!q) return null;
    if (q.type === "multiple_choice") return <>{q.options[q.correctIndex]}</>;
    if (q.type === "true_false") return <>{q.correctAnswer ? "True" : "False"}</>;
    if (q.type === "open_answer") return <>{Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers.join(' / ') : ""}</>;
    if (q.type === "multiple_select") {
      const correct = Array.isArray(q.correctIndices) ? q.correctIndices : [];
      return <>{correct.map((idx: number) => q.options[idx]).join(', ')}</>;
    }
    if (q.type === "reorder") {
      const sourceItems = Array.isArray(q.items) ? q.items : [];
      const order = Array.isArray(q.correctOrder) ? q.correctOrder : sourceItems.map((_: unknown, idx: number) => idx);
      return (
        <div className="flex flex-col gap-1.5 mt-1">
          {order.map((idx: number, step: number) => (
            <div key={idx} className="flex gap-2">
              <span className="opacity-50 font-black">{step + 1}.</span>
              <span>{sourceItems[idx]}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  const saveQuizResult = async (
    finalScore: number,
    totalQuestions: number,
    finalAnswerResults: Array<{ type: string; correct: boolean; pointsEarned: number }>
  ) => {
    if (!quiz?.id || !topicId) return;

    try {
      await api.post('/statistics/quiz-result', {
        quizId: quiz.id,
        topicId,
        score: finalScore,
        totalQuestions,
        questionStats: finalAnswerResults,
      });
    } catch (error) {
      console.error('Could not save quiz statistics:', error);
    }
  };

  /**
   * Calculate points earned for the current question.
   * This function handles scoring for all question types in the quiz.
   *
   * Scoring by question type:
   * - open_answer: Uses strict matching with optional partial credit
   * - multiple_select: Uses exact matching with optional partial credit
   * - reorder: Uses partial scoring based on correct position count
   * - multiple_choice, true_false: Binary (1 or 0)
   *
   * @returns Points earned: 1 (full), 0.5 (partial), or 0 (incorrect)
   */
  const scoreCurrentQuestion = () => {
    if (!q) return 0;
    const questionPoints = getQuestionPoints(q);

    // Type: open_answer (user types text answer)
    // Uses smart matching with multiple accepted answer variants
    if (q.type === "open_answer") {
      return scoreOpenAnswer(String(selected || ""), Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers : [], q) * questionPoints;
    }

    // Type: multiple_select (checkbox answers)
    // Partial credit: enough correct choices = 0.5 points
    if (q.type === "multiple_select") {
      return scoreMultipleSelect(multiSelect, q) * questionPoints;
    }

    // Type: reorder (drag and drop ordering)
    // Partial credit uses the teacher-defined threshold.
    if (q.type === "reorder") {
      const sourceItems = Array.isArray(q.items) ? q.items : [];
      const order = Array.isArray(q.correctOrder) ? q.correctOrder : sourceItems.map((_: unknown, idx: number) => idx);
      const correctItems = order.map((itemIndex: number) => sourceItems[itemIndex]).filter(Boolean);

      // Count how many items are in their correct position
      let correctPositions = 0;
      for (let i = 0; i < reorderList.length; i++) {
        if (reorderList[i] === correctItems[i]) correctPositions++;
      }

      // Scoring: all correct = full credit.
      if (correctPositions === correctItems.length) return questionPoints;

      // Partial credit follows the same rule as other multi-part questions.
      if (q.partialCreditEnabled === false) return 0;
      const partialThreshold = getPartialCreditThreshold(q, correctItems.length, Math.ceil(correctItems.length / 2));
      if (correctPositions >= partialThreshold) return questionPoints * 0.5;
      return 0;
    }

    // Types: multiple_choice, true_false
    // Binary scoring only.
    return isCorrect() ? questionPoints : 0;
  };

  const handleNext = () => {
    const earnedPoints = scoreCurrentQuestion();
    const maxCurrentPoints = getQuestionPoints(q);
    const nextScore = score + earnedPoints;
    const nextAnswerResults = [...answerResults, { type: q?.type || 'unknown', correct: earnedPoints >= maxCurrentPoints, pointsEarned: earnedPoints }];

    setAnswerResults(nextAnswerResults);
    if (earnedPoints > 0) setScore(nextScore);
    
    const totalQuestions = Array.isArray(quiz?.questions) ? quiz.questions.length : 0;
    
    if (currentIdx < totalQuestions - 1) {
      const nextQ = quiz.questions[currentIdx + 1];
      setCurrentIdx(prev => prev + 1);
      setRevealed(false);
      setSelected(null);
      setMultiSelect([]);
      if (nextQ?.type === 'reorder') setReorderList(buildReorderStart(nextQ.items));
    } else {
      if (topicId) {
        try {
          // Mark quiz as completed in localStorage and optionally sync with backend.
          const savedUser = localStorage.getItem('user');
          const parsedUser = savedUser ? JSON.parse(savedUser) : null;
          const userId = parsedUser?.id;
          const quizKey = getQuizStorageKey(userId);
          const resourceKey = getResourceStorageKey(userId);
          const nextQuizIds = [...loadStoredIds(quizKey), topicId];
          persistStoredIds(quizKey, nextQuizIds);

          let nextResourceIds = loadStoredIds(resourceKey);
          if (markAsSkip && !nextResourceIds.includes(topicId)) {
            nextResourceIds = [...nextResourceIds, topicId];
            persistStoredIds(resourceKey, nextResourceIds);
          }

          if (nextResourceIds.includes(topicId)) {
            api.post('/progress', { topicId, completed: true }).catch(() => {});
          }
        } catch {
          // Ignore local progress persistence errors and still finish the quiz.
        }
      }
      saveQuizResult(nextScore, getTotalQuizPoints() || totalQuestions, nextAnswerResults);
      setFinished(true);
    }
  };

  if (loading) return <div className="h-screen flex items-center justify-center text-xs font-bold uppercase opacity-20">Syncing...</div>;
  
  // Safe fallback if quiz array is empty or malformed
  if (loadError || !quiz || !Array.isArray(quiz.questions) || quiz.questions.length === 0 || !q) return (
    <div className="h-screen flex flex-col items-center justify-center p-10 text-center">
      <p className="text-red-500 font-bold mb-4 uppercase">{loadError || "Error: Quiz data is missing or empty."}</p>
      <button onClick={() => navigate(-1)} className="px-6 py-2 bg-black text-white rounded-full text-xs font-bold">GO BACK</button>
    </div>
  );

  if (finished) return (
    <div className="h-screen w-full flex items-center justify-center p-6 bg-[var(--cn-page)]">
      <div className="text-center p-8 rounded-[32px] border shadow-2xl bg-[var(--cn-card)] border-[var(--cn-border)] max-w-sm w-full">
        <Trophy size={48} className="text-[#F5C518] mx-auto mb-4" />
        <h1 className="text-2xl font-black mb-1" style={{color: "var(--cn-text)"}}>Final Results</h1>
        <p className="text-5xl font-black text-blue-600 mb-6">{Number.isInteger(score) ? score : score.toFixed(1)} / {getTotalQuizPoints() || quiz.questions.length}</p>
        <button onClick={() => navigate(-1)} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest">Exit</button>
      </div>
    </div>
  );

  // SAFE ARRAY FALLBACKS for rendering
  const optionsToRender = q.type === "true_false"
    ? (currentIdx % 2 === 0 ? ["True", "False"] : ["False", "True"])
    : (Array.isArray(q.options) ? q.options : ["True", "False"]);
  const revealedScore = revealed ? scoreCurrentQuestion() : 0;
  const currentQuestionPoints = getQuestionPoints(q);
  const answerState = !revealed
    ? "idle"
    : revealedScore >= currentQuestionPoints
      ? "correct"
      : revealedScore > 0
        ? "partial"
        : "incorrect";

  return (
    <div className="h-screen w-full flex flex-col transition-colors px-4 pt-2 pb-6" style={{ background: "var(--cn-page)" }}>
      <div className="max-w-lg mx-auto w-full flex flex-col h-full justify-start mt-1">
        
        {/* Progress Bar */}
        <div className="w-full h-1 bg-gray-200 dark:bg-gray-800 rounded-full mb-3 overflow-hidden shrink-0">
            <div className="h-full bg-[#F5C518] transition-all duration-500" style={{ width: `${((currentIdx + 1) / quiz.questions.length) * 100}%` }} />
        </div>
        
        <div className="flex items-center justify-between mb-2 shrink-0 px-1">
          <button onClick={() => navigate(-1)} className="text-[10px] font-bold uppercase opacity-30 hover:opacity-100 transition-opacity flex items-center gap-1"><ArrowLeft size={12}/> EXIT</button>
          <div className="text-right text-[9px] font-bold opacity-30 uppercase">{currentIdx + 1} of {quiz.questions.length}</div>
        </div>
        
        <div className="bg-[var(--cn-card)] border border-[var(--cn-border)] rounded-[24px] shadow-xl flex flex-col overflow-hidden max-h-[84vh]">
          <div className="overflow-y-auto p-6 sm:p-8 custom-scrollbar">
            <h2 className="text-lg font-bold mb-6 leading-tight" style={{ color: "var(--cn-text)" }}>{q.question || "Missing Question"}</h2>
            
            <div className="space-y-2">
              {(q.type === "multiple_choice" || q.type === "true_false") && optionsToRender.map((opt: any, i: number) => (
                <button key={i} onClick={() => !revealed && setSelected(i)} className={`w-full text-left p-3.5 rounded-xl border-2 transition-all text-[14px] font-semibold ${selected === i ? 'border-blue-500 bg-blue-500/10 dark:bg-blue-500/15 shadow-[0_0_0_1px_rgba(59,130,246,0.25)]' : 'border-[var(--cn-border)] hover:border-blue-400/50'}`} style={{ color: "var(--cn-text)" }}>{opt}</button>
              ))}
              
              {q.type === "multiple_select" && Array.isArray(q.options) && q.options.map((opt: string, i: number) => (
                <button key={i} onClick={() => !revealed && (multiSelect.includes(i) ? setMultiSelect(multiSelect.filter(x => x !== i)) : setMultiSelect([...multiSelect, i]))} className={`w-full text-left p-3.5 rounded-xl border-2 transition-all text-[14px] font-semibold flex items-center justify-between ${multiSelect.includes(i) ? 'border-blue-500 bg-blue-500/10 dark:bg-blue-500/15 shadow-[0_0_0_1px_rgba(59,130,246,0.25)]' : 'border-[var(--cn-border)] hover:border-blue-400/50'}`} style={{ color: "var(--cn-text)" }}>
                  {opt} {multiSelect.includes(i) && <CheckCircle2 size={18} className="text-blue-500" />}
                </button>
              ))}
              
              {q.type === "reorder" && Array.isArray(reorderList) && reorderList.map((item, i) => (
                <div key={item} draggable={!revealed} onDragStart={(e) => {setDraggedIdx(i); e.dataTransfer.effectAllowed = "move";}} onDragOver={(e) => { e.preventDefault(); if (draggedIdx !== null && draggedIdx !== i) { const nl = [...reorderList]; const it = nl[draggedIdx]; nl.splice(draggedIdx, 1); nl.splice(i, 0, it); setDraggedIdx(i); setReorderList(nl); }}} onDragEnd={() => setDraggedIdx(null)}
                  className={`flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all ${draggedIdx === i ? 'opacity-20 bg-blue-500/10 border-dashed border-blue-400' : 'opacity-100'}`} style={{ color: "var(--cn-text)", background: "var(--cn-card)", borderColor: "var(--cn-border)" }}
                >
                  <GripVertical size={14} className="opacity-20 shrink-0" />
                  <span className="flex-1 font-semibold text-[13px]">{item}</span>
                </div>
              ))}
              
              {q.type === "open_answer" && (
                <input 
                  type="text" 
                  value={selected || ""} 
                  onChange={(e) => setSelected(e.target.value)} 
                  className="w-full p-4 rounded-xl border-2 bg-transparent outline-none focus:border-blue-500 font-semibold text-[14px]" 
                  style={{ color: "var(--cn-text)", borderColor: "var(--cn-border)" }} 
                  placeholder="Type answer..." 
                  disabled={revealed}
                />
              )}

              {q.type === "open_answer" && q.hint && !revealed && (
                <p className="text-[11px] font-semibold opacity-50" style={{ color: "var(--cn-text)" }}>
                  Hint: {q.hint}
                </p>
              )}
              
              {revealed && (
                <div className={`mt-4 p-4 rounded-2xl border-2 animate-in slide-in-from-top-2 shadow-lg ${answerState === 'correct' ? 'bg-emerald-100 border-emerald-400/80 shadow-emerald-500/10 dark:bg-emerald-900/45 dark:border-emerald-500/65 dark:shadow-emerald-950/25' : answerState === 'partial' ? 'bg-amber-100 border-amber-400/80 shadow-amber-500/10 dark:bg-amber-900/40 dark:border-amber-500/65 dark:shadow-amber-950/25' : 'bg-red-100 border-red-400/80 shadow-red-500/10 dark:bg-red-900/40 dark:border-red-500/65 dark:shadow-red-950/25'}`}>
                  <div className={`inline-flex items-center gap-2 mb-2 px-3 py-1.5 rounded-full text-[10px] font-black tracking-[0.18em] uppercase ${answerState === 'correct' ? 'bg-emerald-600 text-white border border-emerald-500 dark:bg-emerald-600/35 dark:text-emerald-50 dark:border-emerald-400/35' : answerState === 'partial' ? 'bg-amber-600 text-white border border-amber-500 dark:bg-amber-600/35 dark:text-amber-50 dark:border-amber-400/35' : 'bg-red-600 text-white border border-red-500 dark:bg-red-600/35 dark:text-red-50 dark:border-red-400/35'}`}>
                    {answerState === 'correct' ? <><CheckCircle2 size={15} className="text-white dark:text-emerald-200"/> CORRECT</> : answerState === 'partial' ? <><CheckCircle2 size={15} className="text-white dark:text-amber-200"/> PARTIAL</> : <><XCircle size={15} className="text-white dark:text-red-200"/> INCORRECT</>}
                  </div>
                  {answerState !== 'correct' && (
                    <div className="mb-2.5 p-2.5 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10">
                      <p className="text-[10px] font-black text-red-500/80 dark:text-red-400/80 uppercase tracking-widest mb-1.5">The Correct Answer</p>
                      <p className="text-[13px] font-bold text-slate-800 dark:text-slate-100">{getCorrectAnswerText()}</p>
                    </div>
                  )}
                  <p className="text-[11px] font-medium leading-relaxed text-slate-800 dark:text-slate-100 italic">{q.explanation}</p>
                </div>
              )}
            </div>
          </div>
          
          <div className="p-4 bg-[var(--cn-card)] border-t shrink-0" style={{ borderColor: "var(--cn-border)" }}>
            <button 
              onClick={revealed ? handleNext : () => setRevealed(true)} 
              disabled={!revealed && selected === null && multiSelect.length === 0 && q.type !== 'reorder'} 
              className={`w-full py-4 rounded-2xl font-bold transition-all text-xs uppercase tracking-widest ${revealed ? 'bg-blue-500 hover:bg-blue-400 text-white shadow-lg shadow-blue-500/25' : 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'}`}
            >
              {revealed ? "Continue" : "Check Answer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
