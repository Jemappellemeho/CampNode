require("dotenv").config();
const express = require("express");
const path = require("path");
const cors = require("cors"); // Füge cors hinzu (wichtig für später, wenn das Frontend dazukommt)
const authRoutes = require("./routes/authRoutes"); // Unsere neuen Routen importieren
const courseRoutes = require("./routes/courseRoutes"); // Neue Kurs-Routen
const topicRoutes = require("./routes/topicRoutes");
const quizRoutes = require("./routes/quizRoutes");
const progressRoutes = require("./routes/progressRoutes");
const wikiRoutes = require("./routes/wikiRoutes");


const app = express();

// Middleware: Erlaubt dem Server, JSON-Daten aus dem request body zu lesen
app.use(express.json());
app.use(cors());
// Expose locally uploaded PDFs so the frontend can open them in a new tab.
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

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
    

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API on http://localhost:${port}`));
