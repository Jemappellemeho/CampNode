// Prompt and stem templates for quiz generation.
// This file controls wording, not source extraction or final validation.

// Local helper for template labels.
function capitalize(value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "Concept";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Build a multiple-choice question stem.
// This does not create answers; it wraps an existing focus/answer pair.
// Specific stems are preferred when the answer contains a clear signal.
// Default stems keep the quiz usable when no signal matches.
function getMultipleChoiceStem({ focus, answer, isProgrammingTopic, index = 0 }) {
  const stems = [];
  const isGermanMaterial = /\b(der|die|das|dass|wenn|weil|bei|mit|eine|einen|werden|können|koennen|sortier|daten|algorithmus)\b/i.test(`${focus} ${answer}`);

  if (isGermanMaterial) {
    if (/\b(ziel|zweck|hauptziel|dient|soll)\b/i.test(answer)) {
      stems.push(`Was ist das Hauptziel von ${focus}?`);
    }
    if (/\b(ermöglicht|ermoeglicht|hilft|macht|verbessert|reduziert|erhöht|erhoeht)\b/i.test(answer)) {
      stems.push(`Welche Wirkung wird für ${focus} beschrieben?`);
    }
    if (/\b(wichtig|muss|soll|erforderlich|notwendig|abhängig|abhaengig)\b/i.test(answer)) {
      stems.push(`Welche Aussage zu ${focus} wird im Material betont?`);
    }
    if (/\b(unterscheiden|vergleich|unterschied|typen|arten|klasse|kategorie)\b/i.test(answer)) {
      stems.push(`Welche Unterscheidung zu ${focus} ist korrekt?`);
    }

    stems.push(`Welche Aussage beschreibt ${focus} am besten?`);
    stems.push(`Was sollten Studierende über ${focus} verstehen?`);
    stems.push(`Welche Option erklärt ${focus} korrekt?`);
    stems.push(`Welche Aussage passt zum Material über ${focus}?`);
    return stems[index % stems.length];
  }

  // Purpose/goal wording.
  if (/\b(designed to|aims? to|goal|purpose|intended to)\b/i.test(answer)) {
    stems.push(`What is the main purpose of ${focus}?`);
  }

  // Benefit/effect wording.
  if (/\b(develops?|helps?|allows?|enables?|improves?|strengthens?|restores?|reduces?|increases?)\b/i.test(answer)) {
    stems.push(`What benefit is described for ${focus}?`);
  }

  // Requirement/recommendation wording.
  if (/\b(important|must|should|required|requires?|need to|maintain)\b/i.test(answer)) {
    stems.push(`What requirement or recommendation is emphasized for ${focus}?`);
  }

  // Practice/use wording for non-programming topics.
  if (!isProgrammingTopic && /\b(performed|involves?|uses?|utili[sz]es?|practice|apparatus|mat|exercise)\b/i.test(answer)) {
    stems.push(`How is ${focus} described as being practiced or used?`);
  }

  // Technical wording for programming topics.
  if (isProgrammingTopic && /\b(use|called|resolved|throws|return|type|function|compiler|exception|null)\b/i.test(answer)) {
    stems.push(`Which statement correctly explains ${focus}?`);
  }

  // Effect/role wording.
  if (/\b(awareness|patterns?|dysfunction|pain|balance|body)\b/i.test(answer)) {
    stems.push(`What effect or role is described for ${focus}?`);
  }

  // Safe fallback stems.
  stems.push(`Which statement best describes ${focus}?`);
  stems.push(`What should a student remember about ${focus}?`);
  stems.push(`Which description matches ${focus}?`);
  stems.push(`What is emphasized about ${focus}?`);
  stems.push(`Which option accurately reflects ${focus}?`);

  return stems[index % stems.length];
}

// Choose a multiple-select question stem.
// Correct/incorrect options are built in the engine.
function getMultipleSelectStem(focus, index = 0) {
  const isGermanMaterial = /\b(der|die|das|dass|eine|einen|daten|algorithmus|sortier)\b/i.test(focus);
  const stems = isGermanMaterial ? [
    `Welche Aussagen zu ${focus} sind korrekt?`,
    `Welche Details beschreiben ${focus} richtig?`,
    `Welche Punkte helfen, ${focus} zu erklären?`,
  ] : [
    `Which statements are correct about ${focus}?`,
    `Which details correctly describe ${focus}?`,
    `Which points would help explain ${focus} to a student?`,
  ];

  return stems[index % stems.length];
}

// Choose a reorder question stem.
// The engine still builds and shuffles the actual items.
function getReorderStem(topicName, index = 0) {
  const stems = [
    `Order these ${topicName} ideas from setup to outcome.`,
    "Arrange the process details in the sequence implied by the material.",
  ];

  return stems[index % stems.length];
}

// Hard fallback if source is too weak and remote AI is unavailable.
// This prevents blank quizzes, but normal source-based generation is preferred.
function createMockQuiz(topicName) {
  // Last-resort emergency quiz grounded in the single available signal: the topic title.
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
        "A unrelated historical event",
        "A random software tool name",
      ],
      correctIndex: 0,
      explanation: `The lesson focuses on the core idea of ${safe}.`,
      points: 1,
    },
    {
      type: "true_false",
      question: `Is ${safe} presented with both concept and practical implications?`,
      correctAnswer: true,
      explanation: `Good course material for ${safe} includes what it is and how it applies.`,
      points: 1,
    },
    {
      type: "multiple_select",
      question: `Which elements are typically part of understanding ${safe}? (Select all)`,
      options: [
        `${topic1}`,
        `${topic2}`,
        `${topic4}`,
        "Pure trivia without explanation",
      ],
      correctIndices: [0, 1, 2],
      partialCreditEnabled: true,
      partialCreditThreshold: 1,
      explanation: `${topic1}, ${topic2}, and ${topic4} are essential to understand ${safe}.`,
      points: 1,
    },
    {
      type: "reorder",
      question: "Put the understanding flow in a logical order:",
      items: ["Learn the core idea", "Understand key mechanism", "Apply it to a scenario", "Check common pitfalls"],
      correctOrder: [0, 1, 2, 3],
      partialCreditEnabled: true,
      partialCreditThreshold: 2,
      explanation: "A typical learning flow goes from concept to mechanism, then application and pitfalls.",
      points: 1,
    },
    {
      type: "open_answer",
      question: `In one phrase, name the key mechanism for ${safe}.`,
      acceptedAnswers: [topic2],
      partialCreditEnabled: true,
      partialCreditThreshold: 1,
      hint: `Key mechanism of ${safe}.`,
      explanation: `The key mechanism is the part that explains how ${safe} works.`,
      points: 1,
    },
    {
      type: "multiple_choice",
      question: `Which statement is most useful when studying ${safe}?`,
      options: [
        `${topic3} is the best way to remember it`,
        "Only memorize definitions without meaning",
        "Ignore mechanisms and focus on unrelated details",
        "Avoid connecting it to real use cases",
      ],
      correctIndex: 0,
      explanation: `Connecting to practical application improves retention for ${safe}.`,
      points: 1,
    },
    {
      type: "true_false",
      question: `Does learning ${safe} require distinguishing correct ideas from common mistakes?`,
      correctAnswer: true,
      explanation: "Common pitfalls help learners avoid the most frequent misunderstandings.",
      points: 1,
    },
    {
      type: "multiple_select",
      question: `Select statements that help you apply ${safe}. (Select all)`,
      options: ["Identify the mechanism", `${topic3}`, "Guess without checking", `${topic4}`],
      correctIndices: [0, 1, 3],
      partialCreditEnabled: true,
      partialCreditThreshold: 1,
      explanation: "Application is built from mechanism, real use, and awareness of pitfalls.",
      points: 1,
    },
    {
      type: "reorder",
      question: "Order these study steps from first to last:",
      items: ["Read the core idea", "Extract key mechanism", "Try a scenario", "Summarize what to avoid"],
      correctOrder: [0, 1, 2, 3],
      partialCreditEnabled: true,
      partialCreditThreshold: 2,
      explanation: "Study should progress from reading to mechanism, then scenarios, then pitfalls.",
      points: 1,
    },
    {
      type: "open_answer",
      question: `Name one common pitfall associated with ${safe}.`,
      acceptedAnswers: [topic4],
      partialCreditEnabled: true,
      partialCreditThreshold: 1,
      hint: `Common pitfall of ${safe}.`,
      explanation: "Pitfalls are frequent misunderstandings the lesson warns about.",
      points: 1,
    },
  ];
}

