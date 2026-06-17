const axios = require("axios");

//  CONFIGURATION
// Runtime configuration for the local RAG-backed quiz flow.
const AI_SERVICE_URL = (process.env.AI_SERVICE_URL || "http://localhost:8001").replace(/\/$/, "");
const MAX_INPUT_CHARS = Number(process.env.AI_MAX_INPUT_CHARS || 6500);
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 60000);
const QUIZ_REPAIR_ENABLED = String(process.env.QUIZ_REPAIR_ENABLED || "false").trim().toLowerCase() === "true";

// Number of questions to generate per quiz
const QUIZ_QUESTION_COUNT = 10;

// All supported question type identifiers
const QUIZ_TYPES = ["multiple_choice", "true_false", "multiple_select", "reorder", "open_answer"];

// Patterns that indicate generic/weak questions (not specific to material)
// These questions don't test real understanding
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

// Words that are too generic to build a good question around
// They don't carry specific meaning for quiz questions
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
  "apply",
  "applies",
  "source",
  "open",
  "lesson",
  "material",
  "instructional",
  "distance",
  "intellectual",
  "objectives",
  "students",
  "teaching",
  "knowledge",
  "page",
  "break",
  "manages",
  "provides",
  "contains",
  "support",
  "record",
  "responsible",
  "step",
  "next",
  "previous",
  "practice",
  "tour",
  "welcome",
  "documentation",
  "language",
  "list",
  "lists",
  "called",
  "however",
  "approach",
  "value",
  "values",
  "message",
  "messages",
  "belongs",
  "receive",
  "receives",
  "indicate",
  "indicates",
  "feature",
  "stable",
  "rule",
  "correspond",
  "corresponds",
  "passed",
  "throws",
  "allows",
  "appears",
  "still",
  "if",
  "since",
]);

const WEAK_SINGLE_ANSWER_TERMS = new Set([
  "type",
  "function",
  "method",
  "property",
  "parameter",
  "argument",
  "value",
  "message",
  "called",
]);

const PDF_NOISE_PATTERNS = [
  /^(page|seite)\s+\d+$/i,
  /^(block|unit)\s+\d+\s*$/i,
  /^(block|unit)\s+\d+\b.*$/i,
  /^(copyright|all rights reserved|isbn)\b/i,
  /^(dr\.|prof\.|mr\.|mrs\.|ms\.)\s+[A-Z]/i,
  /^(mobile application development|basics of android application|pgdca\s+\d+)\b/i,
  /^(knowledge management and research organization|instructional design and editing)\b/i,
  /^(book|course|programme|program)\s*$/i,
  /^kotlin\s+language\s+documentation\b/i,
  /^welcome\s+to\s+our\s+tour\s+of\s+kotlin/i,
  /^kotlin\s+\d+(?:\.\d+)+\s*$/i,
  /^version\s+\d+(?:\.\d+)+\s*$/i,
  /^[.\s]{8,}\d+\s*$/,
  /^.{2,90}\.{5,}\s*\d+\s*$/,
];

const NAVIGATION_JUNK_PATTERNS = [
  /courses\s*tutorials\s*interview/i,
  /interview\s*prep\s*android\s*tutorial/i,
  /tutorial\s*interview\s*questions\s*projects/i,
  /last\s+updated\s*:\s*\d{1,2}\s+[a-z]{3}/i,
  /geeksforgeeks|w3schools|tutorialspoint/i,
];

