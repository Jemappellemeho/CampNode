const prisma = require("../utils/prisma");
const axios = require("axios");
const { scrapeUrl } = require("../services/scraperService");
const { parsePdf } = require("../services/pdfService");
const aiService = require("../services/aiService");

const MOCK_QUESTION_MARKERS = [
  "what is the primary goal of",
  "which layer usually handles",
  "what is the biggest risk here",
  "what is the common 4-letter acronym for database operations",
  "what is the short name for a web application interface"
];

async function upsertTopicQuiz(topicId, questions) {
  const existingQuiz = await prisma.quiz.findFirst({
    where: { topicId },
    orderBy: { createdAt: "desc" }
  });

  if (existingQuiz) {
    return prisma.quiz.update({
      where: { id: existingQuiz.id },
      data: { questions }
    });
  }

  return prisma.quiz.create({
    data: {
      topicId,
      questions
    }
  });
}

function isFallbackQuiz(questions) {
  if (!Array.isArray(questions) || questions.length === 0) return true;

  return questions.some((question) => {
    const text = typeof question?.question === "string" ? question.question.toLowerCase() : "";
    return MOCK_QUESTION_MARKERS.some((marker) => text.includes(marker));
  });
}

/**
 * GET Quiz for a topic.
 * Logic: If missing or < 15 questions, it regenerates to ensure a full session.
 */
exports.getQuizByTopic = async (req, res) => {
  try {
    const { topicId } = req.params;

    let quiz = await prisma.quiz.findFirst({
      where: { topicId: topicId }
    });

    // Force refresh if the quiz is the old 5-question version
    if (quiz && (!quiz.questions || quiz.questions.length < 15 || isFallbackQuiz(quiz.questions))) {
      console.log("[Quiz] Found old quiz version. Deleting to regenerate 15 unique questions.");
      await prisma.quiz.delete({ where: { id: quiz.id } });
      quiz = null;
    }

    if (!quiz) {
      console.log(`[Quiz] No valid quiz found for topic ${topicId}. Generating 15 questions...`);
      const topic = await prisma.topic.findUnique({ where: { id: topicId } });
      if (!topic) return res.status(404).json({ error: "Topic not found." });

      const source = await ensureTopicSourceContent(topic);
      const sourceContent = source.content;
      
      const questions = await aiService.generateQuiz(sourceContent || topic.name, topic.name);

      quiz = await upsertTopicQuiz(topicId, questions);
    }

    // Return the quiz object directly
    res.json(quiz);
  } catch (error) {
    console.error("Quiz Fetch Error:", error.message);
    const statusCode = error.message?.includes("GEMINI_API_KEY") ? 503 : 500;
    res.status(statusCode).json({ error: error.message || "Failed to load or generate quiz." });
  }
};

/**
 * Creates a new topic and processes optional sources (Web-Link or PDF)
 */
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

/**
 * Fetch all topics that belong to a specific course
 */
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

/**
 * Update a topic, optionally attaching a new PDF file and merging content
 */
exports.updateTopic = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, prerequisiteIds, sourceUrl } = req.body;

    if (req.user.role !== "PROFESSOR") {
      return res.status(403).json({ error: "Access denied" });
    }

    const currentTopic = await prisma.topic.findUnique({ where: { id } });
    if (!currentTopic) return res.status(404).json({ error: "Topic not found" });

    let newContent = "";
    if (sourceUrl) {
      newContent = await scrapeUrl(sourceUrl);
    } else if (req.file) {
      newContent = await parsePdf(req.file.buffer);
    }

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

    res.json(updatedTopic);
  } catch (error) {
    console.error("Update Topic Error:", error.message);
    res.status(500).json({ error: "Failed to update topic" });
  }
};

/**
 * Delete a specific topic
 */
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

/**
 * Fetch Wikipedia article for display in the frontend
 */
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
          { headers: { "User-Agent": "CampNode/1.0" } }
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
    
    if (!titleForLang) titleForLang = topic.name; 

    try {
      const parseUrl = `https://${lang}.wikipedia.org/w/api.php?action=parse&format=json&page=${encodeURIComponent(titleForLang)}&prop=text|displaytitle&disablelimitreport=1&disableeditsection=1&origin=*`;
      const parseRes = await axios.get(parseUrl, { headers: { "User-Agent": "CampNode/1.0" } });
      
      if (parseRes.data.error) {
         return res.status(200).json({ content: `<p>Article for <b>${topic.name}</b> could not be loaded.</p>` });
      }

      let html = parseRes.data.parse.text["*"];

      // Normalize resource URLs so images and links render correctly in embedded HTML.
      const wikiBase = `https://${lang}.wikipedia.org`;
      html = html.replace(/\s(src|href|data-src)="\/\/([^\"]*)"/g, ' $1="https://$2"');
      html = html.replace(/\s(src|href|data-src)="\/(?!\/)([^\"]*)"/g, ` $1="${wikiBase}/$2"`);
      html = html.replace(/srcset="([^\"]*)"/g, (_m, value) => {
        const normalized = value
          .split(',')
          .map((entry) => {
            const trimmed = entry.trim();
            if (!trimmed) return trimmed;
            const parts = trimmed.split(/\s+/);
            if (!parts.length) return trimmed;
            if (parts[0].startsWith('//')) parts[0] = `https:${parts[0]}`;
            else if (parts[0].startsWith('/')) parts[0] = `${wikiBase}${parts[0]}`;
            return parts.join(' ');
          })
          .join(', ');
        return `srcset="${normalized}"`;
      });

      // Open article links in a new tab.
      html = html.replace(/<a\b(?![^>]*\btarget=)/g, '<a target="_blank" rel="noopener noreferrer"');
      html = html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");
      
      return res.json({ content: html.trim() });
    } catch (err) { 
      return res.status(200).json({ content: `<p>Wikipedia summary unavailable.</p>` });
    }
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Internal helper to fetch plain text from Wikipedia for AI analysis
 */
