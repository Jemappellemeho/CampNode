// Main quiz generation engine.
// Builds source-grounded quizzes and uses the RAG service when it is available.
const axios = require("axios");
const {
  buildRagQuizPrompts,
  createMockQuiz,
  getMultipleChoiceStem,
  getMultipleSelectStem,
  getReorderStem,
} = require("./quizPrompts");
const { createQuizNormalizer } = require("./quizNormalizerService");

//  CONFIGURATION
// Runtime configuration for the local RAG-backed quiz flow.
const AI_SERVICE_URL = (process.env.AI_SERVICE_URL || "http://localhost:8001").replace(/\/$/, "");
const MAX_INPUT_CHARS = Number(process.env.AI_MAX_INPUT_CHARS || 6500);
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 60000);

const {
  GENERIC_KEYWORDS,
  QUIZ_QUESTION_COUNT,
  STOPWORDS,
  WEAK_SINGLE_ANSWER_TERMS,
} = require("./quizNormalizer");

const {
  answerAppearsInQuestion,
  capitalize,
  clampPoints,
  countMeaningfulWords,
  dedupeByMeaning,
  dedupeOverlappingText,
  dedupeStrings,
  extractSentences,
  isCodeLikeText,
  isExerciseInstructionLine,
  isIncompleteCodeFragment,
  isNearDuplicateText,
  isPlaceholderText,
  isUsableKnowledgeText,
  isUsefulAnswerChoice,
  normalizeKeyword,
  normalizeKnowledgeText,
  normalizePhrase,
  sentenceFragments,
  shortenSentence,
  shuffleArray,
  toOptionStatement,
  truncateContent,
} = require("./quizTextService");

// Remove weak prefixes/suffixes from extracted concept names.
function sanitizeConceptTerm(term) {
  let value = String(term || "")
    .replace(/[.,;:!?]+$/g, "")
    .replace(/^(?:if|when|where|while|because|since|from|into|onto|with|without|to|in|on|as|of|is|are|was|were|be|being|this|that|these|those|here|there|you|we|it|a|an|the|der|die|das|den|dem|des|ein|eine|einer|einem|einen|eines)\s+/i, "")
    .replace(/^(?:appears|allows|throws|indicates|receives|receive|corresponds|correspond|passed)\s+/i, "")
    .replace(/^(?:because|that|which|where)\s+/i, "")
    .trim();

  value = value.replace(/^(?:the|a|an|der|die|das|den|dem|des|ein|eine|einer|einem|einen|eines)\s+/i, "").trim();
  if (!value) return "";

  const normalized = normalizePhrase(value);
  if (!normalized || GENERIC_KEYWORDS.has(normalized)) return "";
  const normalizedTokens = normalized.split(/\s+/).filter(Boolean);
  if (normalizedTokens.length && normalizedTokens.every((token) => GENERIC_KEYWORDS.has(token) || WEAK_SINGLE_ANSWER_TERMS.has(token))) return "";
  if (countMeaningfulWords(value) === 1 && WEAK_SINGLE_ANSWER_TERMS.has(normalized)) return "";
  if (countMeaningfulWords(value) > 5) return "";
  if (/^(?:if|is|are|was|were|be|being|from|into|onto|with|without|to|in|on|as|of|because|appears|allows|throws|indicates|receives|receive|corresponds|passed|passing)\b/i.test(value)) return "";
  if (/\b(?:to the|to use|with a|belongs to|connected to|related to|attempts? to|used with)\b/i.test(value)) return "";

  return capitalize(value);
}

// Find short concept labels inside one source sentence.
function extractConceptTerms(sentence, keywords = []) {
  const text = String(sentence || "");
  const lower = text.toLowerCase();
  const fromKeywords = keywords
    .filter((keyword) => lower.includes(String(keyword || "").toLowerCase()))
    .filter((keyword) => !GENERIC_KEYWORDS.has(String(keyword || "").toLowerCase()));

  const academicPhraseMatches = text.match(/\b[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ-]*(?:\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ-]*){0,3}\s+(?:assessment|therapy|training|protocol|procedure|technique|intervention|contraindication|contraindications|indication|indications|status|device|pattern|restriction|strengthening|mobility|motion|measurement|classification|criteria|mechanism|principle|rule|method|approach|process|framework|model|theory|law|statute|contract|liability|evidence|jurisdiction|diagnosis|symptom|treatment|dosage|scale|interval|chord|harmony|rhythm|composition|function|expression|type|operator|parameter|argument|property|exception|array|object|objects)\b/gi) || [];
  const normalizedPhrases = academicPhraseMatches
    .map((phrase) => phrase.trim())
    .map((phrase) => sanitizeConceptTerm(phrase))
    .filter(Boolean)
    .filter((phrase) => countMeaningfulWords(phrase) <= 5)
    .map((phrase) => capitalize(phrase));

  const acronyms = text.match(/\b[A-Z]{2,}\b/g) || [];

  return dedupeByMeaning([...normalizedPhrases, ...acronyms, ...fromKeywords])
    .map((term) => sanitizeConceptTerm(term))
    .filter(Boolean)
    .slice(0, 5);
}

