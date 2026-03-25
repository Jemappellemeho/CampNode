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
  console.log("[AI Service] Erstelle Quiz-Fragen...");

  await new Promise((resolve) => setTimeout(resolve, 1500));

  // Beispiel-Datenstruktur für ein Quiz
  return [
    {
      question: "Was ist der wichtigste Punkt in diesem Modul?",
      options: ["Antwort A", "Antwort B", "Antwort C", "Antwort D"],
      answer: "Antwort A"
    },
    {
      question: "Wie hängen die Konzepte zusammen?",
      options: ["Gar nicht", "Linear", "Gegenseitig", "Unbekannt"],
      answer: "Gegenseitig"
    }
  ];
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
