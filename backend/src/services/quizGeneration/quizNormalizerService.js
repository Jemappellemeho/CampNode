// Final quiz normalizer.
// It converts raw/generated questions into the stable shape expected by the frontend.
const {
  GENERIC_QUESTION_PATTERNS,
  META_QUESTION_PATTERNS,
  QUIZ_QUESTION_COUNT,
  QUIZ_TYPES,
} = require("./quizNormalizer");

// Build a normalizer with injected text helpers.
function createQuizNormalizer({
  answerAppearsInQuestion,
  buildShuffledOrderPayload,
  clampPoints,
  countMeaningfulWords,
  dedupeByMeaning,
  dedupeOverlappingText,
  dedupeStrings,
  isNearDuplicateText,
  isPlaceholderText,
  shuffleArray,
}) {
  // Normalize reorder items and preserve answer order.
  function buildPresentedReorder(items = [], rawCorrectOrder = []) {
    const sourceItems = dedupeByMeaning(items).filter((item) => !isPlaceholderText(item));
    const orderedItems = sourceItems.length >= 3 ? sourceItems : ["Step 1", "Step 2", "Step 3"];
    const validCorrectOrder = Array.isArray(rawCorrectOrder)
      && rawCorrectOrder.length === orderedItems.length
      && rawCorrectOrder.every((value) => Number.isInteger(value) && value >= 0 && value < orderedItems.length)
        ? rawCorrectOrder
        : orderedItems.map((_item, itemIndex) => itemIndex);
    const logicalItems = validCorrectOrder.map((itemIndex) => orderedItems[itemIndex]).filter(Boolean);

    return buildShuffledOrderPayload(logicalItems);
  }

  // Merge duplicate options without losing correctness.
  function dedupeOptionEntries(entries = []) {
    const result = [];

    for (const entry of entries) {
      const option = typeof entry?.option === "string" ? entry.option.trim() : "";
      if (!option || isPlaceholderText(option)) continue;

      const existingIndex = result.findIndex((candidate) => isNearDuplicateText(candidate.option, option));
      if (existingIndex >= 0) {
        const existing = result[existingIndex];
        result[existingIndex] = {
          option: option.length > existing.option.length ? option : existing.option,
          isCorrect: Boolean(existing.isCorrect || entry.isCorrect),
        };
        continue;
      }

      result.push({ option, isCorrect: Boolean(entry.isCorrect) });
    }

    return result;
  }

  // Normalize one question for frontend rendering.
  function normalizeQuestion(rawQuestion, index, sourceMetadata = null) {
    const baseQuestionRaw = typeof rawQuestion?.question === "string"
      ? rawQuestion.question.trim()
      : "";
    const baseQuestion = baseQuestionRaw && !isPlaceholderText(baseQuestionRaw)
      ? baseQuestionRaw
      : `Question ${index + 1}`;

    const baseExplanationRaw = typeof rawQuestion?.explanation === "string"
      ? rawQuestion.explanation.trim()
      : "";
    const baseExplanation = baseExplanationRaw && !isPlaceholderText(baseExplanationRaw)
      ? baseExplanationRaw
      : "";

    const baseType = QUIZ_TYPES.includes(rawQuestion?.type) ? rawQuestion.type : "multiple_choice";
    const base = {
      type: baseType,
      question: baseQuestion,
      explanation: baseExplanation,
      points: clampPoints(rawQuestion?.points),
    };

    // Keep source provenance hidden from student UI.
    if (sourceMetadata) {
      base._source = sourceMetadata;
    }

    if (baseType === "true_false") {
      return {
        ...base,
        correctAnswer: Boolean(rawQuestion?.correctAnswer),
      };
    }

    // Open answer: clean accepted answers and keep grading settings.
    if (baseType === "open_answer") {
      const acceptedAnswers = dedupeStrings(rawQuestion?.acceptedAnswers);
      const usableAnswers = dedupeOverlappingText(acceptedAnswers)
        .filter((answer) => !isPlaceholderText(answer))
        .filter((answer) => answer.startsWith('@')
          ? !baseQuestion.toLowerCase().includes(answer.toLowerCase())
          : !answerAppearsInQuestion(answer, baseQuestion));
      return {
        ...base,
        acceptedAnswers: usableAnswers.length ? usableAnswers : ["Answer unavailable"],
        gradingMode: rawQuestion?.gradingMode === "all" ? "all" : "any",
        // Open answers can award 0.5 for enough required answers.
        partialCreditEnabled: rawQuestion?.partialCreditEnabled !== false,
        partialCreditThreshold: Number.isFinite(Number(rawQuestion?.partialCreditThreshold))
          ? Math.max(1, Math.round(Number(rawQuestion.partialCreditThreshold)))
          : 1,
        ...(typeof rawQuestion?.hint === "string" && rawQuestion.hint.trim() ? { hint: rawQuestion.hint.trim() } : {}),
      };
    }

    // Reorder: preserve the solved order after shuffling display items.
    if (baseType === "reorder") {
      const { items, correctOrder } = buildPresentedReorder(rawQuestion?.items, rawQuestion?.correctOrder);
      return {
        ...base,
        items,
        correctOrder,
        // Reorder can award 0.5 for enough correctly placed items.
        partialCreditEnabled: rawQuestion?.partialCreditEnabled !== false,
        partialCreditThreshold: Number.isFinite(Number(rawQuestion?.partialCreditThreshold))
          ? Math.max(1, Math.round(Number(rawQuestion.partialCreditThreshold)))
          : Math.max(1, Math.ceil(items.length / 2)),
      };
    }

    // Multiple select: shuffle options and rebuild correct indices.
    if (baseType === "multiple_select") {
      const rawCorrectIndices = Array.isArray(rawQuestion?.correctIndices)
        ? rawQuestion.correctIndices.filter((value) => Number.isInteger(value))
        : [];
      const rawEntries = (Array.isArray(rawQuestion?.options) ? rawQuestion.options : []).map((option, optionIndex) => ({
        option,
        isCorrect: rawCorrectIndices.includes(optionIndex),
      }));
      const optionEntries = dedupeOptionEntries(rawEntries);
      const usableEntries = optionEntries.length >= 2
        ? optionEntries
        : [
          { option: "Option 1", isCorrect: true },
          { option: "Option 2", isCorrect: false },
          { option: "Option 3", isCorrect: false },
          { option: "Option 4", isCorrect: false },
        ];
      const shuffledEntries = shuffleArray(usableEntries);
      const correctIndices = shuffledEntries
        .map((entry, entryIndex) => (entry.isCorrect ? entryIndex : -1))
        .filter((entryIndex) => entryIndex >= 0);

      return {
        ...base,
        options: shuffledEntries.map((entry) => entry.option),
        correctIndices: correctIndices.length ? correctIndices : [0],
        // Multiple-select can award 0.5 for enough correct choices.
        partialCreditEnabled: rawQuestion?.partialCreditEnabled !== false,
        partialCreditThreshold: Number.isFinite(Number(rawQuestion?.partialCreditThreshold))
          ? Math.max(1, Math.round(Number(rawQuestion.partialCreditThreshold)))
          : 1,
      };
    }

    const correctIndex = Number.isInteger(rawQuestion?.correctIndex) ? rawQuestion.correctIndex : 0;
    const rawEntries = (Array.isArray(rawQuestion?.options) ? rawQuestion.options : []).map((option, optionIndex) => ({
      option,
      isCorrect: optionIndex === correctIndex,
    }));
    const optionEntries = dedupeOptionEntries(rawEntries);
    const usableEntries = optionEntries.length >= 2
      ? optionEntries
      : [
        { option: "Option 1", isCorrect: true },
        { option: "Option 2", isCorrect: false },
        { option: "Option 3", isCorrect: false },
        { option: "Option 4", isCorrect: false },
      ];
    if (!usableEntries.some((entry) => entry.isCorrect)) {
      usableEntries[0].isCorrect = true;
    }
    const shuffledEntries = shuffleArray(usableEntries);
    const normalizedCorrectIndex = Math.max(0, shuffledEntries.findIndex((entry) => entry.isCorrect));

    return {
      ...base,
      options: shuffledEntries.map((entry) => entry.option),
      correctIndex: normalizedCorrectIndex,
    };
  }

  // Return visible options for quality checks.
  function getQuestionOptions(question) {
    if (Array.isArray(question?.options)) return question.options;
    if (question?.type === "true_false") return ["True", "False"];
    return [];
  }

  // Detect generic or template-like questions.
  function isGenericQuestionText(text) {
    const normalized = String(text || "").trim().toLowerCase();
    if (!normalized) return true;

    const allPatterns = [...GENERIC_QUESTION_PATTERNS, ...META_QUESTION_PATTERNS];
    return allPatterns.some((pattern) => normalized.includes(pattern));
  }

  // Detect weak answer option sets.
  function hasWeakOptions(question) {
    const options = getQuestionOptions(question);
    if (question?.type === "open_answer" || question?.type === "reorder") return false;
    if (options.length < 2) return true;

    const hasWebLeak = options.some((option) => (
      /https?:\/\/|www\.|!\[[^\]]*\]\(|\[[^\]]+\]\([^)]*\)|\bimage\s*\d*\s*:/i.test(String(option || ""))
    ));
    if (hasWebLeak) return true;

    const metaLike = options.filter((option) => {
      const t = String(option || "").toLowerCase();
      return (
        t.includes("background trivia")
        || t.includes("unrelated to the main material")
        || t.includes("should be ignored")
        || t.includes("replaces every other concept")
        || t.includes("the source mentions")
        || t.includes("which of these terms")
        || t.includes("correct answer")
        || t.includes("incorrect")
        || t.includes("as mentioned")
        || t.includes("nearby")
        || /^option\s*\d+/.test(t)
      );
    }).length;

    if (metaLike >= Math.ceil(options.length * 0.5)) return true;

    const tooShort = options.filter((option) => countMeaningfulWords(option) <= 2).length;
    return tooShort >= Math.ceil(options.length * 0.75);
  }

  // Score the final quiz before returning it.
  function assessQuizQuality(questions = []) {
    const normalizedQuestions = Array.isArray(questions) ? questions : [];
    const genericQuestions = normalizedQuestions.filter((question) => isGenericQuestionText(question?.question)).length;
    const weakOptions = normalizedQuestions.filter((question) => hasWeakOptions(question)).length;
    const trueFalseCount = normalizedQuestions.filter((question) => question?.type === "true_false").length;
    const applicationQuestions = normalizedQuestions.filter((question) => {
      const text = `${question?.question || ""} ${question?.explanation || ""}`.toLowerCase();
      return (
        text.includes("why")
        || text.includes("how")
        || text.includes("best explains")
        || text.includes("scenario")
        || text.includes("happens if")
        || text.includes("most likely")
        || text.includes("because")
        || text.includes("would")
      );
    }).length;
    const uniqueQuestionStarts = new Set(
      normalizedQuestions.map((question) => String(question?.question || "").trim().toLowerCase().split(/\s+/).slice(0, 4).join(" "))
    ).size;

    return {
      total: normalizedQuestions.length,
      genericQuestions,
      weakOptions,
      trueFalseCount,
      applicationQuestions,
      uniqueQuestionStarts,
      isWeak: (
        normalizedQuestions.length < QUIZ_QUESTION_COUNT
        || genericQuestions >= 3
        || weakOptions >= 4
        || trueFalseCount > 4
        || applicationQuestions < 4
        || uniqueQuestionStarts < Math.max(6, Math.floor(normalizedQuestions.length * 0.6))
      ),
    };
  }

  return {
    assessQuizQuality,
    normalizeQuestion,
  };
}

module.exports = { createQuizNormalizer };
