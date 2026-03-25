const prisma = require("../utils/prisma");
const axios = require("axios");
const { scrapeUrl } = require("../services/scraperService");
const { parsePdf } = require("../services/pdfService");
const aiService = require("../services/aiService");

// Erstellt ein neues Thema und verarbeitet optionale Quellen (Web-Link oder PDF)
exports.createTopic = async (req, res) => {
  try {
    const { name, description, courseId, wikidataId, sourceUrl } = req.body;
    let content = "";

    if (sourceUrl) {
      console.log("Lese Webseite aus:", sourceUrl);
      content = await scrapeUrl(sourceUrl);
    } 
    else if (req.file) {
      console.log("Lese PDF aus:", req.file.originalname);
      content = await parsePdf(req.file.buffer);
    }

    const topic = await prisma.topic.create({
      data: {
        name,
        description,
        courseId,
        wikidataId,
        content: content || null,
      }
    });

    res.status(201).json(topic);
  } catch (error) {
    console.error("Thema Erstellen Fehler:", error.message);
    res.status(500).json({ error: error.message });
  }
};

exports.getTopicsByCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const topics = await prisma.topic.findMany({
      where: { courseId },
      include: {
        prerequisites: true,
      }
    });
    res.json(topics);
  } catch (error) {
    res.status(500).json({ error: "Fehler beim Abrufen der Themen" });
  }
};

exports.updateTopic = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, prerequisiteIds, sourceUrl } = req.body;

    if (req.user.role !== "PROFESSOR") {
      return res.status(403).json({ error: "Zugriff verweigert" });
    }

    // 1. Bestehendes Thema laden, um Content-Merging zu ermöglichen
    const currentTopic = await prisma.topic.findUnique({ where: { id } });
    if (!currentTopic) return res.status(404).json({ error: "Thema nicht gefunden" });

    // 2. Neues Material verarbeiten (falls vorhanden)
    let newContent = "";
    if (sourceUrl) {
      newContent = await scrapeUrl(sourceUrl);
    } else if (req.file) {
      console.log("Update: Parse neue PDF:", req.file.originalname);
      newContent = await parsePdf(req.file.buffer);
    }

    // 3. Content zusammenführen (Append statt Overwrite)
    let combinedContent = currentTopic.content || "";
    if (newContent) {
      combinedContent = combinedContent 
        ? `${combinedContent}\n\n--- Ergänzendes Material ---\n\n${newContent}` 
        : newContent;
    }

    const data = { 
      name, 
      description,
      content: combinedContent 
    };

    if (prerequisiteIds && Array.isArray(prerequisiteIds)) {
      data.prerequisites = {
        set: prerequisiteIds.map(preId => ({ id: preId }))
      };
    }

    const updatedTopic = await prisma.topic.update({
      where: { id },
      data,
      include: { prerequisites: true }
    });

    res.json({ 
      message: "Thema erfolgreich aktualisiert und Material hinzugefügt!", 
      topic: updatedTopic,
      contentAppended: !!newContent 
    });
  } catch (error) {
    console.error("Update Topic Error:", error.message);
    res.status(500).json({ error: "Fehler beim Aktualisieren" });
  }
};

exports.deleteTopic = async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user.role !== "PROFESSOR") {
      return res.status(403).json({ error: "Zugriff verweigert" });
    }
    await prisma.topic.delete({ where: { id } });
    res.json({ message: "Thema erfolgreich gelöscht" });
  } catch (error) {
    res.status(500).json({ error: "Fehler beim Löschen des Themas" });
  }
};