// Choose the visible concept focus for a question stem.
function buildQuestionFocus(card, topicName) {
  const safeTopicName = capitalize(topicName || "General Knowledge");
  const focusSources = [card?.answer, card?.sentence, card?.summary]
    .map((value) => normalizeKnowledgeText(value || ""))
    .filter(Boolean);

  // Prefer the subject of a complete teaching statement.
  for (const source of focusSources) {
    const subjectMatch = source.match(/^(.{3,90}?)\s+(?:is|are|means|refers to|requires|includes|involves|measures|compares|organizes|describes|follows|creates|exposes|stores|displays|reacts|centralizes|defines|separates|manages|provides|receives|supports|aim|aims|can|must|should|helps|allows|indicates|determines)\b/i);
    const subjectFocus = sanitizeConceptTerm(subjectMatch?.[1] || "");
    if (
      subjectFocus
      && countMeaningfulWords(subjectFocus) <= 5
      && !GENERIC_KEYWORDS.has(normalizePhrase(subjectFocus))
    ) {
      return subjectFocus;
    }
  }

  const terms = dedupeOverlappingText(Array.isArray(card?.keywords) ? card.keywords : [])
    .filter((term) => !isPlaceholderText(term))
    .filter((term) => !GENERIC_KEYWORDS.has(String(term || "").toLowerCase()))
    .filter((term) => countMeaningfulWords(term) <= 5)
    .slice(0, 2);

  if (terms.length) return terms.join(" / ");

  const fallbackFocus = shortenSentence(card?.summary || card?.sentence || card?.answer || safeTopicName, 90);

  // Avoid leaking long learning-objective / meta headers as the "focus".
  // If focus is mostly hierarchy text like "Learning Objectives > ...", trim to the last meaningful segment.
  const raw = String(fallbackFocus || "").trim();
  if (!raw) return safeTopicName;

  const learningObjIdx = raw.toLowerCase().indexOf("learning objectives");
  if (learningObjIdx >= 0) {
    // Keep tail after the last '>' to show the actual concept, not the objective chain.
    const parts = raw.split(">" ).map((p) => p.trim()).filter(Boolean);
    const tail = parts.length ? parts[parts.length - 1] : raw;
    return shortenSentence(tail, 90);
  }

  const beforeDefinition = raw.split(/\s+(?:is|are|refers to|means|allows|provides|supports|contains)\s+/i)[0]?.trim();
  if (
    beforeDefinition
    && beforeDefinition !== raw
    && countMeaningfulWords(beforeDefinition) >= 2
    && countMeaningfulWords(beforeDefinition) <= 6
    && !/^(?:if|when|since|because|while|from|with|without)\b/i.test(beforeDefinition)
  ) {
    return beforeDefinition;
  }

  return countMeaningfulWords(raw) <= 6 ? raw : safeTopicName;
}

// Keep focus labels short and student-readable.
function cleanQuestionFocus(focus, topicName) {
  const safeTopicName = capitalize(topicName || "General Knowledge");
  const parts = String(focus || "")
    .split("/")
    .map((part) => sanitizeConceptTerm(part))
    .filter(Boolean)
    .filter((part) => !GENERIC_KEYWORDS.has(normalizePhrase(part)))
    .filter((part) => countMeaningfulWords(part) <= 4);

  const unique = dedupeOverlappingText(parts).slice(0, 2);
  const usesGermanJoin = /\b(der|die|das|daten|algorithmus|sortier|struktur|verfahren)\b/i.test(`${safeTopicName} ${unique.join(" ")}`);
  return unique.length ? unique.join(usesGermanJoin ? " und " : " and ") : safeTopicName;
}

// Check whether a short answer is meaningful enough for open-answer grading.
function isStrongAcceptedAnswer(answer, questionText = "") {
  const value = sanitizeConceptTerm(answer);
  if (!value || isPlaceholderText(value)) return false;
  if (answerAppearsInQuestion(value, questionText)) return false;

  const normalized = normalizePhrase(value);
  if (!normalized || GENERIC_KEYWORDS.has(normalized) || WEAK_SINGLE_ANSWER_TERMS.has(normalized)) return false;

  const words = countMeaningfulWords(value);
  if (words >= 2) return true;
  return /^[A-ZÄÖÜ0-9][A-Za-zÀ-ÿ0-9-]{3,}$/.test(value);
}

// Build stem for multiple choice (based on answer content patterns)
function buildMultipleChoiceQuestion(card, topicName, index = 0) {
  const focus = cleanQuestionFocus(buildQuestionFocus(card, topicName), topicName);
  const answer = String(card?.answer || card?.sentence || "").toLowerCase();
  const isProgrammingTopic = /\b(kotlin|java|javascript|python|programming|code|function|compiler|android|api|software)\b/i.test(topicName);
  return getMultipleChoiceStem({ focus, answer, isProgrammingTopic, index });
}

// Build stem for multiple-select ("select all that apply")
function buildMultipleSelectQuestion(card, topicName, index = 0) {
  const focus = cleanQuestionFocus(buildQuestionFocus(card, topicName), topicName);
  return getMultipleSelectStem(focus, index);
}

