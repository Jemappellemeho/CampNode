const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");

// AI-Service-URL aus Umgebungsvariable (docker-compose setzt: http://ai-service:8001)
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://ai-service:8001";

// Route: POST /api/ai/ask
// verifyToken: nur eingeloggte User dürfen den AI-Service nutzen
router.post("/ask", verifyToken, async (req, res) => {
  try {
    // Anfrage an Python-Service weiterleiten (intern im Docker-Netz)
    const response = await fetch(`${AI_SERVICE_URL}/ask`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        course_id: req.body.course_id,
        question: req.body.question
      })
    });

    // Wir fangen die Antwort (Answer & Sources) ab und schicken sie ans Frontend
    const data = await response.json();
    res.json(data);
    
  } catch (error) {
    console.error("Fehler beim Verbinden mit dem AI Service:", error);
    res.status(500).json({
      error: "AI service error",
      details: error.message
    });
  }
});

module.exports = router;
