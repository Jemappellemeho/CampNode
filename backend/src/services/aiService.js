const axios = require("axios");

// Runtime provider configuration (env-driven with safe defaults).
const DEFAULT_PROVIDER = (process.env.AI_PROVIDER || "groq").trim().toLowerCase();
const GROQ_BASE_URL = (process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/$/, "");
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
const MAX_INPUT_CHARS = Number(process.env.AI_MAX_INPUT_CHARS || 6500);
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 60000);
const AI_TEMPERATURE = Number(process.env.AI_TEMPERATURE || 0.7);
const QUIZ_REPAIR_ENABLED = String(process.env.QUIZ_REPAIR_ENABLED || "false").trim().toLowerCase() === "true";
const QUIZ_QUESTION_COUNT = 10;
const QUIZ_TYPES = ["multiple_choice", "true_false", "multiple_select", "reorder", "open_answer"];
const GENERIC_QUESTION_PATTERNS = [
  "the source mentions",
  "which of these terms appear in the source",
  "order the key ideas from the source",
  "name one key idea from the source",
  "which concept is most central",
  "what is the primary goal of",
  "which layer usually handles",
  "what is the biggest risk here",
];
const GENERIC_KEYWORDS = new Set([
  "case",
  "cases",
  "diagram",
  "diagrams",
  "system",
  "user",
  "users",
  "overview",
  "concept",
  "details",
  "application",
]);

// Common stopwords used by keyword extraction and fuzzy deduplication.
const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "are", "was", "were", "been", "have", "has",
  "had", "into", "over", "under", "your", "their", "there", "about", "what", "when", "where", "which",
  "will", "would", "could", "should", "can", "may", "might", "than", "then", "them", "they", "his", "her",
  "our", "you", "but", "not", "all", "any", "more", "most", "some", "such", "only", "each", "also",
  "here", "while", "because", "between", "after", "before", "through", "during", "these", "those", "who",
  "whom", "whose", "how", "why", "theirs", "ours", "it", "its", "is", "am", "be", "as", "at", "by",
  "of", "on", "or", "to", "in", "a", "an"
]);

// Keep prompts bounded so free-tier providers are less likely to hit token limits.
function truncateContent(content) {
  const text = typeof content === "string" ? content.trim() : "";
  if (!text) return "";
  return text.length > MAX_INPUT_CHARS ? text.slice(0, MAX_INPUT_CHARS) : text;
}

