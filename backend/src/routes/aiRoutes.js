const express = require("express");
const router = express.Router();

// Route: POST /api/ai/ask
router.post("/ask", async (req, res) => {
  try {
    // Wir leiten die Anfrage an unseren laufenden Python-Service (Port 8001) weiter
    const response = await fetch("http://127.0.0.1:8001/ask", {
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