// Build open-answer payload: extracts answer from card content using regex patterns.
// Tries multiple patterns: "this process is called X", "return type is X", "Exception: thrown when...".
// Falls back to extracting keywords from card if no pattern matches.
// Returns null if no valid answer found.
function buildOpenAnswerPayload(card, topicName, index = 0) {
  const sentence = normalizeKnowledgeText(card?.sentence || card?.answer || "");

  // German definition pattern: "Bei X handelt es sich um Y".
  const germanDefinitionMatch = sentence.match(/\bbei\s+(.{3,90}?)\s+handelt\s+es\s+sich\b.*?\bum\s+(?:ein(?:e[nmrs]?)?\s+)?(.{3,90}?)(?:[,.]|$)/i);
  if (germanDefinitionMatch) {
    const subject = cleanQuestionFocus(germanDefinitionMatch[1], topicName);
    const answer = sanitizeConceptTerm(germanDefinitionMatch[2]);
    const questionText = `Worum handelt es sich bei ${subject}?`;
    if (isStrongAcceptedAnswer(answer, questionText)) {
      return {
        questionText,
        acceptedAnswers: [answer],
      };
    }
  }

  // German condition pattern: "X heißt korrekt, wenn ...".
  const germanConditionMatch = sentence.match(/\b(.{3,70}?)\s+hei(?:ß|ss)t\s+(.{2,40}?),\s+wenn\s+(.{8,140})/i);
  if (germanConditionMatch) {
    const subject = cleanQuestionFocus(germanConditionMatch[1], topicName);
    const answer = shortenSentence(germanConditionMatch[3], 180);
    const questionText = `Wann heißt ${subject} ${germanConditionMatch[2].trim()}?`;
    if (countMeaningfulWords(answer) >= 5 && !answerAppearsInQuestion(answer, questionText)) {
      return {
        questionText,
        acceptedAnswers: [answer],
      };
    }
  }

  // German purpose pattern: "Das Hauptziel eines X ist ...".
  const germanGoalMatch = sentence.match(/\b(?:das\s+)?hauptziel\s+(?:von|eines?|einer)\s+(.{3,80}?)\s+ist,?\s+(.{8,140})/i);
  if (germanGoalMatch) {
    const subject = cleanQuestionFocus(germanGoalMatch[1], topicName);
    const answer = shortenSentence(germanGoalMatch[2], 100);
    const questionText = `Was ist das Hauptziel von ${subject}?`;
    if (countMeaningfulWords(answer) >= 4 && !answerAppearsInQuestion(answer, questionText)) {
      return {
        questionText,
        acceptedAnswers: [answer],
      };
    }
  }

  // Pattern: "...this process is called Kotlin"
  const calledMatch = sentence.match(/(.+?),?\s*this process is called\s+([A-Za-z][A-Za-z\s-]{2,40})\.?$/i);
  if (calledMatch) {
    const clue = calledMatch[1]
      .replace(/^as\s+if\s+/i, "treating a value as if ")
      .replace(/[.,;:]+$/g, "")
      .trim();
    const answer = sanitizeConceptTerm(calledMatch[2]);
    if (answer) {
      return {
        questionText: `What process is described by ${clue}?`,
        acceptedAnswers: [answer],
      };
    }
  }

  // Pattern: "return type is Unit"
  const unitMatch = sentence.match(/if\s+a\s+function\s+does\s+not\s+return\s+any\s+useful\s+value,\s*its\s+return\s+type\s+is\s+([A-Za-z][A-Za-z0-9_]*)/i);
  if (unitMatch) {
    return {
      questionText: "Which return type is used when a function does not return a useful value?",
      acceptedAnswers: [unitMatch[1]],
    };
  }

  // Pattern: "IOException: this exception is thrown when..."
  const exceptionMatch = sentence.match(/^([A-Za-z][A-Za-z\s]+Exception)\s*:\s*this exception is thrown when\s+(.+)/i);
  if (exceptionMatch) {
    return {
      questionText: `Which exception is thrown when ${shortenSentence(exceptionMatch[2], 90)}`,
      acceptedAnswers: [exceptionMatch[1].trim()],
    };
  }

  // Hardcoded patterns for common Kotlin concepts
  if (/extension functions are resolved statically/i.test(sentence)) {
    return {
      questionText: "How are extension functions resolved?",
      acceptedAnswers: ["Statically", "Resolved statically"],
    };
  }

  if (/trailing lambdas.+last parameter/i.test(sentence)) {
    return {
      questionText: "Which parameter position is important for trailing lambdas?",
      acceptedAnswers: ["Last parameter", "The last parameter"],
    };
  }

  // Generic definition pattern for any subject area.
  const subjectMatch = sentence.match(/^(.{3,90}?)\s+(?:is|are|means|refers to|requires|includes|involves|measures|compares|organizes|describes|follows|creates|exposes|stores|displays|reacts|centralizes|defines|separates|manages|provides|receives|supports|aim|aims|can|must|should|helps|allows|indicates|determines)\s+(.{10,160})/i);
  if (subjectMatch) {
    const answer = sanitizeConceptTerm(subjectMatch[1]);
    const clue = shortenSentence(subjectMatch[2], 120);
    const questionText = `Which concept is described as ${clue}`;
    if (isStrongAcceptedAnswer(answer, questionText)) {
      return {
        questionText,
        acceptedAnswers: [answer],
      };
    }
  }

  // Do not create open-answer questions from loose keywords.
  // Weak open answers are worse than no open answer.
  return null;
}

// Build a question from a code snippet.
function buildCodeQuestionPayload(codeCard, allCards = [], topicName = "Programming") {
  if (!codeCard || codeCard.kind !== "code") return null;

  const sentence = String(codeCard.sentence || "");
  // Infer concept from code patterns.
  const inferredConcept = (() => {
    if (/\bstatic\s+method\b/i.test(sentence)) return "Static method";
    if (/\bfun\s+\w+\s*\(|\w+\s*\([^)]*\)/i.test(sentence)) return "Function call";
    if (/\bnull|!!|\?\./i.test(sentence)) return "Null safety";
    if (/\breturn\s+type\b/i.test(sentence)) return "Return type";
    return "";
  })();

  // Use card keywords if no pattern matches.
  const extractedConcept = (Array.isArray(codeCard.keywords) ? codeCard.keywords : [])
    .map((term) => sanitizeConceptTerm(term))
    .find((term) => term && !GENERIC_KEYWORDS.has(normalizePhrase(term)));
  const correct = inferredConcept || extractedConcept;
  if (!correct) return null;

  // Collect distractors from nearby cards.
  const distractors = dedupeOverlappingText(allCards
    .filter((card) => card.id !== codeCard.id)
    .flatMap((card) => Array.isArray(card.keywords) ? card.keywords : [])
    .map((term) => sanitizeConceptTerm(term))
    .filter(Boolean)
    .filter((term) => !isNearDuplicateText(term, correct))
    .filter((term) => isUsefulAnswerChoice(term, { allowTerm: true })))
    .slice(0, 3);

  const fallbackTerms = ["Null safety", "Function call", "Type checking", "Return type"]
    .filter((term) => !isNearDuplicateText(term, correct));
  const options = dedupeOverlappingText([correct, ...distractors, ...fallbackTerms]).slice(0, 4);
  if (options.length < 3) return null;

  return {
    type: "multiple_choice",
    question: `Which concept is demonstrated by the code example in ${capitalize(topicName)}?`,
    options,
    correctIndex: 0,
    explanation: buildEducationalExplanation(codeCard, topicName),
    points: 1,
  };
}

// Build a short explanation from the source card.
function buildEducationalExplanation(card, topicName) {
  const source = String(card?.sentence || card?.answer || "").trim();
  const terms = Array.isArray(card?.keywords) ? card.keywords.filter(Boolean).slice(0, 3) : [];

  if (card?.kind === "code") {
    const termText = terms.length ? ` The important idea is ${terms.join(", ")}.` : "";
    return `The snippet demonstrates a practical ${topicName} pattern rather than a definition.${termText}`;
  }

  return `Because the material states: ${shortenSentence(source, 160)}`;
}

