// =============================================================
// FILE LOCATION: client/src/pages/Quiz.tsx
// NEW FILE
//
// WHAT THIS PAGE DOES:
// Full-page exam experience for students.
// Shows one question at a time with a progress bar.
// Supports 5 question types:
//   - multiple_choice  → pick one
//   - multiple_select  → pick all that apply
//   - true_false       → true or false buttons
//   - reorder          → click items to build correct order
//   - open_answer      → type your answer
//
// After all questions → results screen with pass/fail
// Pass threshold = 70% (set in mock data, later from API)
//
// HOW TO CONNECT TO REAL API LATER:
// Replace the MOCK_QUIZ import with:
//   const quiz = await fetch(`/api/quizzes/${topicId}`).then(r => r.json())
// =============================================================

import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, Check, X,
  RotateCcw, Trophy, AlertCircle, ChevronUp, ChevronDown,
} from "lucide-react";
import {
  MOCK_QUIZ,
  type Question,
  type MultipleChoiceQuestion,
  type MultipleSelectQuestion,
  type TrueFalseQuestion,
  type ReorderQuestion,
  type OpenAnswerQuestion,
} from "../data/mockQuizData";

const CN = {
  blue: "#1E6FFF",
  blueDark: "#1557CC",
  red: "#E63027",
  green: "#3A9E3F",
  yellow: "#F5C518",
};

// =============================================================
// QUESTION TYPE RENDERERS
// Each one handles its own interaction and calls onAnswer()
// when the student has made a selection
// =============================================================

// ---- Multiple Choice ----
function MultipleChoice({
  question,
  selected,
  onSelect,
  revealed,
}: {
  question: MultipleChoiceQuestion;
  selected: number | null;
  onSelect: (i: number) => void;
  revealed: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      {question.options.map((opt, i) => {
        const isSelected = selected === i;
        const isCorrect = i === question.correctIndex;
        let borderColor = "var(--cn-border)";
        let bg = "var(--cn-card)";
        let textColor = "var(--cn-text)";

        if (revealed) {
          if (isCorrect) { borderColor = CN.green; bg = CN.green + "15"; }
          else if (isSelected && !isCorrect) { borderColor = CN.red; bg = CN.red + "10"; }
        } else if (isSelected) {
          borderColor = CN.blue;
          bg = CN.blue + "10";
        }

        return (
          <button key={i} onClick={() => !revealed && onSelect(i)}
            className="w-full text-left px-4 py-3 rounded-xl transition-all text-sm font-medium flex items-center gap-3"
            style={{ background: bg, border: `2px solid ${borderColor}`, color: textColor, cursor: revealed ? "default" : "pointer" }}>
            <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
              style={{ background: isSelected || (revealed && isCorrect) ? (revealed && isSelected && !isCorrect ? CN.red : revealed && isCorrect ? CN.green : CN.blue) : "var(--cn-bg)", color: isSelected || (revealed && isCorrect) ? "white" : "var(--cn-muted)", border: `1px solid ${borderColor}` }}>
              {revealed && isCorrect ? <Check size={12} /> : revealed && isSelected && !isCorrect ? <X size={12} /> : String.fromCharCode(65 + i)}
            </div>
            {opt}
          </button>
        );
      })}
    </div>
  );
}