// RAG prompts that collect source-grounded quiz hints.
// These prompts enrich local generation; they do not directly create final quiz JSON.
function buildRagQuizPrompts(topicName) {
  return [
    [
      `You are helping a teacher prepare a quiz about "${topicName}".`,
      "Ignore covers, table of contents, page numbers, navigation text, welcome text, and document metadata.",
      "Using only the course material, list 8-12 concrete things a teacher would normally ask students to know.",
      "Prefer definitions, mechanisms, rules, procedures, classifications, contraindications, exceptions, and practical applications.",
      "Rewrite extracted fragments into complete standalone statements without changing the meaning.",
      "Do not repeat the same idea in different wording.",
      "Return short source-grounded bullet points only.",
    ].join(" "),
    [
      `For "${topicName}", identify the subtle points, common confusions, edge cases, or mistakes that a good teacher would test.`,
      "Use only the material. Avoid generic study advice.",
      "Use complete statements, not copied fragments or navigation text.",
      "Phrase distractor-style ideas as misconceptions students should avoid, not as new true facts.",
      "Do not repeat examples already listed in the material summary.",
      "Return short bullet points phrased as testable knowledge.",
    ].join(" "),
    [
      `For "${topicName}", suggest practical or applied situations from the material that could become quiz questions.`,
      "Examples: choose the correct procedure, diagnose the misconception, predict what happens, compare two concepts, select contraindications or required steps.",
      "Keep each suggested situation self-contained and understandable without surrounding text.",
      "Stay source-grounded and concise.",
    ].join(" "),
    [
      `Extract the most quiz-worthy terms and relationships for "${topicName}".`,
      "Do not include title-page text, course navigation, page numbers, or section list items unless the section contains a real concept.",
      "Return terms with one short explanation each.",
    ].join(" "),
  ];
}

module.exports = {
  buildRagQuizPrompts,
  createMockQuiz,
  getMultipleChoiceStem,
  getMultipleSelectStem,
  getReorderStem,
};
