// Server-side quiz grading (B4).
// The correct answers must never be sent to a student's client, so scoring happens here.
// The scoring rules mirror the previous client logic in client/src/pages/Quiz.tsx so that
// grades stay identical to what students saw before.

// Fields that reveal the answer and must be stripped before sending a quiz to a student.
const ANSWER_FIELDS = [
  "correctIndex",
  "correctAnswer",
  "acceptedAnswers",
  "correctIndices",
  "correctOrder",
  "explanation",
];

// Return a student-safe copy of the quiz questions (no correct answers / explanations).
// Keeps everything needed to render and answer: question text, options, items, points, hint, scoring config.
function sanitizeQuestionsForStudent(questions) {
  if (!Array.isArray(questions)) return [];
  return questions.map((question) => {
    const safe = { ...question };
    for (const field of ANSWER_FIELDS) delete safe[field];
    return safe;
  });
}

// Professor-defined points with a safe fallback of 1.
function getQuestionPoints(question) {
  const points = Number(question?.points);
  return Number.isFinite(points) && points > 0 ? points : 1;
}

function normalizeAnswerText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritical marks
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitAnswerItems(value) {
  return String(value || "")
    .split(/[,;\n]+|\s+\/\s+/g)
    .map((item) => normalizeAnswerText(item))
    .filter(Boolean);
}

function buildAnswerGroups(acceptedAnswers) {
  return (Array.isArray(acceptedAnswers) ? acceptedAnswers : [])
    .map((answer) =>
      String(answer || "")
        .split("/")
        .map((variant) => normalizeAnswerText(variant))
        .filter(Boolean)
    )
    .filter((group) => group.length > 0);
}

function getOpenAnswerGradingMode(question, acceptedAnswers) {
  if (question?.gradingMode === "all" || question?.gradingMode === "any") return question.gradingMode;
  const questionText = String(question?.question || "").toLowerCase();
  const asksForOne = /\b(name one|one phrase|which key term|which term|name the|what is|worum|wann|welche[rsmn]? begriff)\b/i.test(questionText);
  if (asksForOne) return "any";
  return acceptedAnswers.length > 1 ? "all" : "any";
}

function getPartialCreditThreshold(question, requiredCount, fallback = 1) {
  const rawThreshold = Number(question?.partialCreditThreshold);
  if (Number.isFinite(rawThreshold) && rawThreshold > 0) {
    return Math.min(requiredCount, Math.max(1, Math.round(rawThreshold)));
  }
  return Math.min(requiredCount, Math.max(1, Math.round(fallback)));
}

// Returns a credit fraction: 1 (full), 0.5 (partial) or 0 (wrong).
function scoreMultipleSelect(selectedIndices, question) {
  const correct = Array.isArray(question?.correctIndices) ? question.correctIndices : [];
  if (!correct.length) return 0;
  const selected = Array.isArray(selectedIndices) ? selectedIndices.map(Number) : [];
  const selectedSet = new Set(selected);
  const matchedCount = correct.filter((index) => selectedSet.has(index)).length;
  if (matchedCount === correct.length && selected.length === correct.length) return 1;
  if (question?.partialCreditEnabled === false) return 0;
  const partialThreshold = getPartialCreditThreshold(question, correct.length);
  return matchedCount >= partialThreshold ? 0.5 : 0;
}

