// Text cleanup and comparison helpers for quiz generation.
// This file prepares PDF/HTML text before the engine creates cards and questions.
const {
  GENERIC_KEYWORDS,
  NAVIGATION_JUNK_PATTERNS,
  PDF_NOISE_PATTERNS,
  STOPWORDS,
} = require("./quizNormalizer");

// Keep source text bounded before building prompts or fallback quizzes.
const MAX_INPUT_CHARS = Number(process.env.AI_MAX_INPUT_CHARS || 14000);

// Add readable boundaries to dense PDF text.
function addWordBoundariesToDenseText(text) {
  return String(text || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([a-zA-Z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-zA-Z])/g, "$1 $2")
    .replace(/([a-z])\.([A-Z])/g, "$1. $2")
    .replace(/([a-z])(:)([A-Z])/g, "$1$2 $3")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Detect code-like snippets.
function isCodeLikeText(text) {
  const value = String(text || "");
  return (
    /\bfun\s+\w+\s*\(/i.test(value)
    || /\b(?:val|var)\s+\w+\s*(?::|=)/i.test(value)
    || /\b(?:class|object|interface)\s+[A-Z]\w*(?:\s*[:({]|\s*$)/.test(value)
    || /\breturn\b.+[;}]/i.test(value)
    || /:\s*(String|Int|Boolean|Unit|List<|Map<|\([^)]*\)\s*->)/.test(value)
    || /->|=>|[{}]/.test(value)
    || /^\s*@\w+\s*$/.test(value)
    || /\b(?:for|while|if|switch|catch)\s*\(/.test(value)
    || /\b(?:System\.out\.\w+|console\.\w+)\s*\(/.test(value)
    || /\b(?:int|long|double|float|boolean|char|String)\s+\w+\s*(?:=|;)/.test(value)
  );
}

// Normalize spacing and common PDF extraction glitches.
function normalizeKnowledgeText(text) {
  const raw = String(text || "");
  const prepared = isCodeLikeText(raw)
    ? raw
    : raw
      .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, " ")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/https?:\/\/\S+/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+#{1,6}\s+.*$/g, " ")
      .replace(/^\s{0,3}#{1,6}\s+/gm, "")
      .replace(/[*_~]{1,3}/g, "");
  const value = prepared
    .replace(/[\t\u00A0]+/g, " ")
    .replace(/([a-z])\.([A-Z])/g, "$1. $2")
    .replace(/([a-z])(:)([A-Z])/g, "$1$2 $3")
    .replace(/\badding\s+\?\s+after\b/gi, "adding a question mark (?) after")
    .replace(/\b(String|Int|Boolean|Double|Float|Long|Short|Byte|Char)\s+\?/g, "$1?")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\bD\s+r\.\s+/g, "Dr. ")
    .replace(/\s{2,}/g, " ")
    .trim();

  return isCodeLikeText(value) ? value : addWordBoundariesToDenseText(value);
}

// Reject broken code fragments.
function isIncompleteCodeFragment(text) {
  const value = String(text || "").trim();
  if (!isCodeLikeText(value)) return false;
  if (/[-=]>?\s*$/.test(value)) return true;
  if (/[({[,]\s*$/.test(value)) return true;

  const opens = (value.match(/[({[]/g) || []).length;
  const closes = (value.match(/[)}\]]/g) || []).length;
  return opens > closes + 1;
}

// Reject exercise commands that are not quiz knowledge.
function isExerciseInstructionLine(text) {
  const value = normalizeKnowledgeText(text);
  if (!value) return true;

  const words = countMeaningfulWords(value);
  const startsLikeExercise = /^(?:do|check|try|write|run|copy|open|click|select|enter|print|create|change|replace|complete|follow|look at|read)\b/i.test(value);
  const hasReasoningSignal = /\b(?:because|therefore|means|refers to|allows|requires|returns|throws|prevents|used to|used for|is|are)\b/i.test(value);

  if (/^(?:do|check|try|run|copy|open|click|select|enter|print|complete|follow)\b/i.test(value) && words <= 20) return true;
  return startsLikeExercise && words <= 12 && !hasReasoningSignal;
}

// Reject prose that ends mid-thought.
function isIncompleteProseFragment(text) {
  const value = normalizeKnowledgeText(text);
  if (!value) return true;
  if (isCodeLikeText(value)) return false;
  if (/^(?:infers?|with|but|and|or|because|since|that|which|when|if|while|whereas|although)\b/i.test(value)) return true;

  return (
    /\b(?:to|of|for|with|from|because|since|that|which|when|if|and|or)\.?$/i.test(value)
    || /\b(?:do not need to use|need to use|used to|allows the result to)\.?$/i.test(value)
  );
}

// Detect uppercase headers.
function isMostlyUppercase(text) {
  const letters = String(text || "").replace(/[^A-Za-z]/g, "");
  if (letters.length < 8) return false;
  const uppercase = letters.replace(/[^A-Z]/g, "").length;
  return uppercase / letters.length > 0.75;
}

// Detect course-outline lines.
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

// Detect website navigation and boilerplate.
function isLikelyNavigationJunk(text) {
  const compact = String(text || "").replace(/\s+/g, " ").trim();
  if (!compact) return true;
  const spaced = addWordBoundariesToDenseText(compact);
  const lower = spaced.toLowerCase();
  if (NAVIGATION_JUNK_PATTERNS.some((pattern) => pattern.test(spaced))) return true;
  if (/courses\s*tutorials\s*interview/i.test(spaced) || /coursesTutorialsInterview/i.test(compact)) return true;

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

// Salvage useful text from a noisy navigation line.
function salvageUsefulTailFromNavigation(text) {
  const spaced = addWordBoundariesToDenseText(text);
  const afterDate = spaced.replace(/^.*?\blast\s+updated\s*:\s*\d{1,2}\s+[A-Za-z]{3,}\s*,?\s*\d{4}\s*/i, "").trim();
  const candidate = afterDate && afterDate !== spaced ? afterDate : spaced;
  return isLikelyNavigationJunk(candidate) ? "" : candidate;
}

// Clean one source line before scoring it.
function sanitizeSourceLine(line) {
  const raw = String(line || "").trim();
  if (/^\s{0,3}#{1,6}\s+/.test(raw)) return "";

  let value = normalizeKnowledgeText(raw);

  if (!value || /^---\s*PAGE\s+BREAK\s*---$/i.test(value)) return "";

  if (isLikelyNavigationJunk(value)) {
    const salvaged = salvageUsefulTailFromNavigation(value);
    value = salvaged || value;
  }

  return value;
}

// Reject title-only lines.
function isLikelyTitleOnly(text) {
  const value = String(text || "").trim();
  if (!value) return true;
  if (isLikelyCourseOutlineLine(value)) return true;
  if (PDF_NOISE_PATTERNS.some((pattern) => pattern.test(value)) && value.length < 160) return true;
  const words = value.split(/\s+/).filter(Boolean);
  const titleWords = words.filter((word) => /^(?:[A-Z][A-Za-z0-9/@.-]*|of|and|in|for|to|the|a|an)$/.test(word));
  if (words.length >= 2 && words.length <= 9 && titleWords.length === words.length && !/[.?!:;]/.test(value)) return true;
  return isMostlyUppercase(value)
    && value.length < 120
    && countMeaningfulWords(value) <= 9
    && !/[.?!:]/.test(value);
}

// Reject editorial narration.
function isEditorialNarration(text) {
  const value = String(text || "").trim();
  if (!value || isCodeLikeText(value)) return false;
  return (
    /\b(?:I|we|our|my|me|us|let['’]s|let us|hopefully)\b/i.test(value)
    || /^[aq]\s*:/i.test(value)
    || /^how to\b/i.test(value)
    || /^q\s*:/i.test(value)
    || /\?$/.test(value)
    || /^[‘’'"]/.test(value)
    || /^(?:line|step)\s*\d+\s*:/i.test(value)
    || /^(?:now|next),?\s+(?:let['’]s|we)\b/i.test(value)
    || /^for this example\b/i.test(value)
    || /^as an example\b/i.test(value)
    || /^so\s+(?:a|an|the)\b.*\bwould be\b/i.test(value)
    || /^in fact,?\s+it\b/i.test(value)
    || /^otherwise\b/i.test(value)
    || /^the last three steps\b/i.test(value)
    || /^these all\b/i.test(value)
    || /\binterview question\b/i.test(value)
    || /\bmake sure\b/i.test(value)
    || /\b(?:sometimes ignore this final step|other employees deploy)\b/i.test(value)
    || /\b(?:a few words about|about the author|started coding when|fell in love with coding|author bio)\b/i.test(value)
  );
}

// Decide whether a line contains usable learning content.
function isUsableKnowledgeText(text, { allowShort = false } = {}) {
  const value = normalizeKnowledgeText(String(text || "").trim());
  if (!value) return false;
  if (/^[=)}\],.;:!?-]/.test(value)) return false;
  if (/^\/\//.test(value)) return false;
  if (/^@\w+\s*\([^)]*\)\s*[.;]?$/.test(value)) return false;
  if (isLikelyNavigationJunk(value)) return false;
  if (isLikelyTitleOnly(value)) return false;
  if (isEditorialNarration(value)) return false;
  if (/\b---\s*PAGE\s+BREAK\s*---\b/i.test(value)) return false;
  if (isIncompleteCodeFragment(value)) return false;
  if (isExerciseInstructionLine(value)) return false;
  if (isIncompleteProseFragment(value)) return false;

  const words = countMeaningfulWords(value);
  if (isCodeLikeText(value)) return words >= 2;
  if (/^[a-z]/.test(value)) return false;
  if (isPlaceholderText(value)) return false;
  if (allowShort) return words >= 2 || /\b[A-Z]{2,}\b/.test(value);

  const hasSentenceSignal = /[.!?:;]/.test(value);
  const hasLearningSignal = /\b(define|explain|describe|identify|compare|classify|process|component|principle|rule|method|approach|framework|model|theory|mechanism|cause|effect|risk|benefit|limitation|exception|procedure|protocol|assessment|diagnosis|treatment|evidence|case|example|application|relationship|pattern|structure|function|property|factor|criterion|criteria|symptom|sign|measurement|law|policy|contract|scale|interval|rhythm|harmony)\b/i.test(value);
  const hasPredicate = /\b(is|are|was|were|has|have|can|cannot|means|refers|defines|describes|includes|involves|allows|requires|supports|helps|provides|offers|encourages|uses|verifies|compares|checks|marks|runs|groups|detects|indicates|causes|prevents|reduces|increases|affects|depends|validates|ensures|enables|consists|contains|performs|executes|returns|throws|ended|established|led)\b/i.test(value);

  return words >= 6 && hasPredicate && (hasSentenceSignal || hasLearningSignal || value.length > 90);
}


// Main PDF/content cleanup entry point.
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
      if (isCodeLikeText(line) || /^[{}\[\]();]+$/.test(line)) return true;
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

// Score a line by quiz usefulness.
function scoreKnowledgeLine(line) {
  const value = normalizeKnowledgeText(line);
  if (!value || isLikelyTitleOnly(value) || isLikelyNavigationJunk(value) || isEditorialNarration(value) || isIncompleteCodeFragment(value)) {
    return -100;
  }

  const lower = value.toLowerCase();
  const wordCount = countMeaningfulWords(value);
  let score = 0;

  if (wordCount >= 7) score += 2;
  if (wordCount >= 14) score += 2;
  if (/[.!?:;]/.test(value)) score += 1;
  if (isCodeLikeText(value)) score += 6;

  // Reward educational signals.
  if (/\b(is|are|means|refers to|defined as|called|known as|consists of|includes|involves|allows|requires|used to|used for)\b/i.test(value)) score += 3;
  if (/\b(cause|causes|because|therefore|leads to|results in|prevents|reduces|increases|decreases|affects|depends on|indicates)\b/i.test(value)) score += 3;
  if (/\b(compare|unlike|whereas|however|difference|similar|contrast|distinguish|rather than|instead of)\b/i.test(value)) score += 3;
  if (/\b(step|phase|stage|sequence|process|procedure|protocol|assessment|diagnosis|treatment|intervention|exercise|technique|method|approach)\b/i.test(value)) score += 3;
  if (/\b(indication|contraindication|risk|warning|precaution|side effect|complication|limitation|exception|common mistake|pitfall)\b/i.test(value)) score += 4;
  if (/\b(example|for example|case|scenario|patient|student|practice|applied|application)\b/i.test(value)) score += 2;
  if (/\b(mechanism|principle|rule|classification|type|category|component|property|factor|criteria|symptom|sign|measurement|range|strength|mobility|pain)\b/i.test(value)) score += 3;

  // Penalize weak/noisy lines.
  if (/\b(step|next|previous|contents|overview)\b/i.test(value) && wordCount < 8) score -= 5;
  if (/^\d+$/.test(value)) score -= 10;
  if (lower.includes("welcome to our tour")) score -= 12;
  if (value.includes("...") && wordCount < 8) score -= 6;

  return score;
}

// Keep the strongest blocks when content is long.
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
    .sort((left, right) => right.score - left.score || left.index - right.index)
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

// Shared shuffle helper used for options, reorder payloads, and fallback generation.
function shuffleArray(items) {
  const copy = Array.isArray(items) ? [...items] : [];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

// Remove exact duplicate strings.
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

// Normalize one keyword for matching.
function normalizeKeyword(word) {
  return String(word || "")
    .toLowerCase()
    .replace(/^['-]+|['-]+$/g, "")
    .replace(/(?:ing|ed|es|s)$/i, "");
}

// Normalize a phrase for fuzzy comparison.
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

// Remove meaning-level duplicates.
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

// Extract tokens used for overlap checks.
function meaningfulTokenSet(text) {
  const tokens = normalizePhrase(text)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !GENERIC_KEYWORDS.has(token));
  return new Set(tokens);
}

// Measure fuzzy text overlap.
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

// Detect near-duplicate text.
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

// Remove overlapping answer/options text.
function dedupeOverlappingText(values = []) {
  const result = [];
  for (const value of dedupeByMeaning(values)) {
    if (!result.some((existing) => isNearDuplicateText(existing, value))) {
      result.push(value);
    }
  }
  return result;
}

// Prevent answers from being visible inside the question.
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

// Reject placeholders and leaked template text.
function isPlaceholderText(value) {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!text) return true;

  const raw = typeof value === "string" ? value.trim() : "";
  if (isLikelyNavigationJunk(raw) || isLikelyTitleOnly(raw)) return true;

  // Reject leaked JSON-like fragments that sometimes appear in options/answers.
  // Example: Kotlin {"topic":"Kotlin","source":""}.
  const looksLikeJsonLeak = /\{[^\}]*\}|"topic"\s*:|"source"\s*:|"acceptedanswers"\s*:|"correctindices"\s*:/i.test(raw);
  const looksLikeWebLeak = /https?:\/\/|www\.|!\[[^\]]*\]\(|\[[^\]]+\]\([^)]*\)|\bimage\s*\d*\s*:/i.test(raw);

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
    || text.includes("courses tutorials interview")
    || text.includes("interview prep android")
  );

  return (
    looksLikeJsonLeak
    || looksLikeWebLeak
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

// Check whether an answer option is usable.
function isUsefulAnswerChoice(value, { allowTerm = false } = {}) {
  const text = addWordBoundariesToDenseText(String(value || "").trim());
  if (!text || isPlaceholderText(text)) return false;
  if (/\b---\s*PAGE\s+BREAK\s*---\b/i.test(text)) return false;
  if (isLikelyNavigationJunk(text)) return false;
  if (/[⇒→]\s*error\b/i.test(text)) return false;
  if (isIncompleteProseFragment(text)) return false;
  if (!allowTerm && /\b(?:val|var|fun)\s+\w+\s*(?:=|\()/i.test(text)) return false;

  const words = countMeaningfulWords(text);
  if (words >= 4) return true;
  if (!allowTerm) return false;

  const normalized = text.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (GENERIC_KEYWORDS.has(normalized)) return false;
  return /^[A-Z0-9]{2,}$/.test(text) || /^(view|model|presenter|activity|service|intent|manifest|sdk|api|kernel|runtime|library|interface)$/i.test(text);
}

// Clamp numeric question points and default to 1 for new quizzes.
function clampPoints(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.min(100, Math.max(1, Math.round(numeric)));
}

// Capitalize the first letter of a word and trim it, with a safe default.
function capitalize(value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "Concept";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Count total words in text.
function countMeaningfulWords(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

// Extract source sentences for concept cards.
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

  // Keep adjacent code lines together.
  const codeBlocks = [];
  let currentCode = [];
  const flushCode = () => {
    if (currentCode.length) codeBlocks.push(currentCode.join("\n"));
    currentCode = [];
  };

  str.split(/\n+/).forEach((line) => {
    const value = line.trim();
    if (isCodeLikeText(value) || /^[{}\[\]();]+$/.test(value)) currentCode.push(value);
    else flushCode();
  });
  flushCode();

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
    ...codeBlocks,
    ...codeCandidates,
    ...sentenceCandidates,
  ]).map((candidate) => {
    const c = normalizeKnowledgeText(String(candidate || "").trim());
    const lower = c.toLowerCase();
    const hasCode = isCodeLikeText(c);
    const isPdfNoise = PDF_NOISE_PATTERNS.some((pattern) => pattern.test(c)) && c.length < 160;
    const titleOnlyPenalty = isLikelyTitleOnly(c) ? 12 : 0;
    const navigationPenalty = isLikelyNavigationJunk(c) ? 14 : 0;
    const hasLearningSignal = /\b(define|explain|describe|identify|compare|process|component|principle|rule|method|approach|framework|model|theory|classification|criteria|mechanism|cause|effect|risk|benefit|limitation|exception|procedure|protocol|assessment|diagnosis|treatment|evidence|case|example|application|relationship|pattern|structure|function|property)\b/i.test(c);
    const wordCount = countMeaningfulWords(c);
    const incompleteCodePenalty = isIncompleteCodeFragment(c) ? 20 : 0;
    const score = (hasCode ? 1 : 0) + (hasLearningSignal ? 2 : 0) + Math.min(4, Math.floor(wordCount / 18)) - (isPdfNoise ? 8 : 0) - titleOnlyPenalty - navigationPenalty - incompleteCodePenalty;
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
  const source = removeLeadingConnectors(text)
    .replace(/([A-Za-z])::/g, "$1 ::")
    .replace(/\bcan not\b/gi, "cannot");
  const firstCompleteSentence = source.match(/^.{20,220}?[.!?](?:\s|$)/)?.[0] || source;
  const clean = shortenSentence(firstCompleteSentence, 220)
    .replace(/[.,;:]+$/g, "")
    .replace(/\b(and|or|with|including|such as|to|for|of|the)$/i, "")
    .trim();
  if (!clean) return "";

  return /[.!?]$/.test(clean) ? clean : `${clean}.`;
}

module.exports = {
  addWordBoundariesToDenseText,
  answerAppearsInQuestion,
  capitalize,
  cleanContentFromPdf,
  clampPoints,
  countMeaningfulWords,
  dedupeByMeaning,
  dedupeOverlappingText,
  dedupeStrings,
  extractSentences,
  isCodeLikeText,
  isExerciseInstructionLine,
  isEditorialNarration,
  isIncompleteCodeFragment,
  isLikelyNavigationJunk,
  isLikelyTitleOnly,
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
};
