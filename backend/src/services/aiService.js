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
exports.generateQuiz = async (content) => {
  console.log("KEY TEST:", process.env.GEMINI_API_KEY);
  console.log("[AI Service] Gemini Quiz...");

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [
              {
                text: `
Generate exactly 4 multiple choice questions based on this text:

${content}

Rules:
- Specific questions only
- 4 options each
- Only one correct answer
- Return ONLY JSON

[
  {
    "question": "...",
    "options": ["...", "...", "...", "..."],
    "answer": "..."
  }
]
`
              }
            ]
          }
        ]
      }
    );

    const text = response.data.candidates[0].content.parts[0].text;

    console.log("RAW:", text);

    // 🔥 robust parsing
    const cleaned = text.replace(/```json|```/g, "").trim();
    const match = cleaned.match(/\[.*\]/s);

    if (!match) throw new Error("No JSON found");

    return JSON.parse(match[0]);

  } catch (error) {
    console.error("GEMINI ERROR:", error.response?.data || error.message);

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
