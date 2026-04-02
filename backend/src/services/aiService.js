const axios = require("axios");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const DEFAULT_PROVIDER = (process.env.AI_PROVIDER || "auto").trim().toLowerCase();
const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const OPENROUTER_BASE_URL = (process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, "");
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openrouter/free";
const MAX_INPUT_CHARS = Number(process.env.AI_MAX_INPUT_CHARS || 12000);
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 60000);
const AI_TEMPERATURE = Number(process.env.AI_TEMPERATURE || 0.7);
const QUIZ_TYPES = ["multiple_choice", "true_false", "multiple_select", "reorder", "open_answer"];

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "are", "was", "were", "been", "have", "has",
  "had", "into", "over", "under", "your", "their", "there", "about", "what", "when", "where", "which",
  "will", "would", "could", "should", "can", "may", "might", "than", "then", "them", "they", "his", "her",
  "our", "you", "but", "not", "all", "any", "more", "most", "some", "such", "only", "each", "also",
  "here", "while", "because", "between", "after", "before", "through", "during", "these", "those", "who",
  "whom", "whose", "how", "why", "theirs", "ours", "it", "its", "is", "am", "be", "as", "at", "by",
  "of", "on", "or", "to", "in", "a", "an"
]);

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

function shuffleArray(items) {
  const copy = Array.isArray(items) ? [...items] : [];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

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

function hasPlaceholderValues(values = []) {
  return values.some((value) => isPlaceholderText(value));
}

function clampPoints(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 10;
  return Math.min(100, Math.max(1, Math.round(numeric)));
}

function capitalize(value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "Concept";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function extractSentences(content) {
  return truncateContent(content)
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 40)
    .slice(0, 20);
}

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

function createMockQuiz(topicName) {
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

function takeDistinctFromPool(preferredValues = [], fallbackPool = [], limit = 4) {
  return dedupeStrings([...preferredValues, ...fallbackPool])
    .filter((value) => !isPlaceholderText(value))
    .slice(0, limit);
}

function buildContentAwareQuiz(topicName, content) {
  const safeTopicName = capitalize(topicName || "General Knowledge");
  const keywords = extractKeywords(content, 20);
  const sentences = extractSentences(content);
  const seedKeywords = dedupeStrings([safeTopicName, ...keywords, "Overview", "Concept", "Details", "Application"]);

  if (seedKeywords.length < 4) {
    return createMockQuiz(safeTopicName);
  }

  const sentenceFor = (index) => sentences[index % sentences.length] || `The source discusses ${safeTopicName}.`;
  const keywordFor = (index) => seedKeywords[index % seedKeywords.length] || safeTopicName;

  const questions = [];

  for (let index = 0; index < 15; index += 1) {
    const type = QUIZ_TYPES[index % QUIZ_TYPES.length];
    const keyword = keywordFor(index);
    const nextKeyword = keywordFor(index + 1);
    const thirdKeyword = keywordFor(index + 2);
    const fourthKeyword = keywordFor(index + 3);
    const sentence = sentenceFor(index);
    const contentHasKeyword = truncateContent(content).toLowerCase().includes(keyword.toLowerCase());

    if (type === "multiple_choice") {
      const options = takeDistinctFromPool([
        keyword,
        nextKeyword,
        thirdKeyword,
        fourthKeyword,
      ], seedKeywords, 4);

      questions.push({
        type,
        question: `Which concept is most central to ${safeTopicName} in the source?`,
        options,
        correctIndex: 0,
        explanation: sentence,
        points: 10
      });
      continue;
    }

    if (type === "true_false") {
      questions.push({
        type,
        question: `The source mentions ${keyword}.`,
        correctAnswer: contentHasKeyword,
        explanation: sentence,
        points: 10
      });
      continue;
    }

    if (type === "multiple_select") {
      const options = takeDistinctFromPool([keyword, nextKeyword, thirdKeyword, fourthKeyword], seedKeywords, 4);

      const correctIndices = options
        .map((option, optionIndex) => (truncateContent(content).toLowerCase().includes(option.toLowerCase()) ? optionIndex : -1))
        .filter((optionIndex) => optionIndex >= 0);

      questions.push({
        type,
        question: `Which of these terms appear in the source?`,
        options,
        correctIndices: correctIndices.length ? correctIndices : [0],
        explanation: sentence,
        points: 10
      });
      continue;
    }

    if (type === "reorder") {
      const items = takeDistinctFromPool([keyword, nextKeyword, thirdKeyword, fourthKeyword], seedKeywords, 4);

      questions.push({
        type,
        question: `Order the key ideas from the source.`,
        items,
        correctOrder: [0, 1, 2, 3],
        explanation: sentence,
        points: 10
      });
      continue;
    }

    questions.push({
      type: "open_answer",
      question: `Name one key idea from the source about ${safeTopicName}.`,
      acceptedAnswers: dedupeStrings([keyword, nextKeyword, safeTopicName]),
      hint: sentence.slice(0, 80),
      explanation: sentence,
      points: 10
    });
  }

  return questions;
}

function normalizeQuestion(rawQuestion, index) {
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
    const items = dedupeStrings(rawQuestion?.items);
    const orderedItems = items.length >= 3 && !hasPlaceholderValues(items) ? items : ["Step 1", "Step 2", "Step 3"];
    const correctOrder = Array.isArray(rawQuestion?.correctOrder)
      && rawQuestion.correctOrder.length === orderedItems.length
      && rawQuestion.correctOrder.every((value) => Number.isInteger(value) && value >= 0 && value < orderedItems.length)
        ? rawQuestion.correctOrder
        : orderedItems.map((_item, itemIndex) => itemIndex);
    return {
      ...base,
      items: orderedItems,
      correctOrder,
    };
  }

  const options = dedupeStrings(rawQuestion?.options);
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
    return unique.slice(0, 15);
  }

  return buildContentAwareQuiz(topicName, content).map((question, index) => normalizeQuestion(question, index));
}