// Split camelCase and numbers: "kotlinIsFun" -> "kotlin Is Fun"
// Add word boundaries to dense text (e.g., "Object-Oriented" becomes "Object Oriented")
function addWordBoundariesToDenseText(text) {
  return String(text || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([a-zA-Z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-zA-Z])/g, "$1 $2")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Check if text looks like code (Kotlin, Java, etc.)
function isCodeLikeText(text) {
  const value = String(text || "");
  return (
    /\bfun\s+\w+\s*\(/i.test(value)
    || /\b(?:val|var)\s+\w+\s*(?::|=)/i.test(value)
    || /\b(?:class|object|interface)\s+[A-Z]\w*(?:\s*[:({]|\s*$)/.test(value)
    || /\breturn\b.+[;}]/i.test(value)
    || /:\s*(String|Int|Boolean|Unit|List<|Map<|\([^)]*\)\s*->)/.test(value)
    || /->|=>|[{}]/.test(value)
    || /@\w+/.test(value)
  );
}

// Normalize text: fix spacing, fix common typos, trim whitespace
function normalizeKnowledgeText(text) {
  const value = String(text || "")
    .replace(/[\t\u00A0]+/g, " ")
    .replace(/\badding\s+\?\s+after\b/gi, "adding a question mark (?) after")
    .replace(/\b(String|Int|Boolean|Double|Float|Long|Short|Byte|Char)\s+\?/g, "$1?")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\bD\s+r\.\s+/g, "Dr. ")
    .replace(/\s{2,}/g, " ")
    .trim();

  return isCodeLikeText(value) ? value : addWordBoundariesToDenseText(value);
}

// Check if code snippet is cut off (unbalanced braces)
function isIncompleteCodeFragment(text) {
  const value = String(text || "").trim();
  if (!isCodeLikeText(value)) return false;
  if (/[-=]>?\s*$/.test(value)) return true;
  if (/[({[,]\s*$/.test(value)) return true;

  const opens = (value.match(/[({[]/g) || []).length;
  const closes = (value.match(/[)}\]]/g) || []).length;
  return opens > closes + 1;
}

// Check if text is an instruction (not conceptual content)
// Returns true if line looks like an exercise instruction (e.g., "Create...", "Write...")
function isExerciseInstructionLine(text) {
  const value = normalizeKnowledgeText(text);
  if (!value) return true;

  const words = countMeaningfulWords(value);
  const startsLikeExercise = /^(?:check|try|write|run|copy|open|click|select|enter|print|create|change|replace|look at|read)\b/i.test(value);
  const hasReasoningSignal = /\b(?:because|therefore|means|refers to|allows|requires|returns|throws|prevents|used to|used for|is|are)\b/i.test(value);

  if (/^(?:check|try|run|copy|open|click|select|enter|print)\b/i.test(value) && words <= 16) return true;
  return startsLikeExercise && words <= 12 && !hasReasoningSignal;
}

// Check for incomplete sentence fragments (trailing connectors)
// Returns true if text is a fragment (ends with connector words like "and", "or", etc.)
function isIncompleteProseFragment(text) {
  const value = normalizeKnowledgeText(text);
  if (!value) return true;
  if (isCodeLikeText(value)) return false;

  return (
    /\b(?:to|of|for|with|from|because|since|that|which|when|if|and|or)\.?$/i.test(value)
    || /\b(?:do not need to use|need to use|used to|allows the result to)\.?$/i.test(value)
  );
}

// Check if text is mostly uppercase (likely a header)
// Returns true if text is mostly uppercase (likely a header/title)
function isMostlyUppercase(text) {
  const letters = String(text || "").replace(/[^A-Za-z]/g, "");
  if (letters.length < 8) return false;
  const uppercase = letters.replace(/[^A-Z]/g, "").length;
  return uppercase / letters.length > 0.75;
}

// Check for course outline text (Unit 1, Chapter 5, etc.)
// Returns true if text looks like a course outline (e.g., "Unit 1", "Chapter 5", "Lesson 3")
function isLikelyCourseOutlineLine(text) {
  const value = String(text || "").trim();
  if (!value) return true;
  if (/^(unit|block)\s+\d+\b/i.test(value) && value.length < 140) return true;
  if (/^(chapter|module)\s+\d+\b/i.test(value) && isMostlyUppercase(value) && value.length < 140) return true;
  if (/^(table\s+of\s+contents|contents|syllabus)\b/i.test(value)) return true;
  if (/^.{2,100}\.{5,}\s*\d+\s*$/.test(value)) return true;
  if (/^[.\s]{8,}\d+\s*$/.test(value)) return true;
  return false;
}

// Check for navigation/boilerplate (sidebar, "Login", etc.)
function isLikelyNavigationJunk(text) {
  const compact = String(text || "").replace(/\s+/g, " ").trim();
  if (!compact) return true;
  const spaced = addWordBoundariesToDenseText(compact);
  const lower = spaced.toLowerCase();
  if (NAVIGATION_JUNK_PATTERNS.some((pattern) => pattern.test(spaced))) return true;

  const navTerms = [
    "courses",
    "tutorials",
    "interview",
    "questions",
    "projects",
    "last updated",
    "share",
    "login",
    "signup",
    "advertisement",
  ];
  const matches = navTerms.filter((term) => lower.includes(term)).length;
  return matches >= 4;
}

// Extract content after "Last updated" date
// Extract useful content from navigation junk text (e.g., "Next: Chapter 5" -> "Chapter 5")
function salvageUsefulTailFromNavigation(text) {
  const spaced = addWordBoundariesToDenseText(text);
  const afterDate = spaced.replace(/^.*?\blast\s+updated\s*:\s*\d{1,2}\s+[A-Za-z]{3,}\s*,?\s*\d{4}\s*/i, "").trim();
  const candidate = afterDate && afterDate !== spaced ? afterDate : spaced;
  const usefulStart = candidate.match(/\b(Android architecture|Android runtime|Linux kernel|Media library|Surface manager|Activity Manager|The basic working|The services|Applications framework|Application framework|View|Model|Presenter)\b[\s\S]*$/i);
  return usefulStart ? usefulStart[0].trim() : "";
}

// Clean single line: filter junk, salvage content
// Clean up a source line: remove HTML, fix common issues, normalize spacing
function sanitizeSourceLine(line) {
  let value = normalizeKnowledgeText(line);

  if (!value || /^---\s*PAGE\s+BREAK\s*---$/i.test(value)) return "";

  if (isLikelyNavigationJunk(value)) {
    const salvaged = salvageUsefulTailFromNavigation(value);
    value = salvaged || value;
  }

  return value;
}

// Check if text is just a title/header
// Returns true if text is just a title (short, no content)
function isLikelyTitleOnly(text) {
  const value = String(text || "").trim();
  if (!value) return true;
  if (isLikelyCourseOutlineLine(value)) return true;
  if (/^kotlin\s+language\s+documentation\b/i.test(value)) return true;
  if (/^welcome\s+to\s+our\s+tour\s+of\s+kotlin/i.test(value)) return true;
  if (/^kotlin\s+\d+(?:\.\d+)+\s*$/i.test(value)) return true;
  if (PDF_NOISE_PATTERNS.some((pattern) => pattern.test(value)) && value.length < 160) return true;
  return isMostlyUppercase(value)
    && value.length < 120
    && countMeaningfulWords(value) <= 9
    && !/[.?!:]/.test(value);
}

// Check if text is good learning content (not junk/navigation)
function isUsableKnowledgeText(text, { allowShort = false } = {}) {
  const value = normalizeKnowledgeText(String(text || "").trim());
  if (!value) return false;
  if (/^[=)}\],.;:!?-]/.test(value)) return false;
  if (isLikelyNavigationJunk(value)) return false;
  if (isLikelyTitleOnly(value)) return false;
  if (/\b---\s*PAGE\s+BREAK\s*---\b/i.test(value)) return false;
  if (isIncompleteCodeFragment(value)) return false;
  if (isExerciseInstructionLine(value)) return false;
  if (isIncompleteProseFragment(value)) return false;

  const words = countMeaningfulWords(value);
  if (isCodeLikeText(value)) return words >= 2;
  if (isPlaceholderText(value)) return false;
  if (allowShort) return words >= 2 || /\b[A-Z]{2,}\b/.test(value);

  const hasSentenceSignal = /[.!?:;]/.test(value);
  const hasLearningSignal = /\b(define|explain|describe|identify|understand|use|create|compare|process|component|activity|service|intent|layout|resource|manifest|android|application|development|device|emulator|sdk|api|lifecycle|model|view|presenter|library|manager|runtime|kernel|framework|architecture|interface|function|null|nullable|lambda|higher-order|class|object|collection|list|map|property|variable|type|compiler|expression|constructor|inheritance|coroutine|flow)\b/i.test(value);

  return words >= 6 && (hasSentenceSignal || hasLearningSignal || value.length > 90);
}

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


// Main entry point: clean PDF content for quiz generation
function cleanContentFromPdf(content) {
  let cleaned = String(content || "");

  // Remove page break markers
  cleaned = cleaned.replace(/\s*---\s*PAGE\s+BREAK\s*---\s*/gi, "\n\n");

  // Remove common PDF footer patterns (branding, page numbers)
  cleaned = cleaned.replace(/[^\n]*(?:Campus|CSDC|FH\s+Wien|Mobile\s+App|Development).*?\d+\s*$/gm, "");

  // Remove standalone page numbers
  cleaned = cleaned.replace(/^\s*\d+\s*$/gm, "");

  cleaned = cleaned
    .replace(/\r\n?/g, "\n")
    .split(/\n+/)
    .map((line) => sanitizeSourceLine(line))
    .filter((line) => {
      if (!line) return false;
      if (isLikelyNavigationJunk(line)) return false;
      if (isLikelyTitleOnly(line)) return false;
      if (PDF_NOISE_PATTERNS.some((pattern) => pattern.test(line)) && line.length < 160) return false;
      return countMeaningfulWords(line) >= 3 || /[.!?:]$/.test(line);
    })
    .join("\n");

  // Normalize horizontal whitespace while keeping paragraph boundaries
  cleaned = cleaned.replace(/[ \t\u00A0]{2,}/g, " ");
  cleaned = cleaned.replace(/(\n\s*){3,}/g, "\n\n");

  return cleaned.trim();
}

// Score line quality for quiz: positive signals (educational terms), negative (navigation/junk)
function scoreKnowledgeLine(line) {
  const value = normalizeKnowledgeText(line);
  if (!value || isLikelyTitleOnly(value) || isLikelyNavigationJunk(value) || isIncompleteCodeFragment(value)) {
    return -100;
  }

  const lower = value.toLowerCase();
  const wordCount = countMeaningfulWords(value);
  let score = 0;

  if (wordCount >= 7) score += 2;
  if (wordCount >= 14) score += 2;
  if (/[.!?:;]/.test(value)) score += 1;
  if (isCodeLikeText(value)) score += 1;

  // Domain-neutral educational signals (work across subjects)
  if (/\b(is|are|means|refers to|defined as|called|known as|consists of|includes|involves|allows|requires|used to|used for)\b/i.test(value)) score += 3;
  if (/\b(cause|causes|because|therefore|leads to|results in|prevents|reduces|increases|decreases|affects|depends on|indicates)\b/i.test(value)) score += 3;
  if (/\b(compare|unlike|whereas|however|difference|similar|contrast|distinguish|rather than|instead of)\b/i.test(value)) score += 3;
  if (/\b(step|phase|stage|sequence|process|procedure|protocol|assessment|diagnosis|treatment|intervention|exercise|technique|method|approach)\b/i.test(value)) score += 3;
  if (/\b(indication|contraindication|risk|warning|precaution|side effect|complication|limitation|exception|common mistake|pitfall)\b/i.test(value)) score += 4;
  if (/\b(example|for example|case|scenario|patient|student|practice|applied|application)\b/i.test(value)) score += 2;
  if (/\b(mechanism|principle|rule|classification|type|category|component|property|factor|criteria|symptom|sign|measurement|range|strength|mobility|pain)\b/i.test(value)) score += 3;

  // Negative signals
  if (/^kotlin\b/i.test(value) && value.length < 90) score -= 6;
  if (/\b(step|next|previous|contents|overview)\b/i.test(value) && wordCount < 8) score -= 5;
  if (/^\d+$/.test(value)) score -= 10;
  if (lower.includes("welcome to our tour")) score -= 12;
  if (value.includes("...") && wordCount < 8) score -= 6;

  return score;
}

// Select best content blocks by quality score (higher score = better quiz content)
function selectQuizSourceContent(cleanedText) {
  const text = String(cleanedText || "").trim();
  if (!text || text.length <= MAX_INPUT_CHARS) return text;

  const blocks = text
    .split(/\n{1,2}/)
    .map((block, index) => ({ text: normalizeKnowledgeText(block), index }))
    .filter((entry) => entry.text && entry.text.length >= 20)
    .map((entry) => ({ ...entry, score: scoreKnowledgeLine(entry.text) }))
    .filter((entry) => entry.score > 0);

  if (!blocks.length) {
    return text.slice(Math.floor(text.length * 0.2), Math.floor(text.length * 0.2) + MAX_INPUT_CHARS);
  }

  const selectedIndexes = new Set();
  blocks
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, 90)
    .forEach((entry) => selectedIndexes.add(entry.index));

  const selected = blocks
    .filter((entry) => selectedIndexes.has(entry.index))
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.text);

  let result = "";
  for (const block of selected) {
    const next = result ? `${result}\n\n${block}` : block;
    if (next.length > MAX_INPUT_CHARS) break;
    result = next;
  }

  return result || text.slice(0, MAX_INPUT_CHARS);
}