// Reject cards that would create navigation-like or repeated low-value questions.
function isUsableConceptCard(card) {
  const source = `${card?.sentence || ""} ${card?.answer || ""}`;
  if (!source.trim()) return false;
  if (isPlaceholderText(source)) return false;
  if (!isUsableKnowledgeText(card?.sentence || card?.answer || "")) return false;
  if (/courses\s*tutorials\s*interview/i.test(source)) return false;
  if (isPlaceholderText(source)) return false;
  return true;
}

// Build lightweight local knowledge units reused by fallback quiz generation.
function buildConceptCards(topicName, content) {
  // Turn raw source text into reusable concept cards for local fallback generation.
  const safeTopicName = capitalize(topicName || "General Knowledge");
  const keywords = extractKeywords(content, 18);
  const sentences = extractSentences(content).filter((sentence) => isUsableKnowledgeText(sentence));
  const cards = sentences
    .map((sentence, sentenceIndex) => buildConceptCardFromSentence(sentence, sentenceIndex, keywords, safeTopicName))
    .filter((card) => isUsableConceptCard(card))
    .filter((card) => card.kind !== "code" || !isIncompleteCodeFragment(card.sentence));

  if (!cards.length) {
    return buildKeywordFallbackCards(keywords, safeTopicName);
  }

  const theoryCards = cards.filter((card) => card.kind !== "code");
  const codeCards = cards.filter((card) => card.kind === "code");
  const mixed = [];
  const maxCodeCards = Math.min(3, codeCards.length);
  let theoryIndex = 0;
  let codeIndex = 0;

  while (theoryIndex < theoryCards.length || codeIndex < maxCodeCards) {
    for (let count = 0; count < 2 && theoryIndex < theoryCards.length; count += 1) {
      mixed.push(theoryCards[theoryIndex]);
      theoryIndex += 1;
    }

    if (codeIndex < maxCodeCards) {
      mixed.push(codeCards[codeIndex]);
      codeIndex += 1;
    }

    if (theoryIndex >= theoryCards.length && codeIndex >= maxCodeCards) break;
  }

  return mixed.length ? mixed : cards;
}