function scoreOpenAnswer(selectedAnswer, acceptedAnswers, question) {
  const normalizedSelected = normalizeAnswerText(selectedAnswer);
  if (!normalizedSelected) return 0;
  const accepted = Array.isArray(acceptedAnswers) ? acceptedAnswers : [];
  const answerGroups = buildAnswerGroups(accepted);
  if (!answerGroups.length) return 0;
  const selectedItems = splitAnswerItems(selectedAnswer);
  const selectedText = ` ${normalizedSelected} `;
  const matchesGroup = (group) =>
    group.some((variant) => {
      const variantText = ` ${variant} `;
      return selectedItems.includes(variant) || selectedText.includes(variantText);
    });
  const mode = getOpenAnswerGradingMode(question, accepted);
  if (mode === "any") return answerGroups.some(matchesGroup) ? 1 : 0;
  const matchedCount = answerGroups.filter(matchesGroup).length;
  if (matchedCount === answerGroups.length) return 1;
  if (question?.partialCreditEnabled === false) return 0;
  const partialThreshold = getPartialCreditThreshold(question, answerGroups.length);
  return matchedCount >= partialThreshold ? 0.5 : 0;
}

function getReorderCorrectItems(question) {
  const sourceItems = Array.isArray(question?.items) ? question.items : [];
  const order = Array.isArray(question?.correctOrder)
    ? question.correctOrder
    : sourceItems.map((_, idx) => idx);
  return order.map((itemIndex) => sourceItems[itemIndex]).filter((item) => item !== undefined && item !== null);
}

function scoreReorder(orderedItems, question) {
  const correctItems = getReorderCorrectItems(question);
  if (!correctItems.length) return 0;
  const submitted = Array.isArray(orderedItems) ? orderedItems : [];
  let correctPositions = 0;
  for (let i = 0; i < submitted.length; i += 1) {
    if (submitted[i] === correctItems[i]) correctPositions += 1;
  }
  if (correctPositions === correctItems.length) return 1;
  if (question?.partialCreditEnabled === false) return 0;
  const partialThreshold = getPartialCreditThreshold(question, correctItems.length, Math.ceil(correctItems.length / 2));
  return correctPositions >= partialThreshold ? 0.5 : 0;
}

// Human-readable correct answer for the post-answer reveal.
// Returns a string, except for reorder where it returns the ordered item array.
function getCorrectAnswerDisplay(question) {
  switch (question?.type) {
    case "multiple_choice":
      return String(question.options?.[question.correctIndex] ?? "");
    case "true_false":
      return question.correctAnswer ? "True" : "False";
    case "open_answer":
      return Array.isArray(question.acceptedAnswers) ? question.acceptedAnswers.join(" / ") : "";
    case "multiple_select": {
      const correct = Array.isArray(question.correctIndices) ? question.correctIndices : [];
      return correct.map((idx) => question.options?.[idx]).filter(Boolean).join(", ");
    }
    case "reorder":
      return getReorderCorrectItems(question);
    default:
      return "";
  }
}

// Grade a single answer. `answer` shape depends on question type:
//   multiple_choice -> number (option index)
//   true_false      -> boolean (chosen value)
//   open_answer     -> string
//   multiple_select -> number[] (selected indices)
//   reorder         -> string[] (ordered items)
function gradeQuestion(question, answer) {
  const maxPoints = getQuestionPoints(question);
  let fraction = 0;

  switch (question?.type) {
    case "multiple_choice":
      fraction = Number(answer) === Number(question.correctIndex) ? 1 : 0;
      break;
    case "true_false":
      fraction = Boolean(answer) === Boolean(question.correctAnswer) ? 1 : 0;
      break;
    case "open_answer":
      fraction = scoreOpenAnswer(String(answer ?? ""), question.acceptedAnswers, question);
      break;
    case "multiple_select":
      fraction = scoreMultipleSelect(answer, question);
      break;
    case "reorder":
      fraction = scoreReorder(answer, question);
      break;
    default:
      fraction = 0;
  }

  const pointsEarned = Math.round(fraction * maxPoints * 100) / 100;
  return {
    correct: fraction >= 1,
    partial: fraction > 0 && fraction < 1,
    pointsEarned,
    maxPoints,
    correctAnswer: getCorrectAnswerDisplay(question),
    explanation: question?.explanation || "",
  };
}

module.exports = {
  sanitizeQuestionsForStudent,
  getQuestionPoints,
  gradeQuestion,
};
