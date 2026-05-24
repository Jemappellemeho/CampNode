require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser"); // NEU: liest Cookies aus Requests (brauchen wir für Refresh Token)
const helmet = require("helmet");              // NEU: setzt automatisch Security-HTTP-Headers
const authRoutes = require("./routes/authRoutes");
const courseRoutes = require("./routes/courseRoutes");
const topicRoutes = require("./routes/topicRoutes");
const quizRoutes = require("./routes/quizRoutes");
const progressRoutes = require("./routes/progressRoutes");
const wikiRoutes = require("./routes/wikiRoutes");
const aiRoutes = require("./routes/aiRoutes");
const feedbackRoutes = require("./routes/feedbackRoutes");
const statisticsRoutes = require("./routes/statisticsRoutes");
const metadataRoutes = require("./routes/metadataRoutes");

const app = express();

// Security-Headers (versteckt Server-Infos, verhindert Clickjacking etc.)
app.use(helmet());

// CORS: Nur das eigene Frontend darf Requests machen, und Cookies werden erlaubt
// vorher war: app.use(cors())  ← das erlaubte JEDE Website!
app.use(cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  credentials: true, // WICHTIG: ohne das werden Cookies (Refresh Token) nicht mitgeschickt
}));

// JSON-Daten aus dem request body lesen
app.use(express.json());

// Cookies aus dem Request lesen (brauchen wir für req.cookies.refreshToken)
app.use(cookieParser());

// Health Check Route
app.get("/health", (req, res) => res.json({ ok: true }));

// Hier verbinden wir die authRoutes mit dem Präfix /api/auth
app.use("/api/auth", authRoutes);

// Hier verbinden wir die neuen Kurs-Routen
app.use("/api/courses", courseRoutes);

// Hier verbinden wir die neuen Themen-Routen
app.use("/api/topics", topicRoutes);

// Hier verbinden wir die neuen Quiz-Routen
app.use("/api/quizzes", quizRoutes);

// Hier verbinden wir die neuen Fortschritts-Routen
app.use("/api/progress", progressRoutes);

// Hier verbinden wir die Wiki-Routen
app.use("/api/wiki", wikiRoutes);
    
//ai routen anbindung 
app.use("/api/ai", aiRoutes);

//feedback
app.use("/api/feedback", feedbackRoutes);

//statistics
app.use("/api/statistics", statisticsRoutes);

//metadata
app.use("/api/metadata", metadataRoutes);


// Globaler Error-Handler: Fängt alle unbehandelten Fehler ab.
// Ohne das würde Node.js abstürzen oder der Stack Trace zum User gesendet werden.
// WICHTIG: Muss als LETZTES vor app.listen stehen, damit er alle Routen abdeckt!
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.url}:`, err.message);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message,
  });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API on http://localhost:${port}`));