// Keep prompts bounded so free-tier providers are less likely to hit token limits.
function truncateContent(content) {
  const cleaned = cleanContentFromPdf(content);
  const text = typeof cleaned === "string" ? cleaned.trim() : "";
  if (!text) return "";
  return selectQuizSourceContent(text);
}

// Remove markdown code fences (```) from text
function stripCodeFences(text) {
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

// Try to parse JSON array from AI response (handles various formats)
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

// Remove duplicate strings (case-insensitive)
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

// Normalize keyword: lowercase, remove suffixes (ing, ed, es, s), trim quotes/dashes
function normalizeKeyword(word) {
  return String(word || "")
    .toLowerCase()
    .replace(/^['-]+|['-]+$/g, "")
    .replace(/(?:ing|ed|es|s)$/i, "");
}

// Normalize phrase for comparison: lowercase, remove special chars, remove stopwords
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

// Remove semantically duplicate strings (similar phrases count as duplicates)
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

// Extract meaningful tokens (remove short/generic words)
function meaningfulTokenSet(text) {
  const tokens = normalizePhrase(text)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !GENERIC_KEYWORDS.has(token));
  return new Set(tokens);
}

// Calculate token overlap ratio between two texts (0-1, higher = more similar)
function tokenOverlapRatio(left, right) {
  const leftTokens = meaningfulTokenSet(left);
  const rightTokens = meaningfulTokenSet(right);
  if (!leftTokens.size || !rightTokens.size) return 0;

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }

  return overlap / Math.min(leftTokens.size, rightTokens.size);
}

// Returns true if texts are very similar (>60% token overlap)
function isNearDuplicateText(left, right) {
  const leftNormalized = normalizePhrase(left);
  const rightNormalized = normalizePhrase(right);
  if (!leftNormalized || !rightNormalized) return false;
  if (leftNormalized === rightNormalized) return true;

  const shorter = leftNormalized.length <= rightNormalized.length ? leftNormalized : rightNormalized;
  const longer = leftNormalized.length > rightNormalized.length ? leftNormalized : rightNormalized;
  if (shorter.length >= 16 && longer.includes(shorter)) return true;

  return tokenOverlapRatio(left, right) >= 0.78;
}

// Remove near-duplicate texts (high token overlap)
function dedupeOverlappingText(values = []) {
  const result = [];
  for (const value of dedupeByMeaning(values)) {
    if (!result.some((existing) => isNearDuplicateText(existing, value))) {
      result.push(value);
    }
  }
  return result;
}

function answerAppearsInQuestion(answer, question) {
  const answerNormalized = normalizePhrase(answer);
  const questionNormalized = normalizePhrase(question);
  if (!answerNormalized || !questionNormalized) return false;

  if (answerNormalized.length <= 12) {
    const questionTokens = questionNormalized.split(/\s+/);
    const answerTokens = answerNormalized.split(/\s+/);
    if (answerTokens.length === 1) return questionTokens.includes(answerTokens[0]);
    return questionNormalized.includes(answerNormalized);
  }

  return questionNormalized.includes(answerNormalized) || tokenOverlapRatio(answer, question) >= 0.72;
}