function stripCodeFences(text) {
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

function parseJsonArray(text) {
  const cleaned = stripCodeFences(text);
  const firstBracket = cleaned.indexOf("[");
  const lastBracket = cleaned.lastIndexOf("]");
  const candidate = firstBracket >= 0 && lastBracket >= 0 ? cleaned.slice(firstBracket, lastBracket + 1) : cleaned;
  return JSON.parse(candidate);
}

// Shared shuffle helper used for options, reorder payloads, and fallback generation.
function shuffleArray(items) {
  const copy = Array.isArray(items) ? [...items] : [];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

// Deduplication utilities for cleaning provider output and building compact units
function dedupeStrings(values = []) {
  const seen = new Set();
  return values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

// Normalize text so semantically similar phrases can be deduplicated
function normalizeKeyword(word) {
  return String(word || "")
    .toLowerCase()
    .replace(/^['-]+|['-]+$/g, "")
    .replace(/(?:ing|ed|es|s)$/i, "");
}

function normalizePhrase(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !STOPWORDS.has(token))
    .map((token) => normalizeKeyword(token))
    .filter(Boolean)
    .join(" ");
}

function dedupeByMeaning(values = []) {
  const seen = new Set();
  return values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
    .filter((value) => {
      const key = normalizePhrase(value) || value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

// Heuristic filters to prevent placeholder or irrelevant content from polluting quizzes
function isPlaceholderText(value) {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!text) return true;

  return (
    /^option\s+\d+$/.test(text)
    || /^step\s+\d+$/.test(text)
    || /^question\s+\d+$/.test(text)
    || /^extra concept\s+\d+$/.test(text)
    || text === "general background"
    || text === "answer unavailable"
  );
}

// Quick check to see if any values look like placeholders before including them in the quiz.
function hasPlaceholderValues(values = []) {
  return values.some((value) => isPlaceholderText(value));
}

// Clamp numeric question points to a reasonable range and default to 10 for invalid input.
function clampPoints(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 10;
  return Math.min(100, Math.max(1, Math.round(numeric)));
}

// Capitalize the first letter of a word and trim it, with a safe default.
function capitalize(value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "Concept";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Extract sentences from the content, filtering out very short ones 
// and limiting total count to keep prompts focused.
function extractSentences(content) {
  return truncateContent(content)
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 40)
    .slice(0, 20);
}

function shortenSentence(sentence, maxLength = 140) {
  const text = String(sentence || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= maxLength) return text;

  const clipped = text.slice(0, maxLength);
  const lastBoundary = Math.max(clipped.lastIndexOf(","), clipped.lastIndexOf(" "), clipped.lastIndexOf(";"));
  return `${clipped.slice(0, lastBoundary > 40 ? lastBoundary : maxLength).trim()}...`;
}

// Remove common leading connectors to improve the quality of standalone statements.
function removeLeadingConnectors(text) {
  return String(text || "")
    .replace(/^(however|therefore|thus|moreover|furthermore|for example|for instance|in addition|meanwhile|instead|overall|specifically)\s*,?\s+/i, "")
    .trim();
}

// Break complex sentences into standalone fragments that can be used as quiz options or explanations.
function sentenceFragments(sentence) {
  const clean = removeLeadingConnectors(sentence)
    .replace(/[()]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return clean
    .split(/[,:;]|\s(?:because|which|that|while|whereas|although|including)\s/i)
    .map((fragment) => fragment.trim())
    .filter((fragment) => countMeaningfulWords(fragment) >= 4)
    .map((fragment) => fragment.replace(/[.]+$/g, "").trim());
}

// Count words that are not stopwords to determine if a sentence or fragment has enough substance to be a quiz option.
function toOptionStatement(text) {
  const clean = shortenSentence(removeLeadingConnectors(text), 120).replace(/[.]+$/g, "").trim();
  if (!clean) return "";
  return /[.!?]$/.test(clean) ? clean : `${clean}.`;
}

// Count words that are not stopwords to determine if a sentence has enough substance to be a quiz option.
function buildKeywordStatements(keywords = [], topicName = "") {
  return dedupeByMeaning(
    keywords
      .filter((keyword) => !GENERIC_KEYWORDS.has(String(keyword || "").toLowerCase()))
      .map((keyword, index) => [
        `${capitalize(keyword)} is one of the ideas emphasized in ${topicName}.`,
        `${capitalize(keyword)} helps explain part of ${topicName}.`,
        `${capitalize(keyword)} appears as a relevant concept in this lesson.`,
      ][index % 3])
  );
}

// Build compact source excerpt to reduce prompt size and keep topical context.
function buildSourceExcerpt(topicName, content) {
  // Extract only the most topical slices instead of sending the full source every time.
  const safeTopicName = capitalize(topicName || "General Knowledge");
  const sentences = extractSentences(content);
  const keywords = extractKeywords(content, 10);
  const topicTokens = dedupeByMeaning([safeTopicName, ...keywords]).map((item) => item.toLowerCase());
  const scored = sentences.map((sentence, index) => {
    const lower = sentence.toLowerCase();
    const topicalMatches = topicTokens.filter((token) => token && lower.includes(token)).length;
    const hasListLikeStructure = /[:,;]/.test(sentence) ? 1 : 0;
    const score = topicalMatches * 3 + hasListLikeStructure + Math.min(3, Math.floor(countMeaningfulWords(sentence) / 12));
    return { sentence, index, score };
  });

  const selected = scored
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, 8)
    .sort((left, right) => left.index - right.index)
    .map((entry) => shortenSentence(entry.sentence, 220));

  const excerpt = selected.join(" ");
  return truncateContent(excerpt || content || safeTopicName);
}

// Build lightweight local knowledge units reused by fallback quiz generation.
function buildConceptCards(topicName, content) {
  // Turn raw source text into reusable concept cards for local fallback generation.
  const safeTopicName = capitalize(topicName || "General Knowledge");
  const keywords = extractKeywords(content, 18);
  const sentences = extractSentences(content);
  const cards = sentences.map((sentence, sentenceIndex) => buildConceptCardFromSentence(sentence, sentenceIndex, keywords, safeTopicName));

  if (!cards.length) {
    return buildKeywordFallbackCards(keywords, safeTopicName);
  }

  return cards;
}

// Extract keywords by frequency while filtering out stopwords 
// and short terms, to build a topical keyword bank for quiz generation.
function extractKeywords(content, limit = 12) {
  const words = truncateContent(content)
    .toLowerCase()
    .match(/[a-z0-9À-ÿ'-]+/g) || [];

  const frequencies = new Map();
  for (const word of words) {
    const normalized = word.replace(/^['-]+|['-]+$/g, "");
    if (normalized.length < 4 || STOPWORDS.has(normalized)) continue;
    frequencies.set(normalized, (frequencies.get(normalized) || 0) + 1);
  }

  return [...frequencies.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([word]) => capitalize(word))
    .slice(0, limit);
}

// Build one reusable card from a single sentence.
function buildConceptCardFromSentence(sentence, sentenceIndex, keywords, safeTopicName) {
  const sentenceLower = sentence.toLowerCase();
  const fragments = sentenceFragments(sentence);
  const matchingKeywords = keywords
    .filter((keyword) => sentenceLower.includes(keyword.toLowerCase()))
    .filter((keyword) => !GENERIC_KEYWORDS.has(String(keyword || "").toLowerCase()))
    .slice(0, 3);
  const answerStatement = toOptionStatement(shortenSentence(sentence, 150));
  const fragmentOptions = fragments
    .map((fragment) => toOptionStatement(fragment))
    .filter((fragment) => fragment.toLowerCase() !== answerStatement.toLowerCase());
  const keywordOptions = keywords
    .filter((keyword) => !matchingKeywords.includes(keyword))
    .filter((keyword) => !GENERIC_KEYWORDS.has(String(keyword || "").toLowerCase()))
    .slice(0, 4)
    .map((keyword) => `${capitalize(keyword)} is mentioned nearby, but it is not the best explanation here.`);

  return {
    id: `sentence-${sentenceIndex}`,
    sentence,
    answer: answerStatement,
    summary: shortenSentence(sentence, 90),
    keywords: dedupeByMeaning(matchingKeywords.length ? matchingKeywords : keywords.slice(sentenceIndex, sentenceIndex + 3)),
    distractors: dedupeByMeaning([...fragmentOptions, ...keywordOptions]).slice(0, 5),
    fragments,
  };
}

// Build a keyword-only fallback when the source has no usable sentences.
function buildKeywordFallbackCards(keywords, safeTopicName) {
  return keywords.map((keyword, keywordIndex) => ({
    id: `keyword-${keywordIndex}`,
    sentence: `${keyword} is one of the important ideas in ${safeTopicName}.`,
    answer: `${keyword} is one of the important ideas in ${safeTopicName}.`,
    summary: `${keyword} is one of the important ideas in ${safeTopicName}.`,
    keywords: [keyword],
    distractors: keywords
      .filter((candidate) => candidate !== keyword)
      .slice(0, 4)
      .map((candidate) => `${candidate} is related, but it does not best complete this statement.`),
    fragments: [],
  }));
}

// Hard fallback if source is too weak and remote AI is unavailable.
function createMockQuiz(topicName) {
  // Last-resort emergency quiz when the source is too weak for a content-aware fallback.
  return [
    { type: "multiple_choice", question: `What is the primary goal of ${topicName}?`, options: ["Efficiency", "Redundancy", "Latency", "Storage"], correctIndex: 0, explanation: "Efficiency is the main driver.", points: 10 },
    { type: "true_false", question: `Is ${topicName} a modern industry standard?`, correctAnswer: true, explanation: "Yes, it is widely adopted.", points: 10 },
    { type: "multiple_select", question: "Which benefits apply? (Select all)", options: ["Speed", "Security", "Bloat", "Scalability"], correctIndices: [0, 1, 3], explanation: "Speed, Security, and Scalability are key.", points: 10 },
    { type: "reorder", question: "Order the standard implementation steps:", items: ["Setup", "Logic", "Test", "Deploy"], correctOrder: [0, 1, 2, 3], explanation: "Standard dev lifecycle flow.", points: 10 },
    { type: "open_answer", question: "What is the common 4-letter acronym for database operations?", acceptedAnswers: ["CRUD"], hint: "C_U_.", explanation: "CRUD stands for Create, Read, Update, Delete.", points: 10 },
    { type: "multiple_choice", question: `Which layer usually handles ${topicName}?`, options: ["Application", "Data", "Presentation", "Transport"], correctIndex: 0, explanation: "Usually handled at the logic/app layer.", points: 10 },
    { type: "true_false", question: "Does this concept increase system technical debt?", correctAnswer: false, explanation: "When implemented correctly, it reduces long-term debt.", points: 10 },
    { type: "multiple_select", question: "Common tools used here include:", options: ["React", "Node.js", "SQL", "Docker"], correctIndices: [0, 1, 2], explanation: "Standard full-stack tools apply.", points: 10 },
    { type: "reorder", question: "Order by execution priority:", items: ["Input", "Parse", "Execute", "Return"], correctOrder: [0, 1, 2, 3], explanation: "Data must be parsed before execution.", points: 10 },
    { type: "open_answer", question: "What 'S' in SOLID stands for Single Responsibility?", acceptedAnswers: ["Single"], hint: "Opposite of Multiple.", explanation: "The S stands for Single Responsibility Principle.", points: 10 },
    { type: "multiple_choice", question: "What is the biggest risk here?", options: ["Data Loss", "High Cost", "Slow UI", "Memory Leak"], correctIndex: 0, explanation: "Data integrity is always the highest risk.", points: 10 },
    { type: "true_false", question: "Is documentation optional for this process?", correctAnswer: false, explanation: "Documentation is critical for maintenance.", points: 10 },
    { type: "multiple_select", question: "Which environments should this run in?", options: ["Dev", "Staging", "Prod", "None"], correctIndices: [0, 1, 2], explanation: "All environments must be synced.", points: 10 },
    { type: "reorder", question: "Order these by complexity (Simple to Hard):", items: ["Variable", "Function", "Class", "Module"], correctOrder: [0, 1, 2, 3], explanation: "Hierarchy of code complexity.", points: 10 },
    { type: "open_answer", question: "What is the short name for a Web Application Interface?", acceptedAnswers: ["API"], hint: "A_I.", explanation: "API is the standard term.", points: 10 }
  ];
}

// Reorder payload formatter keeps UI items shuffled while answer stays solvable.
function buildShuffledOrderPayload(items = []) {
  // Reorder questions should be displayed already shuffled, not in the solved order.
  const logicalItems = dedupeStrings(items).filter((item) => !isPlaceholderText(item)).slice(0, 4);
  if (logicalItems.length < 3) {
    return {
      items: ["Step 1", "Step 2", "Step 3"],
      correctOrder: [0, 1, 2],
    };
  }

  let presentedItems = shuffleArray(logicalItems);
  let attempts = 0;
  while (attempts < 6 && presentedItems.every((item, index) => item === logicalItems[index])) {
    presentedItems = shuffleArray(logicalItems);
    attempts += 1;
  }

  if (presentedItems.every((item, index) => item === logicalItems[index]) && logicalItems.length >= 2) {
    presentedItems = [...logicalItems];
    [presentedItems[0], presentedItems[1]] = [presentedItems[1], presentedItems[0]];
  }
  return {
    items: presentedItems,
    correctOrder: logicalItems.map((item) => presentedItems.indexOf(item)),
  };
}

// Build the payload for a reorder question, ensuring the presented order
//  is shuffled but the correct order is still identifiable.
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

// Main local quiz synthesizer used when provider output is weak or fails.
function buildContentAwareQuiz(topicName, content) {
  // Local fallback generator used when the external AI provider fails or returns weak output.
  const safeTopicName = capitalize(topicName || "General Knowledge");
  const cards = buildConceptCards(safeTopicName, content);
  const keywords = extractKeywords(content, 20);
  const seedKeywords = dedupeByMeaning([safeTopicName, ...keywords, "Overview", "Concept", "Details", "Application"])
    .filter((keyword, index, collection) => {
      const normalized = normalizeKeyword(keyword);
      return normalized && collection.findIndex((candidate) => normalizeKeyword(candidate) === normalized) === index;
    });

  if (seedKeywords.length < 4 && cards.length < 2) {
    return createMockQuiz(safeTopicName);
  }
  const cardFor = (index) => cards[index % Math.max(cards.length, 1)] || {
    sentence: `The source discusses ${safeTopicName}.`,
    answer: `${safeTopicName} is discussed in the source.`,
    summary: `${safeTopicName} is discussed in the source.`,
    keywords: [safeTopicName],
    distractors: [],
    fragments: [],
  };
  const keywordFor = (index) => seedKeywords[index % seedKeywords.length] || safeTopicName;
  const multipleChoiceStems = [
    `Which statement best explains a core idea in ${safeTopicName}?`,
    `Which interpretation is most consistent with the material on ${safeTopicName}?`,
    "Which conclusion follows most directly from the explanation?",
    "Which option is the best-supported takeaway from the material?",
  ];
  const multipleSelectStems = [
    `Which statements are supported by the lesson on ${safeTopicName}?`,
    "Which points match the explanation given in the material?",
    "Which claims are consistent with the passage?",
  ];
  const trueFalseStems = [
    `${capitalize(safeTopicName)} is described in a way that supports this claim.`,
    "This statement matches the explanation in the material.",
  ];
  const reorderStems = [
    "Arrange these ideas in the order they are explained.",
    "Put these steps or ideas into the order that best matches the passage.",
  ];
  const openAnswerStems = [
    "Which term best completes this idea:",
    "Name one important concept linked to this explanation:",
  ];

  const questions = [];

  for (let index = 0; index < QUIZ_QUESTION_COUNT; index += 1) {
    const typeCycle = ["multiple_choice", "multiple_select", "open_answer", "multiple_choice", "reorder", "multiple_choice", "multiple_select", "open_answer", "multiple_choice", "true_false"];
    const type = typeCycle[index % typeCycle.length];
    const card = cardFor(index);
    const keyword = keywordFor(index);
    const nextKeyword = keywordFor(index + 1);
    const thirdKeyword = keywordFor(index + 2);
    const fourthKeyword = keywordFor(index + 3);
    const sentence = card.sentence;
    const contentHasKeyword = truncateContent(content).toLowerCase().includes(keyword.toLowerCase());
    const correctStatement = card.answer || shortenSentence(sentence, 150);

    if (type === "multiple_choice") {
      const relatedStatements = dedupeByMeaning(
        cards
          .filter((candidate) => candidate.id !== card.id)
          .map((candidate) => candidate.answer)
      ).slice(0, 3);
      const options = dedupeByMeaning([
        correctStatement,
        ...card.distractors,
        ...relatedStatements,
        ...buildKeywordStatements([nextKeyword, thirdKeyword, fourthKeyword], safeTopicName),
      ]).slice(0, 4);

      questions.push({
        type,
        question: multipleChoiceStems[index % multipleChoiceStems.length],
        options,
        correctIndex: 0,
        explanation: shortenSentence(sentence, 180),
        points: 10
      });
      continue;
    }

    if (type === "true_false") {
      questions.push({
        type,
        question: `${trueFalseStems[index % trueFalseStems.length]} ${toOptionStatement(card.answer)}`,
        correctAnswer: contentHasKeyword,
        explanation: shortenSentence(sentence, 180),
        points: 10
      });
      continue;
    }

    if (type === "multiple_select") {
      const possibleCorrectOptions = dedupeByMeaning([
        card.answer,
        ...card.fragments.map((fragment) => toOptionStatement(fragment)),
        ...buildKeywordStatements(card.keywords, safeTopicName),
      ]).filter((option) => countMeaningfulWords(option) >= 4);
      const targetCorrectCount = (index % 3) + 1;
      const selectedCorrectOptions = possibleCorrectOptions.slice(0, targetCorrectCount);
      const distractorPool = dedupeByMeaning([
        ...cards.filter((candidate) => candidate.id !== card.id).map((candidate) => candidate.answer),
        ...buildKeywordStatements(seedKeywords.slice(index, index + 5), safeTopicName),
      ])
        .filter((candidate) => !selectedCorrectOptions.includes(candidate))
        .filter((candidate) => countMeaningfulWords(candidate) >= 4)
        .slice(0, Math.max(2, 5 - selectedCorrectOptions.length));
      const options = dedupeByMeaning([...selectedCorrectOptions, ...distractorPool]).slice(0, 5);

      const correctIndices = options
        .map((option, optionIndex) => (selectedCorrectOptions.includes(option) ? optionIndex : -1))
        .filter((optionIndex) => optionIndex >= 0);

      questions.push({
        type,
        question: multipleSelectStems[index % multipleSelectStems.length],
        options,
        correctIndices: correctIndices.length ? correctIndices : [0],
        explanation: shortenSentence(sentence, 180),
        points: 10
      });
      continue;
    }

    if (type === "reorder") {
      const logicalItems = dedupeByMeaning(card.fragments)
        .filter((item) => countMeaningfulWords(item) >= 4)
        .slice(0, 4);

      if (logicalItems.length < 3) {
        const options = dedupeByMeaning([
          correctStatement,
          ...card.distractors,
          ...cards.filter((candidate) => candidate.id !== card.id).map((candidate) => candidate.answer),
        ]).slice(0, 4);

        questions.push({
          type: "multiple_choice",
          question: multipleChoiceStems[(index + 1) % multipleChoiceStems.length],
          options,
          correctIndex: 0,
          explanation: shortenSentence(sentence, 180),
          points: 10
        });
        continue;
      }

      const { items, correctOrder } = buildShuffledOrderPayload(logicalItems);

      questions.push({
        type,
        question: reorderStems[index % reorderStems.length],
        items,
        correctOrder,
        explanation: shortenSentence(sentence, 180),
        points: 10
      });
      continue;
    }

    questions.push({
      type: "open_answer",
      question: `${openAnswerStems[index % openAnswerStems.length]} ${shortenSentence(sentence, 70)}`,
      acceptedAnswers: dedupeStrings([...card.keywords, keyword, nextKeyword, safeTopicName]),
      hint: shortenSentence(sentence, 80),
      explanation: shortenSentence(sentence, 180),
      points: 10
    });
  }

  return questions;
}

// Output normalizers keep AI and fallback payloads in one frontend contract.
function normalizeQuestion(rawQuestion, index) {
  // Normalize all question payloads so AI output and fallback output share one frontend shape.
  const baseQuestion = typeof rawQuestion?.question === "string"
    ? rawQuestion.question.trim()
    : `Question ${index + 1}`;
  const baseExplanation = typeof rawQuestion?.explanation === "string"
    ? rawQuestion.explanation.trim()
    : "";
  const baseType = QUIZ_TYPES.includes(rawQuestion?.type) ? rawQuestion.type : "multiple_choice";
  const base = {
    type: baseType,
    question: baseQuestion,
    explanation: baseExplanation,
    points: clampPoints(rawQuestion?.points),
  };

  if (baseType === "true_false") {
    return {
      ...base,
      correctAnswer: Boolean(rawQuestion?.correctAnswer),
    };
  }

  if (baseType === "open_answer") {
    const acceptedAnswers = dedupeStrings(rawQuestion?.acceptedAnswers);
    const usableAnswers = acceptedAnswers.filter((answer) => !isPlaceholderText(answer));
    return {
      ...base,
      acceptedAnswers: usableAnswers.length ? usableAnswers : ["Answer unavailable"],
      ...(typeof rawQuestion?.hint === "string" && rawQuestion.hint.trim() ? { hint: rawQuestion.hint.trim() } : {}),
    };
  }

  if (baseType === "reorder") {
    const { items, correctOrder } = buildPresentedReorder(rawQuestion?.items, rawQuestion?.correctOrder);
    return {
      ...base,
      items,
      correctOrder,
    };
  }

  const options = dedupeByMeaning(rawQuestion?.options);
  const usableOptions = options.length >= 2 && !hasPlaceholderValues(options) ? options : ["Option 1", "Option 2", "Option 3", "Option 4"];

  if (baseType === "multiple_select") {
    const rawCorrectIndices = Array.isArray(rawQuestion?.correctIndices)
      ? rawQuestion.correctIndices.filter((value) => Number.isInteger(value))
      : [];
    const optionEntries = usableOptions.map((option, optionIndex) => ({
      option,
      isCorrect: rawCorrectIndices.includes(optionIndex),
    }));
    const shuffledEntries = shuffleArray(optionEntries);
    const correctIndices = shuffledEntries
      .map((entry, entryIndex) => (entry.isCorrect ? entryIndex : -1))
      .filter((entryIndex) => entryIndex >= 0);

    return {
      ...base,
      options: shuffledEntries.map((entry) => entry.option),
      correctIndices: correctIndices.length ? correctIndices : [0],
    };
  }

  const correctIndex = Number.isInteger(rawQuestion?.correctIndex) ? rawQuestion.correctIndex : 0;
  const optionEntries = usableOptions.map((option, optionIndex) => ({
    option,
    isCorrect: optionIndex === correctIndex,
  }));
  const shuffledEntries = shuffleArray(optionEntries);
  const normalizedCorrectIndex = Math.max(0, shuffledEntries.findIndex((entry) => entry.isCorrect));

  return {
    ...base,
    options: shuffledEntries.map((entry) => entry.option),
    correctIndex: normalizedCorrectIndex,
  };
}

// Main entry point for quiz generation, which applies quality checks and fallback logic.
function normalizeQuizPayload(questions, topicName, content) {
  const normalized = Array.isArray(questions)
    ? questions.map((question, index) => normalizeQuestion(question, index))
    : [];

  const unique = normalized.filter((question, index, collection) => {
    const questionKey = question.question.toLowerCase();
    return collection.findIndex((candidate) => candidate.question.toLowerCase() === questionKey) === index;
  });

  const hasTooManyPlaceholders = unique.some((question) => {
    if (Array.isArray(question.options) && hasPlaceholderValues(question.options)) return true;
    if (Array.isArray(question.items) && hasPlaceholderValues(question.items)) return true;
    if (Array.isArray(question.acceptedAnswers) && hasPlaceholderValues(question.acceptedAnswers)) return true;
    return isPlaceholderText(question.question);
  });

  if (unique.length >= 8 && !hasTooManyPlaceholders) {
    return unique.slice(0, QUIZ_QUESTION_COUNT);
  }

  return buildContentAwareQuiz(topicName, content).map((question, index) => normalizeQuestion(question, index));
}

// Quality heuristics decide whether to trigger quiz repair pass.
function getQuestionOptions(question) {
  if (Array.isArray(question?.options)) return question.options;
  if (question?.type === "true_false") return ["True", "False"];
  return [];
}

function countMeaningfulWords(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

function isGenericQuestionText(text) {
  const normalized = String(text || "").trim().toLowerCase();
  if (!normalized) return true;
  return GENERIC_QUESTION_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function hasWeakOptions(question) {
  const options = getQuestionOptions(question);
  if (question?.type === "open_answer" || question?.type === "reorder") return false;
  if (options.length < 2) return true;

  const tooShort = options.filter((option) => countMeaningfulWords(option) <= 2).length;
  return tooShort >= Math.ceil(options.length * 0.75);
}

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
      normalizedQuestions.length < 10
      || genericQuestions >= 3
      || weakOptions >= 4
      || trueFalseCount > 4
      || applicationQuestions < 4
      || uniqueQuestionStarts < Math.max(6, Math.floor(normalizedQuestions.length * 0.6))
    ),
  };
}

function isMissingGroqConfiguration() {
  return !process.env.GROQ_API_KEY;
}

// Convert provider errors to user-readable operational messages.
function getAiErrorMessage(error) {
  const message = error?.message || "Unknown AI error.";
  const normalized = String(message);
  const lower = normalized.toLowerCase();

  if (
    normalized.includes("429")
    || lower.includes("quota exceeded")
    || lower.includes("too many requests")
    || lower.includes("rate limit")
  ) {
    if (lower.includes("groq")) {
      return "Groq rate limit or daily quota exceeded. Wait for the limit window to reset.";
    }

    return "AI provider rate limit or quota exceeded.";
  }

  if (normalized.includes("401") || normalized.includes("403") || lower.includes("api key")) {
    if (lower.includes("groq")) {
      return "Groq API authentication failed. Check the GROQ_API_KEY and project permissions.";
    }

    return "AI provider authentication failed. Check the configured API key.";
  }

  if (lower.includes("groq")) {
    return normalized;
  }

  return normalized;
}

function shouldPropagateAiError(error) {
  const message = getAiErrorMessage(error).toLowerCase();
  return (
    message.includes("authentication failed")
    || message.includes("api key")
  );
}

// Prompt builders for initial generation and optional repair pass.
function buildPrompt({ topicName, content }) {
  const excerpt = buildSourceExcerpt(topicName, content);
  return [
    `Generate exactly ${QUIZ_QUESTION_COUNT} quiz questions in strict JSON array format.`,
    "Use the topic source only. Do not invent facts that are not supported by the source.",
    "Cover the topic broadly and vary difficulty from basic recall to applied understanding.",
    "Use every supported question type at least twice when the source allows it.",
    "Use only these question types: multiple_choice, true_false, multiple_select, reorder, open_answer.",
    "Make the quiz feel varied and non-repetitive.",
    "Avoid repeating the same question openings, sentence patterns, or answer layouts.",
    "Mix factual, conceptual, comparative, cause-and-effect, and scenario-based questions.",
    "Target medium difficulty: not trivial, but still solvable from the source by a student who understood the material.",
    "At least 6 questions should require understanding, comparison, or application, not just recall.",
    "Prefer concrete, content-rich wording over meta phrasing about 'the source' or 'the text'.",
    "Do not ask generic questions like 'The source mentions X' or 'Which terms appear in the source?'.",
    "For multiple-choice and multiple-select questions, make answer options full, plausible statements or specific concepts, not one-word placeholders unless the source genuinely requires a short technical term.",
    "Wrong answers should be believable distractors based on nearby concepts from the topic, not random opposites or obviously silly choices.",
    "Limit true/false questions to no more than 3 unless the source is extremely narrow.",
    "Include at least 3 questions that ask the learner to infer, compare, diagnose, or predict what happens in a scenario.",
    "Use specific details and vocabulary from the source instead of generic textbook wording.",
    "Do not produce multiple questions with nearly identical wording.",
    "Vary the question stems. For example, mix prompts like: why, how, what happens if, which statement best explains, choose the best example, identify the correct sequence.",
    "Each object must include: type, question, explanation, points.",
    "For multiple_choice use: options (4 concrete answer strings), correctIndex (number).",
    "For true_false use: correctAnswer (boolean).",
    "For multiple_select use: options (4 or more concrete answer strings), correctIndices (array of numbers).",
    "For reorder use: items (array of strings in the correct logical order), correctOrder (array of indexes like [0,1,2...]).",
    "For open_answer use: acceptedAnswers (array of acceptable strings) and optional hint.",
    "Write concise, classroom-ready questions.",
    "Make wrong options plausible but clearly incorrect based on the source.",
    "For reorder questions, use meaningful process steps or idea progressions from the source, not generic placeholders.",
    "For open_answer questions, prefer important terms, mechanisms, or examples from the source.",
    "Never use placeholder text such as Option 1, Option 2, Step 1, Question 1, Example A, or similar fillers.",
    "Every option must be a real answer choice with actual content.",
    "Avoid near-duplicate options such as singular/plural forms of the same word.",
    "Do not wrap the result in markdown. Do not add any commentary. Return valid JSON only.",
    `Topic: ${topicName}`,
    `Source content: ${excerpt}`
  ].join("\n");
}

function buildRepairPrompt({ topicName, content, previousQuiz }) {
  const excerpt = buildSourceExcerpt(topicName, content);
  return [
    "Rewrite the quiz from scratch in strict JSON array format.",
    "The previous attempt was too generic, repetitive, or shallow.",
    `Generate exactly ${QUIZ_QUESTION_COUNT} stronger questions using only the source below.`,
    "Do not mention 'the source', 'the text', or 'the article' inside the questions.",
    "Avoid templates like 'The source mentions...' and avoid vocabulary-matching questions.",
    "Use these question types: multiple_choice, true_false, multiple_select, reorder, open_answer.",
    "Use at most 3 true_false questions.",
    "Include at least 6 questions that require explanation, comparison, inference, or application.",
    "Make at least 5 multiple-choice or multiple-select answer sets sentence-length or detail-rich rather than single words.",
    "Use plausible distractors that are close to the topic and force the learner to think.",
    "Avoid near-duplicate options such as singular/plural forms of the same word.",
    "Ensure question openings are varied and not repetitive.",
    "Return valid JSON only.",
    `Topic: ${topicName}`,
    `Source content: ${excerpt}`,
    `Weak previous quiz to improve: ${previousQuiz}`
  ].join("\n");
}

// Provider-specific transport adapters.
async function callGroq(prompt) {
  if (isMissingGroqConfiguration()) {
    throw new Error("GROQ_API_KEY is not configured.");
  }

  const response = await axios.post(
    `${GROQ_BASE_URL}/chat/completions`,
    {
      model: GROQ_MODEL,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: AI_TEMPERATURE,
    },
    {
      timeout: AI_TIMEOUT_MS,
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  const text = response.data?.choices?.[0]?.message?.content;
  if (!text || !String(text).trim()) {
    throw new Error("Groq returned an empty response.");
  }

  return String(text).trim();
}

// Provider router with auto-fallback chain.
async function callAi(prompt) {
  const provider = DEFAULT_PROVIDER;

  if (provider === "groq" || provider === "auto") {
    return callGroq(prompt);
  }

  throw new Error(`Unsupported AI_PROVIDER: ${provider}. Supported: groq (or auto as alias).`);
}

// Local summary fallback when remote generation is unavailable.
function buildFallbackSummary(content, topicName) {
  const safeTopicName = capitalize(topicName || "General Knowledge");
  const sentences = extractSentences(content);
  const keywords = extractKeywords(content, 5);

  if (!sentences.length && !keywords.length) {
    return `Summary: ${safeTopicName} is a topic in the course.`;
  }

  const leadSentence = sentences[0] || `The source explains ${safeTopicName}.`;
  const keywordSentence = keywords.length
    ? `Key ideas include ${keywords.slice(0, 3).join(", ")}.`
    : "";

  return [leadSentence, keywordSentence].filter(Boolean).join(" ");
}

// Public API consumed by controllers/services.
exports.generateSummary = async (content, topicName = "General Knowledge") => {
  const safeContent = truncateContent(content);
  const safeTopicName = (topicName || "General Knowledge").trim() || "General Knowledge";
  if (!safeContent) return "Summary unavailable.";

  try {
    const text = await callAi([
      "Summarize the following source in 3-5 concise sentences.",
      "Focus on the main concepts and avoid fluff.",
      `Source: ${safeContent}`
    ].join("\n"));

    return text ? text.trim() : buildFallbackSummary(safeContent, safeTopicName);
  } catch (error) {
    const errorMessage = getAiErrorMessage(error);
    console.error("AI summary error:", errorMessage);
    if (shouldPropagateAiError(error)) {
      throw new Error(errorMessage);
    }
    return buildFallbackSummary(safeContent, safeTopicName);
  }
};

exports.generateQuiz = async (content, topicName = "General Knowledge") => {
  const safeContent = truncateContent(content);
  const safeTopicName = (topicName || "General Knowledge").trim() || "General Knowledge";

  try {
    const prompt = buildPrompt({ topicName: safeTopicName, content: safeContent || safeTopicName });
    const text = await callAi(prompt);
    if (!text || !text.trim()) throw new Error("AI returned an empty quiz response.");

    const parsed = parseJsonArray(text);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("AI returned an empty quiz payload.");
    }

    const normalized = normalizeQuizPayload(parsed, safeTopicName, safeContent);
    const quality = assessQuizQuality(normalized);

    if (!quality.isWeak) {
      return normalized;
    }

    if (!QUIZ_REPAIR_ENABLED) {
      return normalized;
    }

    const repairPrompt = buildRepairPrompt({
      topicName: safeTopicName,
      content: safeContent || safeTopicName,
      previousQuiz: JSON.stringify(normalized),
    });
    const repairedText = await callAi(repairPrompt);
    if (!repairedText || !repairedText.trim()) {
      return normalized;
    }

    const repairedParsed = parseJsonArray(repairedText);
    if (!Array.isArray(repairedParsed) || repairedParsed.length === 0) {
      return normalized;
    }

    return normalizeQuizPayload(repairedParsed, safeTopicName, safeContent);
  } catch (error) {
    const errorMessage = getAiErrorMessage(error);
    console.error("AI quiz error:", errorMessage);
    if (shouldPropagateAiError(error)) {
      throw new Error(errorMessage);
    }
    return buildContentAwareQuiz(safeTopicName, safeContent).map((question, index) => normalizeQuestion(question, index));
  }
};

// Reserved hook for future prerequisite recommendation logic.
exports.suggestPrerequisites = async () => [];