function isMissingGeminiConfiguration() {
  return !process.env.GEMINI_API_KEY;
}

function isMissingOpenRouterConfiguration() {
  return !process.env.OPENROUTER_API_KEY;
}

function getAiErrorMessage(error) {
  const message = error?.message || "Unknown AI error.";
  const normalized = String(message);

  if (
    normalized.includes("429")
    || normalized.toLowerCase().includes("quota exceeded")
    || normalized.toLowerCase().includes("too many requests")
    || normalized.toLowerCase().includes("rate limit")
  ) {
    return "Gemini quota exceeded. The API key is valid, but this project currently has no available quota.";
  }

  if (normalized.includes("401") || normalized.includes("403") || normalized.toLowerCase().includes("api key")) {
    return "Gemini API authentication failed. Check whether the API key is valid and attached to the correct project.";
  }

  if (normalized.toLowerCase().includes("openrouter")) {
    return normalized;
  }

  return normalized;
}

function shouldPropagateAiError(error) {
  const message = getAiErrorMessage(error).toLowerCase();
  return (
    message.includes("quota exceeded")
    || message.includes("authentication failed")
    || message.includes("api key")
  );
}

function buildPrompt({ topicName, content }) {
  return [
    "Generate exactly 15 quiz questions in strict JSON array format.",
    "Use the topic source only. Do not invent facts that are not supported by the source.",
    "Cover the topic broadly and vary difficulty from basic recall to applied understanding.",
    "Use every supported question type at least twice when the source allows it.",
    "Use only these question types: multiple_choice, true_false, multiple_select, reorder, open_answer.",
    "Make the quiz feel varied and non-repetitive.",
    "Avoid repeating the same question openings, sentence patterns, or answer layouts.",
    "Mix factual, conceptual, comparative, cause-and-effect, and scenario-based questions.",
    "Target medium difficulty: not trivial, but still solvable from the source by a student who understood the material.",
    "At least 5 questions should require understanding or application, not just recall.",
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
    "Do not wrap the result in markdown. Do not add any commentary. Return valid JSON only.",
    `Topic: ${topicName}`,
    `Source content: ${content}`
  ].join("\n");
}

async function callGemini(prompt) {
  if (isMissingGeminiConfiguration()) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: DEFAULT_MODEL });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

async function callOpenRouter(prompt) {
  if (isMissingOpenRouterConfiguration()) {
    throw new Error("OPENROUTER_API_KEY is not configured.");
  }

  const response = await axios.post(
    `${OPENROUTER_BASE_URL}/chat/completions`,
    {
      model: OPENROUTER_MODEL,
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
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  const text = response.data?.choices?.[0]?.message?.content;
  if (!text || !String(text).trim()) {
    throw new Error("OpenRouter returned an empty response.");
  }

  return String(text).trim();
}

async function callAi(prompt) {
  const provider = DEFAULT_PROVIDER;

  if (provider === "openrouter") {
    return callOpenRouter(prompt);
  }

  if (provider === "gemini") {
    return callGemini(prompt);
  }

  if (provider === "auto") {
    if (process.env.OPENROUTER_API_KEY) {
      try {
        return await callOpenRouter(prompt);
      } catch (openRouterError) {
        if (!process.env.GEMINI_API_KEY) throw openRouterError;
      }
    }

    if (process.env.GEMINI_API_KEY) {
      try {
        return await callGemini(prompt);
      } catch (geminiError) {
        throw geminiError;
      }
    }
  }

  throw new Error(`Unsupported AI_PROVIDER: ${provider}`);
}

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

    return normalizeQuizPayload(parsed, safeTopicName, safeContent);
  } catch (error) {
    const errorMessage = getAiErrorMessage(error);
    console.error("AI quiz error:", errorMessage);
    if (shouldPropagateAiError(error)) {
      throw new Error(errorMessage);
    }
    return buildContentAwareQuiz(safeTopicName, safeContent).map((question, index) => normalizeQuestion(question, index));
  }
};

exports.suggestPrerequisites = async () => [];