// Heuristic filters to prevent placeholder or irrelevant content from polluting quizzes
function isPlaceholderText(value) {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!text) return true;

  const raw = typeof value === "string" ? value.trim() : "";
  if (isLikelyNavigationJunk(raw) || isLikelyTitleOnly(raw)) return true;

  // Reject leaked JSON-like fragments that sometimes appear in options/answers.
  // Example: Kotlin {"topic":"Kotlin","source":""}.
  const looksLikeJsonLeak = /\{[^\}]*\}|"topic"\s*:|"source"\s*:|"acceptedanswers"\s*:|"correctindices"\s*:/i.test(raw);

  // Meta/template-like phrasing (produces nonsense questions).
  const metaLike = (
    text.includes("learning objectives")
    || text.includes("after studying")
    || text.includes("metacognitive capabilities")
    || text.includes("problem-solving processes")
    || text.includes("the source mentions")
    || text.includes("which idea from the lesson")
    || text.includes("which details belong with this lesson idea")
    || text.includes("name one important concept linked")
    || text.includes("which term best completes")
    || text.includes("which statement best explains")
    || text.includes("this statement matches")
    || text.includes("matches the explanation")
    || text.includes("which interpretation is most consistent")
    || text.includes("like is mentioned")
    || text.includes("nearby")
    || text.includes("correct option")
    || text.includes("incorrect")
    || text.includes("kotlin language documentation")
    || text.includes("welcome to our tour of kotlin")
  );

  return (
    looksLikeJsonLeak
    || metaLike
    || /^\.{5,}/.test(text)
    || /^\d+$/.test(text)
    || /^option\s+\d+$/.test(text)
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

function isUsefulAnswerChoice(value, { allowTerm = false } = {}) {
  const text = addWordBoundariesToDenseText(String(value || "").trim());
  if (!text || isPlaceholderText(text)) return false;
  if (/\b---\s*PAGE\s+BREAK\s*---\b/i.test(text)) return false;

  const words = countMeaningfulWords(text);
  if (words >= 4) return true;
  if (!allowTerm) return false;

  const normalized = text.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (GENERIC_KEYWORDS.has(normalized)) return false;
  return /^[A-Z0-9]{2,}$/.test(text) || /^(view|model|presenter|activity|service|intent|manifest|sdk|api|kernel|runtime|library|interface)$/i.test(text);
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

// Extract meaningful sentences from content for quiz generation.
// Handles multiple formats: HTML lists (<li>), arrow chains (A > B > C), code blocks, plain text.
// Scores each candidate by informativeness and deduplicates by meaning. Returns top 20.
function extractSentences(content) {
  const input = truncateContent(content);
  const str = String(input || "");

  // Handle HTML list items (<li>), prefer them over plain sentence splitting.
  const liCandidates = /<\s*li[\s>]/i.test(str)
    ? str
      .replace(/<\s*\/\s*li\s*>/gi, "\n")
      .split(/<\s*li[^>]*>/gi)
      .map((s) => normalizeKnowledgeText(s.replace(/<[^>]+>/g, " ").trim()))
      .filter(Boolean)
    : [];

  // presentation slides often use “A > B > C” chains.
  // Splitting naively by '>' produces noisy, near-identical fragments. If we detect “Learning Objectives”, we only extract the tail after it.
  let arrowCandidates = [];
  const loIdx = str.toLowerCase().indexOf("learning objectives");
  if (loIdx >= 0) {
    const tail = str.slice(loIdx).trim();
    const learningObjectiveTail = tail.split(/learning objectives/i)[1] || tail;
    arrowCandidates = learningObjectiveTail
      .split(/\s*>\s*/g)
      .map((s) => s.replace(/<[^>]+>/g, " ").trim())
      .filter(Boolean);
  } else if (/\s>\s/.test(str)) {
    arrowCandidates = str
      .split(/\s*>\s*/g)
      .map((s) => normalizeKnowledgeText(s.replace(/<[^>]+>/g, " ").trim()))
      .filter(Boolean);
  }


  const codeCandidates = str
    .split(/\n{2,}/g)
    .map((s) => s.trim())
    .filter((s) => {
      const looksCodeLike = isCodeLikeText(s);
      const sentenceCount = (s.match(/[.!?]/g) || []).length;
      return looksCodeLike || sentenceCount <= 1 || s.length <= 320;
    })
    .filter(Boolean);

  const sentenceSource = str
    .replace(/\badding\s+\?\s+after\b/gi, "adding a question mark (?) after")
    .replace(/\b(String|Int|Boolean|Double|Float|Long|Short|Byte|Char)\s+\?/g, "$1?");

  const sentenceCandidates = sentenceSource
    .replace(/--- PAGE BREAK ---/gi, "\n\n")
    .replace(/[•*]\s+/g, "\n")
    .split(/(?<=[.!?])\s+|\n+/g)
    .map((s) => normalizeKnowledgeText(s.replace(/<[^>]+>/g, " ").trim()))
    .filter(Boolean);

  // Score candidates by informativeness (prefer code-like and longer explanations).
  const scored = dedupeByMeaning([
    ...liCandidates,
    ...arrowCandidates,
    ...codeCandidates,
    ...sentenceCandidates,
  ]).map((candidate) => {
    const c = normalizeKnowledgeText(String(candidate || "").trim());
    const lower = c.toLowerCase();
    const hasCode = isCodeLikeText(c);
    const hasKotlinTypes = /(flow<|flow\s*<|unit\b|state\b|mutablestat|snapshotstat|composable|navcontroller|navhost|compose)/i.test(c);
    const isPdfNoise = PDF_NOISE_PATTERNS.some((pattern) => pattern.test(c)) && c.length < 160;
    const titleOnlyPenalty = isLikelyTitleOnly(c) ? 12 : 0;
    const navigationPenalty = isLikelyNavigationJunk(c) ? 14 : 0;
    const hasLearningSignal = /\b(define|explain|describe|identify|understand|use|create|compare|process|component|activity|service|intent|layout|resource|manifest|android|application|development|device|emulator|sdk|api|lifecycle|model|view|presenter|library|manager|runtime|kernel|framework|architecture|interface|function|null|nullable|lambda|higher-order)\b/i.test(c);
    const wordCount = countMeaningfulWords(c);
    const incompleteCodePenalty = isIncompleteCodeFragment(c) ? 20 : 0;
    const score = (hasCode ? 1 : 0) + (hasKotlinTypes ? 2 : 0) + (hasLearningSignal ? 2 : 0) + Math.min(4, Math.floor(wordCount / 18)) - (isPdfNoise ? 8 : 0) - titleOnlyPenalty - navigationPenalty - incompleteCodePenalty;
    return { c, score };
  });

  return scored
    .filter((x) => x.c && x.c.length >= 25 && x.score > -4)
    .filter((x) => isUsableKnowledgeText(x.c))
    .filter((x) => !isIncompleteCodeFragment(x.c))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map((x) => shortenSentence(x.c, 260));
}


function shortenSentence(sentence, maxLength = 140) {
  const text = String(sentence || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= maxLength) return text;

  const clipped = text.slice(0, maxLength);
  const lastBoundary = Math.max(clipped.lastIndexOf(","), clipped.lastIndexOf(" "), clipped.lastIndexOf(";"));
  const cleanClip = clipped
    .slice(0, lastBoundary > 40 ? lastBoundary : maxLength)
    .replace(/[\s,;:]+$/g, "")
    .replace(/\b(and|or|with|including|such as|to|for|of|the)$/i, "")
    .trim();
  return `${cleanClip || clipped.trim()}...`;
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
  const clean = shortenSentence(removeLeadingConnectors(text), 120)
    .replace(/[.,;:]+$/g, "")
    .replace(/\b(and|or|with|including|such as|to|for|of|the)$/i, "")
    .trim();
  if (!clean) return "";

  // If the option is too long, convert it to a shorter, classroom-friendly summary.
  if (countMeaningfulWords(clean) > 18) {
    const head = clean.split(/\s+/).slice(0, 16).join(" ");
    return /[.!?]$/.test(head) ? head : `${head}.`;
  }

  return /[.!?]$/.test(clean) ? clean : `${clean}.`;
}

// Count words that are not stopwords to determine if a sentence has enough substance to be a quiz option.
function buildKeywordStatements(keywords = [], topicName = "") {
  return [];
}

function sanitizeConceptTerm(term) {
  let value = String(term || "")
    .replace(/[.,;:!?]+$/g, "")
    .replace(/^(?:if|when|where|while|because|since|from|into|onto|with|without|to|in|on|as|of|this|that|these|those|here|there|you|we|it|a|an|the)\s+/i, "")
    .replace(/^(?:appears|allows|throws|indicates|receives|receive|corresponds|correspond|passed)\s+/i, "")
    .replace(/^(?:because|that|which|where)\s+/i, "")
    .trim();

  value = value.replace(/^(?:the|a|an)\s+/i, "").trim();
  if (!value) return "";

  const normalized = normalizePhrase(value);
  if (!normalized || GENERIC_KEYWORDS.has(normalized)) return "";
  if (countMeaningfulWords(value) === 1 && WEAK_SINGLE_ANSWER_TERMS.has(normalized)) return "";
  if (countMeaningfulWords(value) > 5) return "";
  if (/^(?:if|from|into|onto|with|without|to|in|on|as|of|because|appears|allows|throws|indicates|receives|receive|corresponds|passed)\b/i.test(value)) return "";
  if (/\b(?:to the|to use|with a|belongs to|connected to|related to|attempts? to|used with)\b/i.test(value)) return "";

  return capitalize(value);
}

function extractConceptTerms(sentence, keywords = []) {
  const text = String(sentence || "");
  const lower = text.toLowerCase();
  const technicalTerms = [
    "activity",
    "activities",
    "service",
    "services",
    "intent",
    "intents",
    "manifest",
    "sdk",
    "emulator",
    "api",
    "apis",
    "lifecycle",
    "permissions",
    "components",
    "content provider",
    "broadcast receiver",
    "application framework",
    "operating system",
    "linux kernel",
    "native libraries",
    "android runtime",
    "media library",
    "surface manager",
    "activity manager",
    "display subsystem",
    "view",
    "model",
    "presenter",
    "nullable types",
    "null safety",
    "safe call",
    "elvis operator",
    "lambda expressions",
    "trailing lambdas",
    "builder lambda",
    "higher-order function",
    "unsigned arrays",
    "unit",
    "compiler error",
    "class cast exception",
    "casting",
    "type mismatch",
    "smart cast",
    "data class",
    "sealed class",
    "when expression",
    "extension function",
    "scope function",
    "collection",
    "list",
    "map",
  ];

  const fromKeywords = keywords
    .filter((keyword) => lower.includes(String(keyword || "").toLowerCase()))
    .filter((keyword) => !GENERIC_KEYWORDS.has(String(keyword || "").toLowerCase()));

  const fromText = technicalTerms
    .filter((term) => lower.includes(term))
    .map((term) => term.toUpperCase() === term ? term : capitalize(term));

  const academicPhraseMatches = text.match(/\b[A-Za-z][A-Za-z-]*(?:\s+[A-Za-z][A-Za-z-]*){0,3}\s+(?:assessment|therapy|training|protocol|procedure|technique|intervention|contraindication|contraindications|indication|indications|status|device|pattern|restriction|strengthening|mobility|motion|measurement|classification|criteria|mechanism|principle|rule|function|expression|type|operator|parameter|argument|property|constructor|interface|exception|array|arrays|lambda|lambdas|object|objects)\b/gi) || [];
  const normalizedPhrases = academicPhraseMatches
    .map((phrase) => phrase.trim())
    .map((phrase) => sanitizeConceptTerm(phrase))
    .filter(Boolean)
    .filter((phrase) => countMeaningfulWords(phrase) <= 5)
    .map((phrase) => capitalize(phrase));

  const acronyms = text.match(/\b[A-Z]{2,}\b/g) || [];

  return dedupeByMeaning([...fromText, ...normalizedPhrases, ...acronyms, ...fromKeywords])
    .map((term) => sanitizeConceptTerm(term))
    .filter(Boolean)
    .slice(0, 5);
}

function buildQuestionFocus(card, topicName) {
  const safeTopicName = capitalize(topicName || "General Knowledge");
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

function cleanQuestionFocus(focus, topicName) {
  const safeTopicName = capitalize(topicName || "General Knowledge");
  const parts = String(focus || "")
    .split("/")
    .map((part) => sanitizeConceptTerm(part))
    .filter(Boolean)
    .filter((part) => !GENERIC_KEYWORDS.has(normalizePhrase(part)))
    .filter((part) => countMeaningfulWords(part) <= 4);

  const unique = dedupeOverlappingText(parts).slice(0, 2);
  return unique.length ? unique.join(" and ") : safeTopicName;
}

// Build stem for multiple choice (based on answer content patterns)
function buildMultipleChoiceQuestion(card, topicName, index = 0) {
  const focus = cleanQuestionFocus(buildQuestionFocus(card, topicName), topicName);
  const answer = String(card?.answer || card?.sentence || "").toLowerCase();
  // Detect programming topics for tech-specific question stems
  const isProgrammingTopic = /\b(kotlin|java|javascript|python|programming|code|function|compiler|android|api|software)\b/i.test(topicName);
  const stems = [];

  // Pattern-based question generation - matches keywords in answer
  if (/\b(designed to|aims? to|goal|purpose|intended to)\b/i.test(answer)) {
    stems.push(`What is the main purpose of ${focus}?`);
  }
  if (/\b(develops?|helps?|allows?|enables?|improves?|strengthens?|restores?|reduces?|increases?)\b/i.test(answer)) {
    stems.push(`What benefit is described for ${focus}?`);
  }
  if (/\b(important|must|should|required|requires?|need to|maintain)\b/i.test(answer)) {
    stems.push(`What requirement or recommendation is emphasized for ${focus}?`);
  }
  if (!isProgrammingTopic && /\b(performed|involves?|uses?|utili[sz]es?|practice|apparatus|mat|exercise)\b/i.test(answer)) {
    stems.push(`How is ${focus} described as being practiced or used?`);
  }
  // Programming-specific stem for technical answers
  if (isProgrammingTopic && /\b(use|called|resolved|throws|return|type|function|compiler|exception|null)\b/i.test(answer)) {
    stems.push(`Which statement correctly explains ${focus}?`);
  }
  if (/\b(awareness|patterns?|dysfunction|pain|balance|body)\b/i.test(answer)) {
    stems.push(`What effect or role is described for ${focus}?`);
  }

  // Fallback stems (always included as backup)
  stems.push(`Which statement best describes ${focus}?`);
  stems.push(`What should a student remember about ${focus}?`);
  stems.push(`Which description matches ${focus}?`);
  stems.push(`What is emphasized about ${focus}?`);
  stems.push(`Which option accurately reflects ${focus}?`);

  return stems[index % stems.length];
}

// Build stem for multiple-select ("select all that apply")
function buildMultipleSelectQuestion(card, topicName, index = 0) {
  const focus = cleanQuestionFocus(buildQuestionFocus(card, topicName), topicName);
  const stems = [
    `Which statements are correct about ${focus}?`,
    `Which details correctly describe ${focus}?`,
    `Which points would help explain ${focus} to a student?`,
  ];

  return stems[index % stems.length];
}

// Build stem for open-answer (user types free text)
function buildOpenAnswerQuestion(card, topicName, index = 0) {
  const focus = cleanQuestionFocus(buildQuestionFocus(card, topicName), topicName);
  const stems = [
    `Name one key concept related to ${focus}.`,
    `Which key term is most closely connected to ${focus}?`,
  ];

  return stems[index % stems.length];
}

// Build open-answer payload: extracts answer from card content using regex patterns.
// Tries multiple patterns: "this process is called X", "return type is X", "Exception: thrown when...".
// Falls back to extracting keywords from card if no pattern matches.
// Returns null if no valid answer found.
function buildOpenAnswerPayload(card, topicName, index = 0) {
  const sentence = normalizeKnowledgeText(card?.sentence || card?.answer || "");
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

  // Fallback: extract keywords from card as accepted answers
  const rawAccepted = Array.isArray(card?.keywords) ? [...card.keywords] : [];
  const focus = cleanQuestionFocus(buildQuestionFocus(card, topicName), topicName);
  const acceptedAnswers = dedupeOverlappingText(rawAccepted)
    .map((answer) => sanitizeConceptTerm(answer))
    .filter(Boolean)
    .filter((answer) => !isPlaceholderText(answer))
    .filter((answer) => !answerAppearsInQuestion(answer, focus))
    .slice(0, 4);

  if (!acceptedAnswers.length) return null;

  const questionText = index % 2 === 0
    ? `Name one key concept related to ${focus}.`
    : `Which key term is most closely connected to ${focus}?`;

  const safeAnswers = acceptedAnswers.filter((answer) => !answerAppearsInQuestion(answer, questionText));
  if (!safeAnswers.length) return null;

  return {
    questionText,
    acceptedAnswers: safeAnswers,
  };
}

// Build question from code snippet: infers concept from code patterns.
// Detects: static method, function call, null safety (??, ?., !!), return type.
// Uses card keywords as fallback. Collects distractors from other cards.
// Returns null if insufficient options.
function buildCodeQuestionPayload(codeCard, allCards = [], topicName = "Programming") {
  if (!codeCard || codeCard.kind !== "code") return null;

  const sentence = String(codeCard.sentence || "");
  // Infer concept from code patterns (regex-based detection)
  const inferredConcept = (() => {
    if (/\bstatic\s+method\b/i.test(sentence)) return "Static method";
    if (/\bfun\s+\w+\s*\(|\w+\s*\([^)]*\)/i.test(sentence)) return "Function call";
    if (/\bnull|!!|\?\./i.test(sentence)) return "Null safety";
    if (/\breturn\s+type\b/i.test(sentence)) return "Return type";
    return "";
  })();

  // Fallback: extract from card keywords
  const extractedConcept = (Array.isArray(codeCard.keywords) ? codeCard.keywords : [])
    .map((term) => sanitizeConceptTerm(term))
    .find((term) => term && !GENERIC_KEYWORDS.has(normalizePhrase(term)));
  const correct = inferredConcept || extractedConcept;
  if (!correct) return null;

  // Collect distractors from other cards
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
    points: 10,
  };
}

// Build false statement for true/false question: uses distractors from card or keywords.
// Returns a statement different from the correct answer.
function buildFalseStatement(card, keyword, nextKeyword, safeTopicName) {
  const candidatePool = dedupeByMeaning([
    ...(Array.isArray(card?.distractors) ? card.distractors : []),
    ...buildKeywordStatements([nextKeyword, keyword], safeTopicName),
    `${capitalize(keyword)} is the main idea described in this lesson.`,
  ]);

  const falseStatement = candidatePool.find((statement) => statement.toLowerCase() !== String(card?.answer || "").trim().toLowerCase());
  return toOptionStatement(falseStatement || `${capitalize(keyword)} is the main idea described in this lesson.`);
}

// Build educational explanation from concept card
function buildEducationalExplanation(card, topicName) {
  const source = String(card?.sentence || card?.answer || "").trim();
  const terms = Array.isArray(card?.keywords) ? card.keywords.filter(Boolean).slice(0, 3) : [];

  if (card?.kind === "code") {
    const termText = terms.length ? ` The important idea is ${terms.join(", ")}.` : "";
    return `The snippet demonstrates a practical ${topicName} pattern rather than a definition.${termText}`;
  }

  return `Because the material states: ${shortenSentence(source, 160)}`;
}

// Build compact source excerpt to reduce prompt size and keep topical context.
function buildSourceExcerpt(topicName, content) {
  // Extract only the most topical slices instead of sending the full source every time.
  const safeTopicName = capitalize(topicName || "General Knowledge");
  const contentStr = String(content || "").trim();

  // If the “source” is empty (e.g., bad ingestion), do not poison the quiz with meta/placeholder.
  if (!contentStr) {
    return "";
  }

  const sentences = extractSentences(contentStr);
  const keywords = extractKeywords(contentStr, 10);
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
  const sentences = extractSentences(content).filter((sentence) => isUsableKnowledgeText(sentence));
  const cards = sentences
    .map((sentence, sentenceIndex) => buildConceptCardFromSentence(sentence, sentenceIndex, keywords, safeTopicName))
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

// Extract keywords by frequency while filtering out stopwords 
// and short terms, to build a topical keyword bank for quiz generation.
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

// Build one reusable card from a single sentence.
// Output: {id, kind, sentence, answer, summary, keywords, distractors, fragments}
// - kind: "code" if code-like, else "theory"
// - answer: formatted sentence for quiz answer
// - keywords: extracted technical terms from sentence
// - distractors: similar but incorrect options for multiple choice
// - fragments: split sentence parts for alternative questions
function buildConceptCardFromSentence(sentence, sentenceIndex, keywords, safeTopicName) {
  const sentenceLower = sentence.toLowerCase();
  const kind = isCodeLikeText(sentence) ? "code" : "theory";
  const fragments = sentenceFragments(sentence);
  const matchingKeywords = extractConceptTerms(sentence, keywords);
  const answerStatement = toOptionStatement(shortenSentence(sentence, 150));
  // Build distractors from sentence fragments + unrelated keywords
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

// Hard fallback if source is too weak and remote AI is unavailable.
function createMockQuiz(topicName) {
  // Last-resort emergency quiz when the source is too weak for a content-aware fallback.
  // Keep it non-template-like and grounded in the single available signal: the topic title.
  // (We intentionally avoid generic "source mentions" / "what term best completes" styles.)
  const safe = capitalize(topicName || "General Knowledge");
  const topic1 = `${safe} core idea`;
  const topic2 = `${safe} key mechanism`;
  const topic3 = `${safe} practical application`;
  const topic4 = `${safe} common pitfall`;

  return [
    {
      type: "multiple_choice",
      question: `Which description best matches ${safe}?`,
      options: [
        `${topic1} taught in the lesson`,
        `${topic4} taught as a risk`,
        `A unrelated historical event`,
        `A random software tool name`,
      ],
      correctIndex: 0,
      explanation: `The lesson focuses on the core idea of ${safe}.`,
      points: 10,
    },
    {
      type: "true_false",
      question: `Is ${safe} presented with both concept and practical implications?`,
      correctAnswer: true,
      explanation: `Good course material for ${safe} includes what it is and how it applies.`,
      points: 10,
    },
    {
      type: "multiple_select",
      question: `Which elements are typically part of understanding ${safe}? (Select all)`,
      options: [
        `${topic1}`,
        `${topic2}`,
        `${topic4}`,
        `Pure trivia without explanation`,
      ],
      correctIndices: [0, 1, 2],
      explanation: `${topic1}, ${topic2}, and ${topic4} are essential to understand ${safe}.`,
      points: 10,
    },
    {
      type: "reorder",
      question: `Put the understanding flow in a logical order:`,
      items: ["Learn the core idea", "Understand key mechanism", "Apply it to a scenario", "Check common pitfalls"],
      correctOrder: [0, 1, 2, 3],
      explanation: `A typical learning flow goes from concept to mechanism, then application and pitfalls.`,
      points: 10,
    },
    {
      type: "open_answer",
      question: `In one phrase, name the key mechanism for ${safe}.`,
      acceptedAnswers: [topic2],
      hint: `Key mechanism of ${safe}.`,
      explanation: `The key mechanism is the part that explains how ${safe} works.`,
      points: 10,
    },
    {
      type: "multiple_choice",
      question: `Which statement is most useful when studying ${safe}?`,
      options: [
        `${topic3} is the best way to remember it`,
        `Only memorize definitions without meaning`,
        `Ignore mechanisms and focus on unrelated details`,
        `Avoid connecting it to real use cases`,
      ],
      correctIndex: 0,
      explanation: `Connecting to practical application improves retention for ${safe}.`,
      points: 10,
    },
    {
      type: "true_false",
      question: `Does learning ${safe} require distinguishing correct ideas from common mistakes?`,
      correctAnswer: true,
      explanation: `Common pitfalls help learners avoid the most frequent misunderstandings.`,
      points: 10,
    },
    {
      type: "multiple_select",
      question: `Select statements that help you apply ${safe}. (Select all)`,
      options: [`Identify the mechanism`, `${topic3}`, `Guess without checking`, `${topic4}`],
      correctIndices: [0, 1, 3],
      explanation: `Application is built from mechanism, real use, and awareness of pitfalls.`,
      points: 10,
    },
    {
      type: "reorder",
      question: `Order these study steps from first to last:`,
      items: ["Read the core idea", "Extract key mechanism", "Try a scenario", "Summarize what to avoid"],
      correctOrder: [0, 1, 2, 3],
      explanation: `Study should progress from reading to mechanism, then scenarios, then pitfalls.`,
      points: 10,
    },
    {
      type: "open_answer",
      question: `Name one common pitfall associated with ${safe}.`,
      acceptedAnswers: [topic4],
      hint: `Common pitfall of ${safe}.`,
      explanation: `Pitfalls are frequent misunderstandings the lesson warns about.`,
      points: 10,
    },
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

// Main local quiz synthesizer: generates quiz when external AI fails or returns weak output.
// Uses concept cards + keyword extraction to build questions without external AI.
// Flow: extract sentences -> build concept cards -> extract keywords -> generate question variations.
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

  // Fallback to mock quiz if insufficient content
  if (seedKeywords.length < 4 && cards.length < 2) {
    return createMockQuiz(safeTopicName);
  }

  // Helper: get keyword at position (cycles through list)
  const keywordFor = (index) => {
    if (!Array.isArray(seedKeywords) || seedKeywords.length === 0) return safeTopicName;
    return seedKeywords[index % seedKeywords.length] || safeTopicName;
  };

  const reorderStems = [
    `Order these ${safeTopicName} ideas from setup to outcome.`,
    `Arrange the process details in the sequence implied by the material.`,
  ];

  // === SECTION 2: Track used questions/options to avoid duplicates ===
  const questions = [];
  const usedQuestionKeys = new Set();
  const usedCardIds = new Set();
  const usedOptionSets = new Set();
  const usedOptionPhrases = new Set();
  const usedOptionTexts = [];
  const usedOpenAnswers = new Set();

  // Check if option or option set was already used
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
  const cardFor = (index) => {
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

    for (let offset = 0; offset < cards.length; offset += 1) {
      const candidate = cards[(index + offset) % cards.length];
      if (!usedCardIds.has(candidate.id)) return candidate;
    }

    return cards[index % cards.length];
  };

  const relatedAnswersFor = (card, offsetSeed = 0) => {
    const sameMode = cards.filter((candidate) => candidate.id !== card.id && (card.kind === "code" || candidate.kind !== "code"));
    const pool = sameMode.length >= 3 ? sameMode : cards.filter((candidate) => candidate.id !== card.id);
    const rotated = pool.length
      ? [...pool.slice(offsetSeed % pool.length), ...pool.slice(0, offsetSeed % pool.length)]
      : [];
    return dedupeOverlappingText(rotated.map((candidate) => candidate.answer)).slice(0, 3);
  };

  // Main option builder: correct + distractors from various sources
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

  // === SECTION 4: Generate questions in order (mixed types) ===
  for (let index = 0; index < QUIZ_QUESTION_COUNT; index += 1) {
    const typeCycle = ["multiple_choice", "multiple_select", "open_answer", "multiple_choice", "reorder", "multiple_choice", "multiple_select", "open_answer", "multiple_choice", "true_false"];
    const type = typeCycle[index % typeCycle.length];
    const card = cardFor(index);
    const keyword = keywordFor(index);
    const nextKeyword = keywordFor(index + 1);
    const thirdKeyword = keywordFor(index + 2);
    const fourthKeyword = keywordFor(index + 3);
    const sentence = card.sentence;
    const correctStatement = card.answer || shortenSentence(sentence, 150);

    // === QUESTION TYPE: multiple_choice ===
    if (type === "multiple_choice") {
      const relatedStatements = relatedAnswersFor(card, index);
      const questionText = buildMultipleChoiceQuestion(card, safeTopicName, index);
      const options = buildChoiceOptions(correctStatement, [
        ...relatedStatements,
        ...card.distractors,
        ...buildKeywordStatements([nextKeyword, thirdKeyword, fourthKeyword], safeTopicName),
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
        points: 10
      });
      continue;
    }

    if (type === "true_false") {
      if (usedCardIds.has(card.id) && cards.length > questions.length) continue;
      const trueFalseStatement = toOptionStatement(card.answer);
      if (hasUsedOptionPhrase(trueFalseStatement) || isExerciseInstructionLine(trueFalseStatement) || isPlaceholderText(trueFalseStatement)) continue;
      questions.push({
        type,
        question: trueFalseStatement,
        correctAnswer: true,
        explanation: buildEducationalExplanation(card, safeTopicName),
        points: 10
      });
      usedCardIds.add(card.id);
      registerQuestionOptions([trueFalseStatement]);
      continue;
    }

    // === QUESTION TYPE: multiple_select (select all that apply) ===
    if (type === "multiple_select") {
      // Build correct options from card answer + fragments
      const possibleCorrectOptions = dedupeOverlappingText([
        card.answer,
        ...card.fragments.map((fragment) => toOptionStatement(fragment)),
      ])
        .filter((option) => !hasUsedOptionPhrase(option))
        .filter((option) => isUsefulAnswerChoice(option, { allowTerm: false }));
      const targetCorrectCount = (index % 3) + 1; // 1-3 correct answers
      const selectedCorrectOptions = possibleCorrectOptions.slice(0, targetCorrectCount);
      if (!selectedCorrectOptions.length) continue;

      const questionText = buildMultipleSelectQuestion(card, safeTopicName, index);
      // Build distractors from related cards and keywords
      const distractorPool = dedupeOverlappingText([
        ...relatedAnswersFor(card, index),
        ...buildKeywordStatements(seedKeywords.slice(index, index + 5), safeTopicName),
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

      // Check for duplicate question, skip if seen before
      const key = `${type}::${questionText}`.toLowerCase();
      if (usedQuestionKeys.has(key)) {
        continue;
      }
      usedQuestionKeys.add(key);
      usedCardIds.add(card.id);
      registerQuestionOptions(options);

      // Push the multiple_select question
      questions.push({
        type,
        question: questionText,
        options,
        correctIndices: correctIndices.length ? correctIndices : [0],
        explanation: buildEducationalExplanation(card, safeTopicName),
        points: 10
      });
      continue;
    }

    // === QUESTION TYPE: reorder (arrange in order) ===
    if (type === "reorder") {
      // Get fragments from card to use as reorder items
      const logicalItems = dedupeByMeaning(card.fragments)
        .filter((item) => countMeaningfulWords(item) >= 4)
        .slice(0, 4);

      // Fallback: not enough items for reorder, convert to multiple_choice instead
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
          points: 10
        });
        continue;
      }

      // Build shuffled reorder with correct answer order
      const { items, correctOrder } = buildShuffledOrderPayload(logicalItems);
      const questionText = reorderStems[index % reorderStems.length];
      const key = `${type}::${questionText}`.toLowerCase();
      if (usedQuestionKeys.has(key)) {
        continue;
      }
      usedQuestionKeys.add(key);
      usedCardIds.add(card.id);

      // Push the reorder question
      questions.push({
        type,
        question: questionText,
        items,
        correctOrder,
        explanation: buildEducationalExplanation(card, safeTopicName),
        points: 10
      });
      continue;
    }

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
      hint: shortenSentence(sentence, 80),
      explanation: buildEducationalExplanation(card, safeTopicName),
      points: 10
    });
    registerOpenAnswers(acceptedAnswers);
  }

  // === FILL LOOP: generate more questions if initial loop didn't produce enough ===
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
    const correctStatement = card.answer || shortenSentence(card.sentence, 140);
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
      points: 10,
    });
  }

  // === RELAXED FILL LOOP: fallback with more lenient card selection ===
  let relaxedFillIndex = 0;
  while (questions.length < QUIZ_QUESTION_COUNT && relaxedFillIndex < QUIZ_QUESTION_COUNT * 8) {
    const card = cards.length ? cards[relaxedFillIndex % cards.length] : cardFor(relaxedFillIndex);
    const correctStatement = card.answer || shortenSentence(card.sentence, 140);
    const questionText = buildMultipleChoiceQuestion(card, safeTopicName, relaxedFillIndex + 3);
    const key = `multiple_choice::${questionText}`.toLowerCase();
    relaxedFillIndex += 1;

    if (usedQuestionKeys.has(key)) continue;
    const options = buildChoiceOptions(correctStatement, [
      ...relatedAnswersFor(card, relaxedFillIndex),
      ...card.distractors,
      ...cards.filter((candidate) => candidate.id !== card.id).map((candidate) => candidate.answer),
    ], questionText);

    // Fallback: not enough options, try open_answer or true_false instead
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
            hint: shortenSentence(card.sentence, 80),
            explanation: buildEducationalExplanation(card, safeTopicName),
            points: 10,
          });
          registerOpenAnswers(acceptedAnswers);
        }
      } else {
        // Fallback to true_false if no open_answer possible
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
            points: 10,
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
      points: 10,
    });
  }

  // === EMERGENCY LOOP: generate true_false as last resort ===
  let emergencyIndex = 0;
  while (questions.length < QUIZ_QUESTION_COUNT && emergencyIndex < cards.length * 2) {
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
      points: 10,
    });
  }

  // === CODE QUESTION: inject code-based question if no code question exists ===
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