async function fetchWikiText(wikidataId) {
  try {
    const entityUrl = `https://www.wikidata.org/wiki/Special:EntityData/${wikidataId}.json`;
    const entityRes = await axios.get(entityUrl, { headers: { "User-Agent": "CampNode/1.0" } });
    const entity = entityRes.data.entities[wikidataId];
    const wikiTitle = entity.sitelinks?.["enwiki"]?.title || entity.sitelinks?.["dewiki"]?.title;
    if (!wikiTitle) return null;
    const lang = entity.sitelinks?.["enwiki"] ? "en" : "de";
    const wikiUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&titles=${encodeURIComponent(wikiTitle)}&format=json&origin=*`;
    const wikiRes = await axios.get(wikiUrl, { headers: { "User-Agent": "CampNode/1.0" } });
    const pages = wikiRes.data.query.pages;
    const pageId = Object.keys(pages)[0];
    return pages[pageId].extract || null;
  } catch (err) { return null; }
}

async function ensureTopicSourceContent(topic) {
  if (!topic) return { topic, content: "" };

  if (topic.content && topic.content.trim()) {
    return { topic, content: topic.content.trim() };
  }

  let nextContent = "";

  if (topic.wikidataId) {
    const wikiText = await fetchWikiText(topic.wikidataId);
    if (wikiText) nextContent = wikiText;
  }

  if (!nextContent && topic.articleUrl) {
    try {
      nextContent = await scrapeUrl(topic.articleUrl);
    } catch (error) {
      console.error("Article scrape failed:", error.message);
    }
  }

  if (!nextContent) {
    return { topic, content: "" };
  }

  const updatedTopic = await prisma.topic.update({
    where: { id: topic.id },
    data: { content: nextContent }
  });

  return { topic: updatedTopic, content: nextContent };
}

/**
 * Trigger AI to generate summary and quiz questions based on topic content
 */
exports.enrichTopic = async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user.role !== "PROFESSOR") return res.status(403).json({ error: "Unauthorized." });

    let topic = await prisma.topic.findUnique({ where: { id } });
    if (!topic) return res.status(404).json({ error: "Topic not found." });

    const source = await ensureTopicSourceContent(topic);
    topic = source.topic;

    if (!source.content) return res.status(400).json({ error: "No content available for AI." });

    const summary = await aiService.generateSummary(source.content);
    const quizQuestions = await aiService.generateQuiz(source.content, topic.name);
    const quiz = await upsertTopicQuiz(id, quizQuestions);

    const updatedTopic = await prisma.topic.update({
      where: { id },
      data: {
        description: summary
      },
      include: { quizzes: true }
    });

    res.json({
      message: "AI Enrichment successful!",
      topic: {
        ...updatedTopic,
        quizzes: updatedTopic.quizzes.some((item) => item.id === quiz.id)
          ? updatedTopic.quizzes
          : [quiz, ...updatedTopic.quizzes]
      }
    });
  } catch (error) {
    console.error("AI Enrichment failed:", error.message);
    const statusCode = error.message?.includes("GEMINI_API_KEY") ? 503 : 500;
    res.status(statusCode).json({ error: error.message || "AI Enrichment failed." });
  }
};

/**
 * Update quiz questions manually (Professor only)
 */
exports.updateQuiz = async (req, res) => {
  try {
    const { quizId } = req.params;
    const { questions } = req.body;
    if (req.user.role !== "PROFESSOR") return res.status(403).json({ error: "Unauthorized." });
    const updatedQuiz = await prisma.quiz.update({ where: { id: quizId }, data: { questions } });
    res.json({ message: "Quiz updated!", quiz: updatedQuiz });
  } catch (error) { res.status(500).json({ error: "Failed to update quiz." }); }
};

/**
 * Delete a quiz manually (Professor only)
 */
exports.deleteQuiz = async (req, res) => {
  try {
    const { quizId } = req.params;
    if (req.user.role !== "PROFESSOR") return res.status(403).json({ error: "Unauthorized." });
    await prisma.quiz.delete({ where: { id: quizId } });
    res.json({ message: "Quiz deleted!" });
  } catch (error) { res.status(500).json({ error: "Failed to delete quiz." }); }
};