// Build a keyword bank from frequent source terms.
function extractKeywords(content, limit = 12) {
  const words = truncateContent(content)
    .match(/[A-Za-z0-9À-ÿ'-]+/g) || [];

  const frequencies = new Map();
  for (const word of words) {
    const raw = word.replace(/^['-]+|['-]+$/g, "");
    const normalized = raw.toLowerCase();
    const isAcronym = /^[A-Z0-9]{2,}$/.test(raw);
    if (/^\d+$/.test(normalized)) continue;
    if ((!isAcronym && normalized.length < 4) || STOPWORDS.has(normalized) || GENERIC_KEYWORDS.has(normalized)) continue;
    frequencies.set(raw, (frequencies.get(raw) || 0) + 1);
  }

  return [...frequencies.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([word]) => capitalize(word))
    .slice(0, limit);
}

// Build one reusable card from one source sentence.
function buildConceptCardFromSentence(sentence, sentenceIndex, keywords, safeTopicName) {
  const sentenceLower = sentence.toLowerCase();
  const kind = isCodeLikeText(sentence) ? "code" : "theory";
  const fragments = sentenceFragments(sentence);
  const matchingKeywords = extractConceptTerms(sentence, keywords);
  const answerStatement = toOptionStatement(shortenSentence(sentence, 220));
  // Build distractors from fragments and unrelated keywords.
  const fragmentOptions = fragments
    .map((fragment) => toOptionStatement(fragment))
    .filter((fragment) => fragment.toLowerCase() !== answerStatement.toLowerCase())
    .filter((fragment) => isCodeLikeText(fragment) || /^[A-Z0-9"`]/.test(fragment))
    .filter((fragment) => countMeaningfulWords(fragment) >= 5 && countMeaningfulWords(fragment) <= 18);
  const keywordOptions = keywords
    .filter((keyword) => !matchingKeywords.includes(keyword))
    .filter((keyword) => !GENERIC_KEYWORDS.has(String(keyword || "").toLowerCase()))
    .slice(0, 4)
    .map((keyword) => capitalize(keyword));

  return {
    id: `sentence-${sentenceIndex}`,
    kind,
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

// Keep reorder UI shuffled while preserving the solved order.
function buildShuffledOrderPayload(items = []) {
  // Avoid showing the solved order by default.
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

const { assessQuizQuality, normalizeQuestion } = createQuizNormalizer({
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
});

// Generate a full quiz locally from concept cards.
function buildContentAwareQuiz(topicName, content) {
  // === SECTION 1: Prepare concept cards and keywords ===
  const safeTopicName = capitalize(topicName || "General Knowledge");
  const cards = buildConceptCards(safeTopicName, content);
  const keywords = extractKeywords(content, 20);
  const seedKeywords = dedupeByMeaning([safeTopicName, ...keywords, "Overview", "Concept", "Details", "Application"])
    .filter((keyword, index, collection) => {
      const normalized = normalizeKeyword(keyword);
      return normalized && collection.findIndex((candidate) => normalizeKeyword(candidate) === normalized) === index;
    });

  // Fall back when the source is too thin.
  if (seedKeywords.length < 4 && cards.length < 2) {
    return createMockQuiz(safeTopicName);
  }

  // Cycle through keywords safely.
  const keywordFor = (index) => {
    if (!Array.isArray(seedKeywords) || seedKeywords.length === 0) return safeTopicName;
    return seedKeywords[index % seedKeywords.length] || safeTopicName;
  };

  // === SECTION 2: Track used questions/options to avoid duplicates ===
  const questions = [];
  const usedQuestionKeys = new Set();
  const usedCardIds = new Set();
  const usedOptionSets = new Set();
  const usedOptionPhrases = new Set();
  const usedOptionTexts = [];
  const usedOpenAnswers = new Set();

  // Track repeated option wording.
  const optionPhraseKey = (value) => normalizePhrase(value);
  const hasUsedOptionPhrase = (value) => {
    const key = optionPhraseKey(value);
    return Boolean(key && usedOptionPhrases.has(key)) || usedOptionTexts.some((used) => isNearDuplicateText(used, value));
  };
  const registerQuestionOptions = (values = []) => {
    values.forEach((value) => {
      const key = optionPhraseKey(value);
      if (!key) return;
      usedOptionPhrases.add(key);
      usedOptionTexts.push(value);
    });
  };
  const hasUsedOpenAnswer = (answer) => {
    const key = normalizePhrase(answer);
    return Boolean(key && usedOpenAnswers.has(key));
  };
  const registerOpenAnswers = (answers = []) => {
    answers.forEach((answer) => {
      const key = normalizePhrase(answer);
      if (key) usedOpenAnswers.add(key);
    });
  };

  const optionSetKey = (values = []) => dedupeOverlappingText(values)
    .map((value) => normalizePhrase(value))
    .filter(Boolean)
    .sort()
    .join("|");

  const hasRepeatedOptionSet = (values = []) => {
    const key = optionSetKey(values);
    if (!key) return false;
    if (usedOptionSets.has(key)) return true;
    usedOptionSets.add(key);
    return false;
  };

  // === SECTION 3: Helpers to get card/answers, avoiding reuse ===
  const cardFor = (index, { allowCode = false } = {}) => {
    if (!cards.length) {
      return {
        sentence: `Key ideas about ${safeTopicName} are highlighted in the lesson.`,
        answer: `${safeTopicName} is highlighted in the lesson.`,
        summary: `${safeTopicName} is highlighted in the lesson.`,
        keywords: [safeTopicName],
        distractors: [],
        fragments: [],
      };
    }

    const candidateCards = allowCode ? cards : cards.filter((card) => card.kind !== "code");
    const sourceCards = candidateCards.length ? candidateCards : cards;

    for (let offset = 0; offset < sourceCards.length; offset += 1) {
      const candidate = sourceCards[(index + offset) % sourceCards.length];
      if (!usedCardIds.has(candidate.id)) return candidate;
    }

    return sourceCards[index % sourceCards.length];
  };

  const relatedAnswersFor = (card, offsetSeed = 0) => {
    const sameMode = cards.filter((candidate) => candidate.id !== card.id && (card.kind === "code" || candidate.kind !== "code"));
    const pool = sameMode.length >= 3 ? sameMode : cards.filter((candidate) => candidate.id !== card.id);
    const rotated = pool.length
      ? [...pool.slice(offsetSeed % pool.length), ...pool.slice(0, offsetSeed % pool.length)]
      : [];
    return dedupeOverlappingText(rotated.map((candidate) => candidate.answer)).slice(0, 3);
  };

  // Build answer options from correct text + distractors.
  const buildChoiceOptions = (correctOption, candidates = [], questionText = "", { allowReusedCorrect = false, allowReusedDistractors = false } = {}) => {
    const correct = toOptionStatement(correctOption);
    if (!isUsefulAnswerChoice(correct, { allowTerm: false })) return [];
    if (!allowReusedCorrect && hasUsedOptionPhrase(correct)) return [];

    const distractors = dedupeOverlappingText(candidates)
      .filter((candidate) => !isNearDuplicateText(candidate, correct))
      .filter((candidate) => allowReusedDistractors || !hasUsedOptionPhrase(candidate))
      .filter((candidate) => !answerAppearsInQuestion(candidate, questionText))
      .filter((candidate) => isUsefulAnswerChoice(candidate, { allowTerm: false }))
      .slice(0, 3);

    return dedupeOverlappingText([correct, ...distractors]).slice(0, 4);
  };

  // Build safe misconception options when real distractors run out.
  const misconceptionDistractorsFor = (focus) => {
    const safeFocus = cleanQuestionFocus(focus || safeTopicName, safeTopicName);
    return [
      `${safeFocus} is described as unrelated to the main material.`,
      `${safeFocus} is presented only as background trivia with no practical role.`,
      `${safeFocus} should be ignored when applying the material.`,
      `${safeFocus} replaces every other concept discussed in the material.`,
    ];
  };

  // === SECTION 4: Generate questions in order (mixed types) ===
  for (let index = 0; index < QUIZ_QUESTION_COUNT; index += 1) {
    const typeCycle = ["multiple_choice", "multiple_select", "open_answer", "multiple_choice", "reorder", "multiple_choice", "multiple_select", "open_answer", "multiple_choice", "true_false"];
    const type = typeCycle[index % typeCycle.length];
    const card = cardFor(index);
    const keyword = keywordFor(index);
    const sentence = card.sentence;
    const correctStatement = card.answer || shortenSentence(sentence, 220);

    // === QUESTION TYPE: multiple_choice ===
    if (type === "multiple_choice") {
      const relatedStatements = relatedAnswersFor(card, index);
      const questionText = buildMultipleChoiceQuestion(card, safeTopicName, index);
      const options = buildChoiceOptions(correctStatement, [
        ...relatedStatements,
        ...card.distractors,
      ], questionText);
      if (options.length < 3 || hasRepeatedOptionSet(options)) continue;

      const key = `${type}::${questionText}`.toLowerCase();
      if (usedQuestionKeys.has(key)) {
        continue;
      }
      usedQuestionKeys.add(key);
      usedCardIds.add(card.id);
      registerQuestionOptions(options);

      questions.push({
        type,
        question: questionText,
        options,
        correctIndex: 0,
        explanation: buildEducationalExplanation(card, safeTopicName),
        points: 1
      });
      continue;
    }

    // === QUESTION TYPE: true_false ===
    if (type === "true_false") {
      if (usedCardIds.has(card.id) && cards.length > questions.length) continue;
      const trueFalseStatement = toOptionStatement(card.answer);
      if (hasUsedOptionPhrase(trueFalseStatement) || isExerciseInstructionLine(trueFalseStatement) || isPlaceholderText(trueFalseStatement)) continue;
      questions.push({
        type,
        question: trueFalseStatement,
        correctAnswer: true,
        explanation: buildEducationalExplanation(card, safeTopicName),
        points: 1
      });
      usedCardIds.add(card.id);
      registerQuestionOptions([trueFalseStatement]);
      continue;
    }

    // === QUESTION TYPE: multiple_select (select all that apply) ===
    if (type === "multiple_select") {
      // Build correct options from card answer and fragments.
      const possibleCorrectOptions = dedupeOverlappingText([
        card.answer,
        ...card.fragments.map((fragment) => toOptionStatement(fragment)),
      ])
        .filter((option) => !hasUsedOptionPhrase(option))
        .filter((option) => isUsefulAnswerChoice(option, { allowTerm: false }));
      const targetCorrectCount = Math.max(2, (index % 3) + 1); // 2-3 correct answers
      let selectedCorrectOptions = possibleCorrectOptions.slice(0, targetCorrectCount);
      let questionText = buildMultipleSelectQuestion(card, safeTopicName, index);
      let distractorCandidates = relatedAnswersFor(card, index);

      // If one card has too few fragments, build a topic-level select question.
      if (selectedCorrectOptions.length < 2) {
        selectedCorrectOptions = dedupeOverlappingText([
          card.answer,
          ...cards
            .filter((candidate) => candidate.id !== card.id)
            .map((candidate) => candidate.answer),
        ])
          .filter((option) => !hasUsedOptionPhrase(option))
          .filter((option) => isUsefulAnswerChoice(option, { allowTerm: false }))
          .slice(0, targetCorrectCount);
        questionText = "Which statements are correct according to the material?";
        distractorCandidates = misconceptionDistractorsFor(safeTopicName);
      }

      if (selectedCorrectOptions.length < 2) continue;

      // Build distractors from related cards.
      const distractorPool = dedupeOverlappingText([
        ...distractorCandidates,
      ])
        .filter((candidate) => !selectedCorrectOptions.some((correctOption) => isNearDuplicateText(candidate, correctOption)))
        .filter((candidate) => !hasUsedOptionPhrase(candidate))
        .filter((candidate) => isUsefulAnswerChoice(candidate, { allowTerm: false }))
        .slice(0, Math.max(2, 5 - selectedCorrectOptions.length));
      const options = dedupeOverlappingText([...selectedCorrectOptions, ...distractorPool]).slice(0, 5);
      if (options.length < 3 || hasRepeatedOptionSet(options)) continue;

      const correctIndices = options
        .map((option, optionIndex) => (selectedCorrectOptions.includes(option) ? optionIndex : -1))
        .filter((optionIndex) => optionIndex >= 0);

      // Skip duplicate question stems.
      const key = `${type}::${questionText}`.toLowerCase();
      if (usedQuestionKeys.has(key)) {
        continue;
      }
      usedQuestionKeys.add(key);
      usedCardIds.add(card.id);
      registerQuestionOptions(options);

      // Save the multiple-select question.
      questions.push({
        type,
        question: questionText,
        options,
        correctIndices: correctIndices.length ? correctIndices : [0],
        partialCreditEnabled: true,
        partialCreditThreshold: 1,
        explanation: buildEducationalExplanation(card, safeTopicName),
        points: 1
      });
      continue;
    }

    // === QUESTION TYPE: reorder (arrange in order) ===
    if (type === "reorder") {
      // Use sentence fragments as ordered items.
      const logicalItems = dedupeByMeaning(card.fragments)
        .filter((item) => countMeaningfulWords(item) >= 4)
        .slice(0, 4);

      // Convert to multiple choice if reorder is too weak.
      if (logicalItems.length < 3) {
        const questionText = buildMultipleChoiceQuestion(card, safeTopicName, index);
        const options = buildChoiceOptions(correctStatement, [
          ...card.distractors,
          ...relatedAnswersFor(card, index),
        ], questionText);
        if (options.length < 3 || hasRepeatedOptionSet(options)) continue;

        const key = `multiple_choice::${questionText}`.toLowerCase();
        if (usedQuestionKeys.has(key)) {
          continue;
        }
        usedQuestionKeys.add(key);
        usedCardIds.add(card.id);
        registerQuestionOptions(options);

        questions.push({
          type: "multiple_choice",
          question: questionText,
          options,
          correctIndex: 0,
          explanation: buildEducationalExplanation(card, safeTopicName),
          points: 1
        });
        continue;
      }

      // Shuffle display order but keep the answer key.
      const { items, correctOrder } = buildShuffledOrderPayload(logicalItems);
      const questionText = getReorderStem(safeTopicName, index);
      const key = `${type}::${questionText}`.toLowerCase();
      if (usedQuestionKeys.has(key)) {
        continue;
      }
      usedQuestionKeys.add(key);
      usedCardIds.add(card.id);

      // Save the reorder question.
      questions.push({
        type,
        question: questionText,
        items,
        correctOrder,
        partialCreditEnabled: true,
        partialCreditThreshold: Math.max(1, Math.ceil(logicalItems.length / 2)),
        explanation: buildEducationalExplanation(card, safeTopicName),
        points: 1
      });
      continue;
    }

    // === QUESTION TYPE: open_answer ===
    const openPayload = buildOpenAnswerPayload(card, safeTopicName, index);
    if (!openPayload) continue;
    const { questionText } = openPayload;
    const acceptedAnswers = openPayload.acceptedAnswers.filter((answer) => !hasUsedOpenAnswer(answer));
    if (!acceptedAnswers.length) continue;
    const key = `${type}::${questionText}`.toLowerCase();
    if (usedQuestionKeys.has(key)) {
      continue;
    }
    usedQuestionKeys.add(key);
    usedCardIds.add(card.id);

    questions.push({
      type: "open_answer",
      question: questionText,
      acceptedAnswers,
      partialCreditEnabled: true,
      partialCreditThreshold: 1,
      hint: shortenSentence(sentence, 80),
      explanation: buildEducationalExplanation(card, safeTopicName),
      points: 1
    });
    registerOpenAnswers(acceptedAnswers);
  }

  // === FILL LOOP: add multiple-choice questions if needed ===
  let fillIndex = 0;
  while (questions.length < QUIZ_QUESTION_COUNT && fillIndex < QUIZ_QUESTION_COUNT * 6) {
    const card = cardFor(fillIndex + questions.length);
    const relatedStatements = dedupeOverlappingText(
      relatedAnswersFor(card)
    ).slice(0, 3);
    const questionText = buildMultipleChoiceQuestion(card, safeTopicName, fillIndex + questions.length);
    const key = `multiple_choice::${questionText}`.toLowerCase();
    fillIndex += 1;
    if (usedQuestionKeys.has(key)) continue;
    const correctStatement = card.answer || shortenSentence(card.sentence, 220);
    const options = buildChoiceOptions(correctStatement, [
      ...relatedStatements,
      ...card.distractors,
    ], questionText);

    if (options.length < 3 || hasRepeatedOptionSet(options)) continue;
    usedQuestionKeys.add(key);
    usedCardIds.add(card.id);
    registerQuestionOptions(options);

    questions.push({
      type: "multiple_choice",
      question: questionText,
      options,
      correctIndex: 0,
      explanation: buildEducationalExplanation(card, safeTopicName),
      points: 1,
    });
  }

  // === RELAXED FILL LOOP: loosen reuse rules if needed ===
  let relaxedFillIndex = 0;
  while (questions.length < QUIZ_QUESTION_COUNT && relaxedFillIndex < QUIZ_QUESTION_COUNT * 8) {
    const card = cards.length ? cards[relaxedFillIndex % cards.length] : cardFor(relaxedFillIndex);
    const correctStatement = card.answer || shortenSentence(card.sentence, 220);
    const questionText = buildMultipleChoiceQuestion(card, safeTopicName, relaxedFillIndex + 3);
    const key = `multiple_choice::${questionText}`.toLowerCase();
    relaxedFillIndex += 1;

    if (usedQuestionKeys.has(key)) continue;
    const options = buildChoiceOptions(correctStatement, [
      ...relatedAnswersFor(card, relaxedFillIndex),
      ...card.distractors,
      ...cards.filter((candidate) => candidate.id !== card.id).map((candidate) => candidate.answer),
    ], questionText);

    // Try open-answer or true/false if options are weak.
    if (options.length < 3) {
      const openPayload = buildOpenAnswerPayload(card, safeTopicName, relaxedFillIndex);
      if (openPayload) {
        const acceptedAnswers = openPayload.acceptedAnswers.filter((answer) => !hasUsedOpenAnswer(answer));
        const openKey = `open_answer::${openPayload.questionText}`.toLowerCase();
        if (acceptedAnswers.length && !usedQuestionKeys.has(openKey)) {
          usedQuestionKeys.add(openKey);
          questions.push({
            type: "open_answer",
            question: openPayload.questionText,
            acceptedAnswers,
            partialCreditEnabled: true,
            partialCreditThreshold: 1,
            hint: shortenSentence(card.sentence, 80),
            explanation: buildEducationalExplanation(card, safeTopicName),
            points: 1,
          });
          registerOpenAnswers(acceptedAnswers);
        }
      } else {
        // Last local fallback for this card.
        const statement = toOptionStatement(correctStatement);
        const tfKey = `true_false::${statement}`.toLowerCase();
        if (!hasUsedOptionPhrase(statement) && !usedQuestionKeys.has(tfKey) && !isExerciseInstructionLine(statement) && !isPlaceholderText(statement)) {
          usedQuestionKeys.add(tfKey);
          registerQuestionOptions([statement]);
          questions.push({
            type: "true_false",
            question: statement,
            correctAnswer: true,
            explanation: buildEducationalExplanation(card, safeTopicName),
            points: 1,
          });
        }
      }
      continue;
    }

    usedQuestionKeys.add(key);
    registerQuestionOptions(options);
    questions.push({
      type: "multiple_choice",
      question: questionText,
      options,
      correctIndex: 0,
      explanation: buildEducationalExplanation(card, safeTopicName),
      points: 1,
    });
  }

  // === SOURCE-GROUNDED COMPLETION LOOP: reach 10 without repeating options ===
  let completionIndex = 0;
  while (questions.length < QUIZ_QUESTION_COUNT && completionIndex < cards.length * 3) {
    const card = cards[completionIndex % cards.length] || cardFor(completionIndex);
    const focus = cleanQuestionFocus(buildQuestionFocus(card, safeTopicName), safeTopicName);
    const questionText = `Which statement is supported by the material about ${focus}?`;
    const key = `multiple_choice::${questionText}`.toLowerCase();
    completionIndex += 1;

    if (usedQuestionKeys.has(key)) continue;
    const correctStatement = card.answer || shortenSentence(card.sentence, 220);
    const options = buildChoiceOptions(correctStatement, misconceptionDistractorsFor(focus), questionText);
    if (options.length < 3 || hasRepeatedOptionSet(options)) continue;

    usedQuestionKeys.add(key);
    usedCardIds.add(card.id);
    registerQuestionOptions(options);
    questions.push({
      type: "multiple_choice",
      question: questionText,
      options,
      correctIndex: 0,
      explanation: buildEducationalExplanation(card, safeTopicName),
      points: 1,
    });
  }

  // === EMERGENCY LOOP: true/false as final local fallback ===
  let emergencyIndex = 0;
  while (
    questions.length < QUIZ_QUESTION_COUNT
    && emergencyIndex < cards.length * 2
    && questions.filter((question) => question.type === "true_false").length < 4
  ) {
    const card = cards[emergencyIndex % cards.length] || cardFor(emergencyIndex);
    const statement = toOptionStatement(card.answer || card.sentence);
    const key = `true_false::${statement}`.toLowerCase();
    emergencyIndex += 1;

    if (!statement || usedQuestionKeys.has(key) || isExerciseInstructionLine(statement) || isPlaceholderText(statement)) continue;
    usedQuestionKeys.add(key);
    questions.push({
      type: "true_false",
      question: statement,
      correctAnswer: true,
      explanation: buildEducationalExplanation(card, safeTopicName),
      points: 1,
    });
  }

  // === CODE QUESTION: inject one code question when possible ===
  const hasCodeQuestion = questions.some((question) => String(question.explanation || "").includes("snippet demonstrates"));
  const codeCard = cards.find((card) => card.kind === "code");
  const codeQuestion = !hasCodeQuestion ? buildCodeQuestionPayload(codeCard, cards, safeTopicName) : null;
  if (codeQuestion) {
    const correctCodeOption = codeQuestion.options[codeQuestion.correctIndex || 0] || codeQuestion.options[0];
    const freshCodeDistractors = codeQuestion.options
      .filter((option) => !isNearDuplicateText(option, correctCodeOption))
      .filter((option) => !hasUsedOptionPhrase(option));
    const fallbackCodeDistractors = ["Null safety", "Function call", "Type checking", "Return type", "Static dispatch"]
      .filter((option) => !isNearDuplicateText(option, correctCodeOption))
      .filter((option) => !hasUsedOptionPhrase(option));
    const codeOptions = dedupeOverlappingText([correctCodeOption, ...freshCodeDistractors, ...fallbackCodeDistractors]).slice(0, 4);
    if (codeOptions.length < 3) {
      return questions.slice(0, QUIZ_QUESTION_COUNT);
    }
    codeQuestion.options = codeOptions;
    codeQuestion.correctIndex = 0;
    const replaceIndex = questions.findIndex((question) => question.type === "true_false");
    if (replaceIndex >= 0) {
      questions[replaceIndex] = codeQuestion;
    } else if (questions.length >= QUIZ_QUESTION_COUNT) {
      questions[questions.length - 1] = codeQuestion;
    } else {
      questions.push(codeQuestion);
    }
    registerQuestionOptions(codeQuestion.options);
  }

  return questions.slice(0, QUIZ_QUESTION_COUNT);
}

// Fetch RAG context from the Python service.
async function fetchRagQuizContext(courseId, topicName) {
  const safeCourseId = typeof courseId === "string" ? courseId.trim() : "";
  const safeTopicName = (topicName || "General Knowledge").trim() || "General Knowledge";

  if (!safeCourseId) return "";

  const prompts = buildRagQuizPrompts(safeTopicName);
  const responses = await Promise.all(prompts.map(async (question) => {
    try {
      const response = await axios.post(
        `${AI_SERVICE_URL}/ask`,
        {
          course_id: safeCourseId,
          question,
        },
        {
          timeout: AI_TIMEOUT_MS,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const answer = typeof response.data?.answer === "string" ? response.data.answer.trim() : "";
      const sources = Array.isArray(response.data?.sources) ? response.data.sources.filter(Boolean) : [];

      if (!answer) return null;

      return [
        `Question: ${question}`,
        `Answer: ${answer}`,
        sources.length ? `Sources: ${sources.join("; ")}` : "",
      ].filter(Boolean).join("\n");
    } catch (error) {
      console.warn(`[RAG quiz] Context request failed for ${safeTopicName}:`, error.response?.data || error.message);
      return null;
    }
  }));

  return responses.filter(Boolean).join("\n\n");
}

// Build a local summary without remote AI.
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

  // Summary generation is fully local now, so it no longer depends on any external provider.
  return buildFallbackSummary(safeContent, safeTopicName);
};

// Generate a normalized quiz for the frontend.
exports.generateQuiz = async (content, topicName = "General Knowledge", options = {}) => {
  const safeContent = truncateContent(content);
  const safeTopicName = (topicName || "General Knowledge").trim() || "General Knowledge";
  const safeCourseId = typeof options === "object" && options !== null && typeof options.courseId === "string"
    ? options.courseId.trim()
    : "";
  const sourceMetadata = { topic: safeTopicName, courseId: safeCourseId, timestamp: new Date().toISOString() };

  try {
    // Pull a small set of course-specific hints from the RAG service before building the quiz.
    const ragContext = await fetchRagQuizContext(safeCourseId, safeTopicName);
    const combinedSource = [ragContext, safeContent]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join("\n\n");

    const quizSource = combinedSource || safeTopicName;
    const normalized = buildContentAwareQuiz(safeTopicName, quizSource).map((question, index) => normalizeQuestion(question, index, sourceMetadata));
    const quality = assessQuizQuality(normalized);

    if (!quality.isWeak) {
      return normalized;
    }

    // If the first pass still looks weak, enrich the source once more and rebuild locally.
    const enrichedSource = ragContext
      ? [quizSource, `Additional RAG context for ${safeTopicName}:\n${ragContext}`]
      : [quizSource]
      .filter(Boolean)
      .join("\n\n");

    return buildContentAwareQuiz(safeTopicName, enrichedSource).map((question, index) => normalizeQuestion(question, index, sourceMetadata));
  } catch (error) {
    console.error("AI quiz error:", error.message || error);
    return buildContentAwareQuiz(safeTopicName, safeContent).map((question, index) => normalizeQuestion(question, index, sourceMetadata));
  }
};
// Send course text to the Python RAG service.
exports.ingestToRAG = async (courseId, title, content) => {
  const aiServiceUrl = process.env.AI_SERVICE_URL || "http://localhost:8001";
  
  if (!content) {
    console.log("[RAG] Ingestion skipped: No content provided.");
    return;
  }
  if (!courseId) {
    console.log("[RAG] Ingestion skipped: No courseId provided.");
    return;
  }

  try {
    console.log(`[RAG] Sending POST to ${aiServiceUrl}/ingest for course ${courseId}`);
    const response = await axios.post(`${aiServiceUrl}/ingest`, {
      course_id: courseId,
      title: title,
      content: content
    });
    console.log("[RAG] Ingestion successful:", response.data);
  } catch (error) {
    console.error("[RAG] Ingestion failed:", error.response?.data || error.message);
  }
};


// Reserved hook for future prerequisite recommendation logic.
exports.suggestPrerequisites = async () => [];