// Normalize question payload: ensures AI output and fallback share one frontend shape.
// Handles all question types: multiple_choice, true_false, multiple_select, reorder, open_answer.
// Validates options, shuffles answers, deduplicates entries, clamps points.
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
  
  // Add hidden source metadata for teacher verification (not shown to students)
  if (sourceMetadata) {
    base._source = sourceMetadata;
  }

  if (baseType === "true_false") {
    return {
      ...base,
      correctAnswer: Boolean(rawQuestion?.correctAnswer),
    };
  }

  if (baseType === "open_answer") {
    const acceptedAnswers = dedupeStrings(rawQuestion?.acceptedAnswers);
    const usableAnswers = dedupeOverlappingText(acceptedAnswers)
      .filter((answer) => !isPlaceholderText(answer))
      .filter((answer) => !answerAppearsInQuestion(answer, baseQuestion));
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

// Main entry point: Returns normalized questions with source metadata (topic, timestamp).
// Falls back to local generation if AI output is weak or empty.
function normalizeQuizPayload(questions, topicName, content) {
  const sourceMetadata = { topic: topicName, timestamp: new Date().toISOString() };
  const normalized = Array.isArray(questions)
    ? questions.map((question, index) => normalizeQuestion(question, index, sourceMetadata))
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

  return buildContentAwareQuiz(topicName, content).map((question, index) => normalizeQuestion(question, index, sourceMetadata));
}

// Quality heuristics decide whether to trigger quiz repair pass.
function getQuestionOptions(question) {
  if (Array.isArray(question?.options)) return question.options;
  if (question?.type === "true_false") return ["True", "False"];
  return [];
}

// Count total words in text (including stopwords)
function countMeaningfulWords(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

// Check if question text is generic/template-like (not specific to material)
function isGenericQuestionText(text) {
  const normalized = String(text || "").trim().toLowerCase();
  if (!normalized) return true;

  // Meta / template-like phrasing that often produces "nonsense" questions.
  const metaPatterns = [
    // "source-based" templates (frequent in provider output)
    "the source mentions",
    "the source",
    "as mentioned",
    "like is mentioned",
    "nearby",
    "the source mentions x",

    // generic completion scaffolds
    "which term best completes",
    "which statement best explains",
    "this statement matches",
    "matches the explanation",
    "which interpretation is most consistent",
    "which term best completes this idea",

    // wikipedia-style meta
    "which of these terms appear in the source",
    "which of these terms",

    // explicit template words
    "after studying",
    "learning objectives",

    // generic placeholders
    "correct answer",
    "incorrect",
    "inc orrect",
    "the correct answer"
  ];

  const allPatterns = [...GENERIC_QUESTION_PATTERNS, ...metaPatterns];
  return allPatterns.some((pattern) => normalized.includes(pattern));
}

// Check if question has weak/placeholder options
function hasWeakOptions(question) {
  const options = getQuestionOptions(question);
  if (question?.type === "open_answer" || question?.type === "reorder") return false;
  if (options.length < 2) return true;

  // If too many options look template/meta-like, quiz becomes non-informative.
  const metaLike = options.filter((option) => {
    const t = String(option || "").toLowerCase();
    return (
      t.includes("the source mentions")
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

/// Assess quiz quality: checks for generic questions, weak options, duplicates
function assessQuizQuality(questions = []) {
  const normalizedQuestions = Array.isArray(questions) ? questions : [];

  // Count generic questions (not specific to material content)
  const genericQuestions = normalizedQuestions.filter((question) => isGenericQuestionText(question?.question)).length;

  // Count weak options (too short to be meaningful answers)
  const weakOptions = normalizedQuestions.filter((question) => hasWeakOptions(question)).length;

  // Count true/false questions (can indicate low-effort generation)
  const trueFalseCount = normalizedQuestions.filter((question) => question?.type === "true_false").length;

  // Count application/analysis questions (higher quality)
  // These require understanding, not just recall
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

  // Check for duplicate question stems
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

// Build prompt for AI quiz generation
function buildPrompt({ topicName, content }) {
  const excerpt = buildSourceExcerpt(topicName, content);
  return [
    `Generate exactly ${QUIZ_QUESTION_COUNT} quiz questions in strict JSON array format.`,
    "Think like a teacher preparing a meaningful assessment for this topic.",
    "First decide what a teacher would normally ask students to understand, apply, compare, or avoid confusing.",
    "Use the topic source only. Do not invent facts that are not supported by the source.",
    "Ignore covers, table of contents, navigation text, page numbers, metadata, welcome text, and section lists without explanatory content.",
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

    // Strongly discourage meta/template phrasing that produces nonsense questions.
    "Never use templates like: 'the source mentions...', 'like is mentioned nearby', 'which term best completes...', 'this statement matches...', 'which interpretation is most consistent'.",

    "Vary the question stems. Use classroom prompts like: why, how, compare, diagnose, predict, classify, justify, choose the best example, identify the correct sequence.",
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

// Build repair prompt for quiz improvement
function buildRepairPrompt({ topicName, content, previousQuiz }) {
  const excerpt = buildSourceExcerpt(topicName, content);
  return [
    "Rewrite the quiz from scratch in strict JSON array format.",
    "The previous attempt was too generic, repetitive, or shallow.",
    "Think like a teacher: test important understanding, common confusions, edge cases, and practical application from the material.",
    `Generate exactly ${QUIZ_QUESTION_COUNT} stronger questions using only the source below.`,
    "Ignore covers, table of contents, navigation text, page numbers, metadata, welcome text, and section lists without explanatory content.",
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

// Build RAG prompts for quiz generation (combines topic with retrieved context)
function buildRagQuizPrompts(topicName) {
  return [
    [
      `You are helping a teacher prepare a quiz about "${topicName}".`,
      "Ignore covers, table of contents, page numbers, navigation text, welcome text, and document metadata.",
      "Using only the course material, list 8-12 concrete things a teacher would normally ask students to know.",
      "Prefer definitions, mechanisms, rules, procedures, classifications, contraindications, exceptions, and practical applications.",
      "Return short source-grounded bullet points only.",
    ].join(" "),
    [
      `For "${topicName}", identify the subtle points, common confusions, edge cases, or mistakes that a good teacher would test.`,
      "Use only the material. Avoid generic study advice.",
      "Return short bullet points phrased as testable knowledge.",
    ].join(" "),
    [
      `For "${topicName}", suggest practical or applied situations from the material that could become quiz questions.`,
      "Examples: choose the correct procedure, diagnose the misconception, predict what happens, compare two concepts, select contraindications or required steps.",
      "Stay source-grounded and concise.",
    ].join(" "),
    [
      `Extract the most quiz-worthy terms and relationships for "${topicName}".`,
      "Do not include title-page text, course navigation, page numbers, or section list items unless the section contains a real concept.",
      "Return terms with one short explanation each.",
    ].join(" "),
  ];
}

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

// Build local fallback summary when remote AI service is unavailable
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
/**
 * Schickt Textinhalte an das RAG-System (Python AI Service), 
 * damit die KI sie als Wissensquelle nutzen kann.
 */
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