// ---- Multiple Select ----
function MultipleSelect({
  question,
  selected,
  onToggle,
  revealed,
}: {
  question: MultipleSelectQuestion;
  selected: number[];
  onToggle: (i: number) => void;
  revealed: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-medium mb-1" style={{ color: "var(--cn-muted)" }}>
        Select all that apply
      </p>
      {question.options.map((opt, i) => {
        const isSelected = selected.includes(i);
        const isCorrect = question.correctIndices.includes(i);
        let borderColor = "var(--cn-border)";
        let bg = "var(--cn-card)";

        if (revealed) {
          if (isCorrect) { borderColor = CN.green; bg = CN.green + "15"; }
          else if (isSelected) { borderColor = CN.red; bg = CN.red + "10"; }
        } else if (isSelected) {
          borderColor = CN.blue; bg = CN.blue + "10";
        }

        return (
          <button key={i} onClick={() => !revealed && onToggle(i)}
            className="w-full text-left px-4 py-3 rounded-xl transition-all text-sm font-medium flex items-center gap-3"
            style={{ background: bg, border: `2px solid ${borderColor}`, color: "var(--cn-text)", cursor: revealed ? "default" : "pointer" }}>
            <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
              style={{ background: isSelected ? (revealed && !isCorrect ? CN.red : CN.blue) : "transparent", border: `2px solid ${isSelected ? (revealed && !isCorrect ? CN.red : CN.blue) : "var(--cn-border)"}` }}>
              {isSelected && <Check size={10} color="white" />}
            </div>
            {opt}
            {revealed && isCorrect && <Check size={14} className="ml-auto" style={{ color: CN.green }} />}
          </button>
        );
      })}
    </div>
  );
}

// ---- True / False ----
function TrueFalse({
  question,
  selected,
  onSelect,
  revealed,
}: {
  question: TrueFalseQuestion;
  selected: boolean | null;
  onSelect: (v: boolean) => void;
  revealed: boolean;
}) {
  return (
    <div className="flex gap-4 justify-center mt-4">
      {[true, false].map((val) => {
        const isSelected = selected === val;
        const isCorrect = val === question.correctAnswer;
        let bg = "var(--cn-card)";
        let borderColor = "var(--cn-border)";
        let color = "var(--cn-text)";

        if (revealed) {
          if (isCorrect) { bg = CN.green + "20"; borderColor = CN.green; color = CN.green; }
          else if (isSelected) { bg = CN.red + "15"; borderColor = CN.red; color = CN.red; }
        } else if (isSelected) {
          bg = CN.blue + "15"; borderColor = CN.blue; color = CN.blue;
        }

        return (
          <button key={String(val)} onClick={() => !revealed && onSelect(val)}
            className="flex-1 max-w-xs py-5 rounded-2xl text-lg font-black transition-all"
            style={{ background: bg, border: `2px solid ${borderColor}`, color, cursor: revealed ? "default" : "pointer" }}>
            {val ? "TRUE" : "FALSE"}
          </button>
        );
      })}
    </div>
  );
}