exports.getTopicContent = async (req, res) => {
  try {
    const { id } = req.params;
    const lang = req.query.lang || "en";
    const topic = await prisma.topic.findUnique({ where: { id } });

    if (!topic) return res.status(404).json({ error: "Topic not found" });
    if (!topic.wikidataId) {
      return res.status(200).json({ content: "<p>This topic has no linked Wikipedia article.</p>" });
    }

    let entityRes;
    try {
      entityRes = await axios.get(
        `https://www.wikidata.org/wiki/Special:EntityData/${topic.wikidataId}.json`,
        { headers: { "User-Agent": "WissenGraph/1.0" } }
      );
    } catch (e) {
      return res.status(200).json({ content: "<p>Wikidata entity not found.</p>" });
    }

    const entity = entityRes.data.entities[topic.wikidataId];
    const langs = lang !== "en" ? [lang, "en"] : ["en"];

    for (const tryLang of langs) {
      const titleForLang = entity.sitelinks?.[`${tryLang}wiki`]?.title;
      if (!titleForLang) continue;
      try {
         const parseUrl = `https://${tryLang}.wikipedia.org/w/api.php?action=parse&format=json&page=${encodeURIComponent(titleForLang)}&prop=text|displaytitle&disablelimitreport=1&disableeditsection=1&origin=*`;
         const parseRes = await axios.get(parseUrl, { headers: { "User-Agent": "WissenGraph/1.0" } });
         if (parseRes.data.error) continue;
         let html = parseRes.data.parse.text["*"];
         html = html.replace(/src="\/\//g, 'src="https://').replace(/srcset="\/\//g, 'srcset="https://');
         html = html.replace(/href="\/wiki\//g, `href="https://${tryLang}.wikipedia.org/wiki/`);
         html = html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");
         return res.json({ content: html.trim() });
      } catch (err) { continue; }
    }

    return res.status(200).json({ content: `<p>Article for <b>${topic.name}</b> could not be loaded.</p>` });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
};

async function fetchWikiText(wikidataId) {
  try {
    const entityUrl = `https://www.wikidata.org/wiki/Special:EntityData/${wikidataId}.json`;
    const entityRes = await axios.get(entityUrl, { headers: { "User-Agent": "WissenGraph/1.0" } });
    const entity = entityRes.data.entities[wikidataId];
    const wikiTitle = entity.sitelinks?.["enwiki"]?.title || entity.sitelinks?.["dewiki"]?.title;
    if (!wikiTitle) return null;
    const lang = entity.sitelinks?.["enwiki"] ? "en" : "de";
    const wikiUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&titles=${encodeURIComponent(wikiTitle)}&format=json&origin=*`;
    const wikiRes = await axios.get(wikiUrl, { headers: { "User-Agent": "CampNode/1.0 (mehood@example.com)" } });
    const pages = wikiRes.data.query.pages;
    const pageId = Object.keys(pages)[0];
    return pages[pageId].extract || null;
  } catch (err) { return null; }
}

exports.enrichTopic = async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user.role !== "PROFESSOR") return res.status(403).json({ error: "Nur Professoren dürfen die KI nutzen." });

    let topic = await prisma.topic.findUnique({ where: { id } });
    if (!topic) return res.status(404).json({ error: "Thema nicht gefunden." });

    if (!topic.content && topic.wikidataId) {
      const wikiText = await fetchWikiText(topic.wikidataId);
      if (wikiText) {
        topic = await prisma.topic.update({ where: { id }, data: { content: wikiText } });
      }
    }

    if (!topic || !topic.content) return res.status(400).json({ error: "Kein Inhalt vorhanden." });

    const summary = await aiService.generateSummary(topic.content);
    const quizQuestions = await aiService.generateQuiz(topic.content);

    const updatedTopic = await prisma.topic.update({
      where: { id },
      data: {
        description: summary, 
        quizzes: { create: { questions: quizQuestions } }
      },
      include: { quizzes: true }
    });

    res.json({ message: "KI-Modul wurde erfolgreich angereichert!", topic: updatedTopic });
  } catch (error) { res.status(500).json({ error: "Fehler bei der KI-Analyse." }); }
};

// --- QUIZ MANAGEMENT ---
exports.updateQuiz = async (req, res) => {
  try {
    const { quizId } = req.params;
    const { questions } = req.body;
    if (req.user.role !== "PROFESSOR") return res.status(403).json({ error: "Nur Professoren dürfen Quizzes bearbeiten." });
    const updatedQuiz = await prisma.quiz.update({ where: { id: quizId }, data: { questions } });
    res.json({ message: "Quiz gespeichert!", quiz: updatedQuiz });
  } catch (error) { res.status(500).json({ error: "Fehler beim Speichern des Quiz." }); }
};

exports.deleteQuiz = async (req, res) => {
  try {
    const { quizId } = req.params;
    if (req.user.role !== "PROFESSOR") return res.status(403).json({ error: "Nur Professoren dürfen Quizzes löschen." });
    await prisma.quiz.delete({ where: { id: quizId } });
    res.json({ message: "Quiz gelöscht!" });
  } catch (error) { res.status(500).json({ error: "Fehler beim Löschen des Quiz." }); }
};