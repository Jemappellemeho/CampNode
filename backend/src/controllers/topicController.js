const prisma = require("../utils/prisma");
const axios = require("axios");
const { scrapeUrl } = require("../services/scraperService");
const { parsePdf } = require("../services/pdfService");
const aiService = require("../services/aiService");

// Creates a new topic and processes optional sources (Web-Link or PDF)
exports.createTopic = async (req, res) => {
  try {
    const { name, description, courseId, wikidataId, sourceUrl } = req.body;
    let content = "";

    if (sourceUrl) {
      console.log("Scraping website:", sourceUrl);
      content = await scrapeUrl(sourceUrl);
    } 
    else if (req.file) {
      console.log("Parsing PDF:", req.file.originalname);
      content = await parsePdf(req.file.buffer);
    }
    // Automatically fetch Wiki summary if wikidataId is provided
    else if (wikidataId) {
      console.log("Fetching WikiText for:", wikidataId);
      const wikiText = await fetchWikiText(wikidataId);
      if (wikiText) content = wikiText;
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
    console.error("Topic Creation Error:", error.message);
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
    res.status(500).json({ error: "Failed to fetch topics" });
  }
};

exports.updateTopic = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, prerequisiteIds, sourceUrl } = req.body;

    if (req.user.role !== "PROFESSOR") {
      return res.status(403).json({ error: "Access denied" });
    }

    // 1. Load the existing topic to enable content merging
    const currentTopic = await prisma.topic.findUnique({ where: { id } });
    if (!currentTopic) return res.status(404).json({ error: "Topic not found" });

    // 2. Process new material (if available)
    let newContent = "";
    if (sourceUrl) {
      newContent = await scrapeUrl(sourceUrl);
    } else if (req.file) {
      console.log("Update: Parsing new PDF:", req.file.originalname);
      newContent = await parsePdf(req.file.buffer);
    }

    // 3. Merge content (Append instead of overwrite)
    let combinedContent = currentTopic.content || "";
    if (newContent) {
      combinedContent = combinedContent 
        ? `${combinedContent}\n\n--- Supplementary Material ---\n\n${newContent}` 
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
      message: "Topic successfully updated and material appended!", 
      topic: updatedTopic,
      contentAppended: !!newContent 
    });
  } catch (error) {
    console.error("Update Topic Error:", error.message);
    res.status(500).json({ error: "Failed to update topic" });
  }
};

exports.deleteTopic = async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user.role !== "PROFESSOR") {
      return res.status(403).json({ error: "Access denied" });
    }
    await prisma.topic.delete({ where: { id } });
    res.json({ message: "Topic successfully deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete topic" });
  }
};

exports.getTopicContent = async (req, res) => {
  try {
    const { id } = req.params;
    const lang = req.query.lang || "en";
    const topic = await prisma.topic.findUnique({ where: { id } });

    if (!topic) return res.status(404).json({ error: "Topic not found" });

    let titleForLang = null;

    if (topic.wikidataId) {
      try {
        const entityRes = await axios.get(
          `https://www.wikidata.org/wiki/Special:EntityData/${topic.wikidataId}.json`,
          { headers: { "User-Agent": "WissenGraph/1.0" } }
        );
        const entity = entityRes.data.entities[topic.wikidataId];
        const langs = lang !== "en" ? [lang, "en"] : ["en"];
        for (const tryLang of langs) {
          titleForLang = entity.sitelinks?.[`${tryLang}wiki`]?.title;
          if (titleForLang) break;
        }
      } catch (e) {
        console.error("Wikidata fetch error:", e.message);
      }
    } 
    
    // Fallback: If no Wikidata ID exists (like DBpedia subtopics), or no sitelink was found, use the topic name
    if (!titleForLang) {
      titleForLang = topic.name; 
    }

    try {
      const parseUrl = `https://${lang}.wikipedia.org/w/api.php?action=parse&format=json&page=${encodeURIComponent(titleForLang)}&prop=text|displaytitle&disablelimitreport=1&disableeditsection=1&origin=*`;
      const parseRes = await axios.get(parseUrl, { headers: { "User-Agent": "WissenGraph/1.0" } });
      
      if (parseRes.data.error) {
         return res.status(200).json({ content: `<p>Article for <b>${topic.name}</b> could not be loaded automatically.</p>` });
      }

      let html = parseRes.data.parse.text["*"];
      html = html.replace(/src="\/\//g, 'src="https://').replace(/srcset="\/\//g, 'srcset="https://');
      html = html.replace(/href="\/wiki\//g, `href="https://${lang}.wikipedia.org/wiki/`);
      html = html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");
      
      return res.json({ content: html.trim() });
    } catch (err) { 
      return res.status(200).json({ content: `<p>Failed to connect to Wikipedia for summary.</p>` });
    }

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
    if (req.user.role !== "PROFESSOR") return res.status(403).json({ error: "Only professors can use AI." });

    let topic = await prisma.topic.findUnique({ where: { id } });
    if (!topic) return res.status(404).json({ error: "Topic not found." });

    if (!topic.content && topic.wikidataId) {
      const wikiText = await fetchWikiText(topic.wikidataId);
      if (wikiText) {
        topic = await prisma.topic.update({ where: { id }, data: { content: wikiText } });
      }
    }

    if (!topic || !topic.content) return res.status(400).json({ error: "No content available." });

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

    res.json({ message: "AI Enrichment successful!", topic: updatedTopic });
  } catch (error) { res.status(500).json({ error: "Error during AI analysis." }); }
};

// --- QUIZ MANAGEMENT ---
exports.updateQuiz = async (req, res) => {
  try {
    const { quizId } = req.params;
    const { questions } = req.body;
    if (req.user.role !== "PROFESSOR") return res.status(403).json({ error: "Only professors can update quizzes." });
    const updatedQuiz = await prisma.quiz.update({ where: { id: quizId }, data: { questions } });
    res.json({ message: "Quiz updated!", quiz: updatedQuiz });
  } catch (error) { res.status(500).json({ error: "Failed to update quiz." }); }
};

exports.deleteQuiz = async (req, res) => {
  try {
    const { quizId } = req.params;
    if (req.user.role !== "PROFESSOR") return res.status(403).json({ error: "Only professors can delete quizzes." });
    await prisma.quiz.delete({ where: { id: quizId } });
    res.json({ message: "Quiz deleted!" });
  } catch (error) { res.status(500).json({ error: "Failed to delete quiz." }); }
};