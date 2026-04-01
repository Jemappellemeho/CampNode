/**
 * AI Service (backend/src/services/aiService.js)
 * Diese Datei steuert die "Intelligenz" der Plattform.
 * Sie wandelt lange Texte (aus Phase 2) in kurze Zusammenfassungen und Quiz-Fragen um.
 */

const axios = require("axios");

/**
 * Erstellt eine Zusammenfassung aus rohem Text.
 * Aktuell ein Platzhalter-Mock — sobald du einen API-Key hast, 
 * verbinden wir das mit Google Gemini oder OpenAI.
 */
exports.generateSummary = async (content) => {
  console.log("KEY TEST:", process.env.OPENAI_API_KEY);
  console.log("Generiere Zusammenfassung...");

  // Falls der Text zu kurz ist, brauchen wir keine KI
  if (!content || content.length < 100) {
    return "Der Inhalt ist zu kurz für eine automatische Zusammenfassung.";
  }

  // Simulation einer KI-Verarbeitung (Verzögerung)
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Hier würde der echte Request an die LLM-API gehen:
  // const response = await axios.post('https://generativelanguage.googleapis.com/...', { ... });
  
  return `[KI-ZUSAMMENFASSUNG]: Dieser Text wurde analysiert. Er umfasst die wesentlichen Merkmale des Themas und erklärt die wichtigsten Konzepte in komprimierter Form. (Dies ist noch ein Platzhalter-Text)`;
};

/**
 * Erstellt Quiz-Fragen basierend auf dem Inhalt.
 * Gibt ein Array von Objekten im JSON-Format zurück.
 */
const { GoogleGenerativeAI } = require("@google/generative-ai");

exports.generateQuiz = async (content) => {
  console.log("[AI Service] Gemini SDK Quiz...");

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    const model = genAI.getGenerativeModel({
      model: "gemini-1.0-pro"
    });

    const result = await model.generateContent(`
Generate exactly 4 multiple choice questions based on this text:

${content}

Rules:
- Specific questions only
- 4 options each
- One correct answer
- Output ONLY JSON

[
  {
    "question": "...",
    "options": ["...", "...", "...", "..."],
    "answer": "..."
  }
]
`);

    const text = result.response.text();

    console.log("RAW:", text);

    const cleaned = text.replace(/```json|```/g, "").trim();
    const match = cleaned.match(/\[.*\]/s);

    if (!match) throw new Error("No JSON found");

    return JSON.parse(match[0]);

  } catch (error) {
    console.error("GEMINI ERROR:", error);

    return [
      {
        question: "Fallback question",
        options: ["A", "B", "C"],
        answer: "A"
      }
    ];
  }
};

/**
 * Schlägt logische Voraussetzungen vor (Roadmap-Logik).
 * Vergleicht die Namen aller Themen eines Kurses.
 */
exports.suggestPrerequisites = async (topics) => {
  console.log("[AI Service] Analysiere Roadmap-Struktur...");
  
  // Die KI würde hier die Themennamen prüfen und sagen: 
  // "Hey, 'Variablen' sollte man vor 'Funktionen' lernen."
  
  return []; // Noch keine Vorschläge
};