// ---- Reorder ----
// Student clicks items one by one to build the correct order
function Reorder({
  question,
  order,
  onReorder,
  revealed,
}: {
  question: ReorderQuestion;
  order: number[];
  onReorder: (order: number[]) => void;
  revealed: boolean;
}) {
  const addItem = (i: number) => {
    if (!order.includes(i)) onReorder([...order, i]);
  };
  const removeItem = (i: number) => {
    onReorder(order.filter((x) => x !== i));
  };
  const moveUp = (pos: number) => {
    if (pos === 0) return;
    const newOrder = [...order];
    [newOrder[pos - 1], newOrder[pos]] = [newOrder[pos], newOrder[pos - 1]];
    onReorder(newOrder);
  };
  const moveDown = (pos: number) => {
    if (pos === order.length - 1) return;
    const newOrder = [...order];
    [newOrder[pos], newOrder[pos + 1]] = [newOrder[pos + 1], newOrder[pos]];
    onReorder(newOrder);
  };

  const isCorrectOrder = revealed &&
    order.length === question.correctOrder.length &&
    order.every((v, i) => v === question.correctOrder[i]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs font-medium" style={{ color: "var(--cn-muted)" }}>
        Click items below to build your answer in the correct order
      </p>

      {/* Built order */}
      <div className="flex flex-col gap-2 min-h-16">
        {order.length === 0 && (
          <div className="flex items-center justify-center h-12 rounded-xl text-sm"
            style={{ border: `2px dashed var(--cn-border)`, color: "var(--cn-muted)" }}>
            Click items below to order them
          </div>
        )}
        {order.map((itemIdx, pos) => {
          const correctAtPos = revealed ? question.correctOrder[pos] === itemIdx : null;
          return (
            <div key={itemIdx} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
              style={{
                background: revealed ? (correctAtPos ? CN.green + "15" : CN.red + "10") : CN.blue + "10",
                border: `2px solid ${revealed ? (correctAtPos ? CN.green : CN.red) : CN.blue}`,
                color: "var(--cn-text)",
              }}>
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                style={{ background: revealed ? (correctAtPos ? CN.green : CN.red) : CN.blue }}>
                {pos + 1}
              </span>
              <span className="flex-1">{question.items[itemIdx]}</span>
              {!revealed && (
                <div className="flex flex-col gap-0.5">
                  <button onClick={() => moveUp(pos)} className="p-0.5 rounded hover:opacity-70"><ChevronUp size={12} /></button>
                  <button onClick={() => moveDown(pos)} className="p-0.5 rounded hover:opacity-70"><ChevronDown size={12} /></button>
                </div>
              )}
              {!revealed && (
                <button onClick={() => removeItem(itemIdx)} className="ml-1 opacity-50 hover:opacity-100"><X size={14} /></button>
              )}
            </div>
          );
        })}
      </div>

      {/* Available items */}
      {!revealed && (
        <div className="flex flex-wrap gap-2">
          {question.items.map((item, i) => {
            const used = order.includes(i);
            return (
              <button key={i} onClick={() => addItem(i)} disabled={used}
                className="px-3 py-2 rounded-xl text-sm font-medium transition-all"
                style={{
                  background: used ? "var(--cn-bg)" : "var(--cn-card)",
                  border: `1px solid ${used ? "var(--cn-border)" : CN.blue}`,
                  color: used ? "var(--cn-muted)" : CN.blue,
                  opacity: used ? 0.5 : 1,
                  cursor: used ? "default" : "pointer",
                }}>
                {item}
              </button>
            );
          })}
        </div>
      )}

      {revealed && (
        <div className="rounded-xl px-4 py-3 text-sm"
          style={{ background: isCorrectOrder ? CN.green + "15" : CN.red + "10", border: `1px solid ${isCorrectOrder ? CN.green : CN.red}` }}>
          <p className="font-bold mb-1" style={{ color: isCorrectOrder ? CN.green : CN.red }}>
            {isCorrectOrder ? "Perfect order!" : "Correct order was:"}
          </p>
          {!isCorrectOrder && question.correctOrder.map((idx, pos) => (
            <p key={pos} className="text-xs" style={{ color: "var(--cn-text)" }}>
              {pos + 1}. {question.items[idx]}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Open Answer ----
function OpenAnswer({
  question,
  value,
  onChange,
  revealed,
}: {
  question: OpenAnswerQuestion;
  value: string;
  onChange: (v: string) => void;
  revealed: boolean;
}) {
  const isCorrect = revealed && question.acceptedAnswers.some(
    (a) => a.toLowerCase().trim() === value.toLowerCase().trim()
  );

  return (
    <div className="flex flex-col gap-3">
      {question.hint && !revealed && (
        <p className="text-xs px-3 py-2 rounded-lg" style={{ background: CN.yellow + "20", color: "var(--cn-text)", border: `1px solid ${CN.yellow}` }}>
          💡 Hint: {question.hint}
        </p>
      )}
      <input
        type="text"
        placeholder="Type your answer here..."
        value={value}
        onChange={(e) => !revealed && onChange(e.target.value)}
        readOnly={revealed}
        className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
        style={{
          background: revealed ? (isCorrect ? CN.green + "15" : CN.red + "10") : "var(--cn-bg)",
          border: `2px solid ${revealed ? (isCorrect ? CN.green : CN.red) : "var(--cn-border)"}`,
          color: "var(--cn-text)",
        }}
        onFocus={(e) => { if (!revealed) e.target.style.borderColor = CN.blue; }}
        onBlur={(e) => { if (!revealed) e.target.style.borderColor = "var(--cn-border)"; }}
      />
      {revealed && (
        <p className="text-sm font-semibold" style={{ color: isCorrect ? CN.green : CN.red }}>
          {isCorrect ? "✓ Correct!" : `✗ Accepted answers: ${question.acceptedAnswers.join(", ")}`}
        </p>
      )}
    </div>
  );
}

// =============================================================
// RESULTS SCREEN
// =============================================================
function ResultsScreen({
  score,
  total,
  passingScore,
  topicTitle,
  onRetry,
  onBack,
}: {
  score: number;
  total: number;
  passingScore: number;
  topicTitle: string;
  onRetry: () => void;
  onBack: () => void;
}) {
  const percentage = Math.round((score / total) * 100);
  const passed = percentage >= passingScore;

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "var(--cn-page)" }}>
      <div className="max-w-md w-full text-center">

        {/* Big icon */}
        <div className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6"
          style={{ background: passed ? CN.green + "20" : CN.red + "15" }}>
          {passed
            ? <Trophy size={40} style={{ color: CN.green }} />
            : <AlertCircle size={40} style={{ color: CN.red }} />}
        </div>

        {/* Pass / Fail */}
        <h1 className="text-3xl font-black mb-2" style={{ color: passed ? CN.green : CN.red }}>
          {passed ? "You Passed! 🎉" : "Not quite yet"}
        </h1>
        <p className="text-sm mb-8" style={{ color: "var(--cn-muted)" }}>
          {passed
            ? `You unlocked "${topicTitle}" — great work!`
            : `You need ${passingScore}% to pass. Keep studying and try again!`}
        </p>

        {/* Score card */}
        <div className="rounded-2xl p-6 mb-8" style={{ background: "var(--cn-card)", border: "1px solid var(--cn-border)" }}>
          <p className="text-5xl font-black mb-1" style={{ color: passed ? CN.green : CN.red }}>
            {percentage}%
          </p>
          <p className="text-sm" style={{ color: "var(--cn-muted)" }}>
            {score} / {total} points · passing score {passingScore}%
          </p>

          {/* Progress bar */}
          <div className="w-full rounded-full h-3 mt-4 overflow-hidden" style={{ background: "var(--cn-border)" }}>
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${percentage}%`, background: passed ? CN.green : CN.red }} />
          </div>

          {/* Passing line indicator */}
          <div className="relative mt-1">
            <div className="absolute text-xs font-bold" style={{ left: `${passingScore}%`, color: "var(--cn-muted)", transform: "translateX(-50%)" }}>
              |{passingScore}%
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex flex-col gap-3">
          <button onClick={onBack}
            className="w-full py-3 rounded-xl font-bold text-white text-sm transition-all"
            style={{ background: CN.blue }}>
            {passed ? "Back to Learning Path" : "Back to Study Material"}
          </button>
          {!passed && (
            <button onClick={onRetry}
              className="w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2"
              style={{ background: "var(--cn-card)", border: `1px solid var(--cn-border)`, color: "var(--cn-text)" }}>
              <RotateCcw size={16} /> Try Again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================
// MAIN QUIZ PAGE
// =============================================================
export default function Quiz() {
  const navigate = useNavigate();
  const { topicId } = useParams();

  // In real life: fetch quiz from API using topicId
  // const quiz = await fetch(`/api/quizzes/${topicId}`)
  const quiz = MOCK_QUIZ;

  const [currentIdx, setCurrentIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [finished, setFinished] = useState(false);
  const [earnedPoints, setEarnedPoints] = useState(0);

  // Per-question answer state
  const [mcAnswer, setMcAnswer] = useState<number | null>(null);
  const [msAnswers, setMsAnswers] = useState<number[]>([]);
  const [tfAnswer, setTfAnswer] = useState<boolean | null>(null);
  const [reorderAnswer, setReorderAnswer] = useState<number[]>([]);
  const [openAnswer, setOpenAnswer] = useState("");

  const question = quiz.questions[currentIdx];
  const totalPoints = quiz.questions.reduce((sum, q) => sum + q.points, 0);
  const progress = ((currentIdx + 1) / quiz.questions.length) * 100;

  const resetAnswers = () => {
    setMcAnswer(null);
    setMsAnswers([]);
    setTfAnswer(null);
    setReorderAnswer([]);
    setOpenAnswer("");
    setRevealed(false);
  };

  const hasAnswer = () => {
    switch (question.type) {
      case "multiple_choice": return mcAnswer !== null;
      case "multiple_select": return msAnswers.length > 0;
      case "true_false": return tfAnswer !== null;
      case "reorder": return reorderAnswer.length === (question as any).items.length;
      case "open_answer": return openAnswer.trim().length > 0;
    }
  };

  const calculatePoints = (q: Question): number => {
    switch (q.type) {
      case "multiple_choice":
        return mcAnswer === (q as MultipleChoiceQuestion).correctIndex ? q.points : 0;
      case "multiple_select": {
        const correct = (q as MultipleSelectQuestion).correctIndices;
        const allCorrect = correct.every((i) => msAnswers.includes(i)) && msAnswers.every((i) => correct.includes(i));
        return allCorrect ? q.points : 0;
      }
      case "true_false":
        return tfAnswer === (q as TrueFalseQuestion).correctAnswer ? q.points : 0;
      case "reorder": {
        const ro = q as ReorderQuestion;
        const correct = reorderAnswer.length === ro.correctOrder.length && reorderAnswer.every((v, i) => v === ro.correctOrder[i]);
        return correct ? q.points : 0;
      }
      case "open_answer": {
        const oa = q as OpenAnswerQuestion;
        return oa.acceptedAnswers.some((a) => a.toLowerCase().trim() === openAnswer.toLowerCase().trim()) ? q.points : 0;
      }
    }
  };

  const handleCheck = () => {
    if (!hasAnswer()) return;
    const pts = calculatePoints(question);
    setEarnedPoints((prev) => prev + pts);
    setRevealed(true);
  };

  const handleNext = () => {
    if (currentIdx < quiz.questions.length - 1) {
      setCurrentIdx(currentIdx + 1);
      resetAnswers();
    } else {
      setFinished(true);
    }
  };

  const handleRetry = () => {
    setCurrentIdx(0);
    setEarnedPoints(0);
    setFinished(false);
    resetAnswers();
  };

  if (finished) {
    return (
      <ResultsScreen
        score={earnedPoints}
        total={totalPoints}
        passingScore={quiz.passingScore}
        topicTitle={quiz.topicTitle}
        onRetry={handleRetry}
        onBack={() => navigate("/playground")}
      />
    );
  }

  return (
    <div className="min-h-screen transition-colors duration-200" style={{ background: "var(--cn-page)" }}>
      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* TOP BAR */}
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => navigate("/playground")}
            className="flex items-center gap-1.5 text-sm font-medium transition-colors"
            style={{ color: "var(--cn-muted)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = CN.blue)}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--cn-muted)")}>
            <ArrowLeft size={15} /> Exit Quiz
          </button>
          <p className="text-sm font-semibold" style={{ color: "var(--cn-muted)" }}>
            {currentIdx + 1} / {quiz.questions.length}
          </p>
        </div>

        {/* PROGRESS BAR */}
        <div className="w-full rounded-full h-2 mb-6 overflow-hidden" style={{ background: "var(--cn-border)" }}>
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${progress}%`, background: CN.yellow }} />
        </div>

        {/* TOPIC TITLE */}
        <p className="text-xs font-bold uppercase mb-2" style={{ color: CN.blue, letterSpacing: "0.08em" }}>
          {quiz.topicTitle}
        </p>

        {/* QUESTION CARD */}
        <div className="rounded-2xl p-6 mb-4" style={{ background: "var(--cn-card)", border: "1px solid var(--cn-border)" }}>

          {/* Question type badge */}
          <span className="inline-block text-xs font-bold px-2 py-1 rounded-full mb-4"
            style={{ background: CN.blue + "15", color: CN.blue }}>
            {question.type === "multiple_choice" && "Choose one"}
            {question.type === "multiple_select" && "Select all that apply"}
            {question.type === "true_false" && "True or False"}
            {question.type === "reorder" && "Put in order"}
            {question.type === "open_answer" && "Open answer"}
          </span>

          {/* Question text */}
          <h2 className="text-base sm:text-lg font-bold mb-6" style={{ color: "var(--cn-text)" }}>
            {question.question}
          </h2>

          {/* Question renderer */}
          {question.type === "multiple_choice" && (
            <MultipleChoice
              question={question as MultipleChoiceQuestion}
              selected={mcAnswer}
              onSelect={setMcAnswer}
              revealed={revealed}
            />
          )}
          {question.type === "multiple_select" && (
            <MultipleSelect
              question={question as MultipleSelectQuestion}
              selected={msAnswers}
              onToggle={(i) => setMsAnswers((prev) => prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i])}
              revealed={revealed}
            />
          )}
          {question.type === "true_false" && (
            <TrueFalse
              question={question as TrueFalseQuestion}
              selected={tfAnswer}
              onSelect={setTfAnswer}
              revealed={revealed}
            />
          )}
          {question.type === "reorder" && (
            <Reorder
              question={question as ReorderQuestion}
              order={reorderAnswer}
              onReorder={setReorderAnswer}
              revealed={revealed}
            />
          )}
          {question.type === "open_answer" && (
            <OpenAnswer
              question={question as OpenAnswerQuestion}
              value={openAnswer}
              onChange={setOpenAnswer}
              revealed={revealed}
            />
          )}
        </div>

        {/* EXPLANATION — shown after checking */}
        {revealed && (
          <div className="rounded-xl px-4 py-3 mb-4 text-sm"
            style={{ background: "var(--cn-bg)", border: "1px solid var(--cn-border)" }}>
            <p className="font-bold mb-1" style={{ color: "var(--cn-text)" }}>Explanation</p>
            <p style={{ color: "var(--cn-muted)" }}>{question.explanation}</p>
          </div>
        )}

        {/* POINTS */}
        <div className="flex items-center justify-between mb-6">
          <span className="text-xs" style={{ color: "var(--cn-muted)" }}>
            This question: <span className="font-bold" style={{ color: "var(--cn-text)" }}>{question.points} pts</span>
          </span>
          <span className="text-xs" style={{ color: "var(--cn-muted)" }}>
            Score so far: <span className="font-bold" style={{ color: CN.blue }}>{earnedPoints} / {totalPoints} pts</span>
          </span>
        </div>

        {/* ACTION BUTTONS */}
        <div className="flex gap-3">
          {!revealed ? (
            <button onClick={handleCheck} disabled={!hasAnswer()}
              className="flex-1 py-3 rounded-xl font-bold text-white text-sm transition-all disabled:opacity-40"
              style={{ background: CN.blue }}>
              Check Answer
            </button>
          ) : (
            <button onClick={handleNext}
              className="flex-1 py-3 rounded-xl font-bold text-white text-sm transition-all flex items-center justify-center gap-2"
              style={{ background: currentIdx === quiz.questions.length - 1 ? CN.green : CN.blue }}>
              {currentIdx === quiz.questions.length - 1 ? "See Results" : "Next Question"}
              <ArrowRight size={16} />
            </button>
          )}
        </div>

      </div>
    </div>
  );
}