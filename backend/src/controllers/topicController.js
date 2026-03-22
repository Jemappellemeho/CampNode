const prisma = require("../utils/prisma");
const axios = require("axios");

// Create a new topic and link it to a course via courseId
exports.createTopic = async (req, res) => {
  try {
    const { name, description, courseId, wikidataId } = req.body;

    // wikidataId is the Wikidata Q-number (e.g. "Q8777")
    // It is used later to fetch the Wikipedia article for this topic
    const topic = await prisma.topic.create({
      data: {
        name,
        description,
        courseId,
        wikidataId,
      }
    });

    res.status(201).json(topic);
  } catch (error) {
    console.error("Create Topic Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

// Get all topics belonging to a specific course
exports.getTopicsByCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const topics = await prisma.topic.findMany({
      where: { courseId }
    });
    res.json(topics);
  } catch (error) {
    res.status(500).json({ error: "Fehler beim Abrufen der Themen" });
  }
};

// Update topic name and description (professors only)
exports.updateTopic = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    if (req.user.role !== "PROFESSOR") {
      return res.status(403).json({ error: "Zugriff verweigert" });
    }

    const updatedTopic = await prisma.topic.update({
      where: { id },
      data: { name, description }
    });

    res.json({ message: "Thema aktualisiert", topic: updatedTopic });
  } catch (error) {
    res.status(500).json({ error: "Fehler beim Aktualisieren des Themas" });
  }
};

// Delete a topic (professors only)
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

// Fetch Wikipedia article content for a topic
// Flow: topic (wikidataId) -> Wikidata API (sitelinks) -> Wikipedia REST API (HTML)
exports.getTopicContent = async (req, res) => {
  try {
    const { id } = req.params;
    const lang = req.query.lang || "en";

    const topic = await prisma.topic.findUnique({ where: { id } });

    if (!topic) {
      return res.status(404).json({ error: "Topic not found" });
    }

    // Topics without a wikidataId have no linked Wikipedia article
    if (!topic.wikidataId) {
      return res.status(200).json({
        content: "<p>This topic has no linked Wikipedia article.</p>"
      });
    }

    // Step 1: Fetch the Wikidata entity to get Wikipedia page titles
    // Wikidata stores sitelinks like { "enwiki": { title: "HTTP" }, "dewiki": { title: "HTTP" } }
    let entityRes;
    try {
      entityRes = await axios.get(
        `https://www.wikidata.org/wiki/Special:EntityData/${topic.wikidataId}.json`,
        { headers: { "User-Agent": "WissenGraph/1.0" } }
      );
    } catch (e) {
      return res.status(200).json({
        content: "<p>Wikidata entity not found.</p>"
      });
    }

    const entity = entityRes.data.entities[topic.wikidataId];

    // Step 2: Try the requested language first, fall back to English
    // This handles cases where an article exists in EN but not in DE
    const langs = lang !== "en" ? [lang, "en"] : ["en"];

    for (const tryLang of langs) {
      const titleForLang = entity.sitelinks?.[`${tryLang}wiki`]?.title;

      // No sitelink for this language — try the next one
      if (!titleForLang) continue;

      // Step 3: Fetch mobile HTML from Wikipedia REST API
      // Mobile HTML is cleaner and easier to sanitize
      try {
        const wikiUrl = `https://${tryLang}.wikipedia.org/api/rest_v1/page/mobile-html/${encodeURIComponent(titleForLang)}`;
        const wikiRes = await axios.get(wikiUrl, {
          headers: { "User-Agent": "WissenGraph/1.0" }
        });

        let html = wikiRes.data;

        // Step 4: Sanitize HTML — remove scripts, styles, and Wikipedia chrome
        html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
        html = html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");
        html = html.replace(/<header[\s\S]*?<\/header>/gi, "");
        html = html.replace(/<footer[\s\S]*?<\/footer>/gi, "");

        // Extract only the body content to avoid other non-article elements
        const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
        let cleanHtml = bodyMatch ? bodyMatch[1] : html;

        // Remove footnotes, inline links, and edit buttons
        // but keep <b>, <strong>, <h2>, <h3> for formatting
        cleanHtml = cleanHtml.replace(/<sup[^>]*>[\s\S]*?<\/sup>/g, "");
        cleanHtml = cleanHtml.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/g, "$1");
        cleanHtml = cleanHtml.replace(/<span[^>]*class="[^"]*pcs-edit[^"]*"[^>]*>[\s\S]*?<\/span>/g, "");
        cleanHtml = cleanHtml.replace(/<figure[\s\S]*?<\/figure>/gi, "");

        return res.json({ content: cleanHtml.trim() });
      } catch (err) {
        console.warn(`[Wikipedia] Failed for lang=${tryLang}, title=${titleForLang}: ${err.message}`);
        // Continue to next language in the fallback chain
      }
    }

    // All language attempts failed — return a link to Wikipedia as last resort
    const fallbackTitle =
      entity.sitelinks?.[`${lang}wiki`]?.title ||
      entity.sitelinks?.["enwiki"]?.title ||
      topic.name;

    return res.status(200).json({
      content: `<p>Article for <b>${topic.name}</b> could not be loaded. <a href="https://en.wikipedia.org/wiki/${encodeURIComponent(fallbackTitle)}" target="_blank" style="color:#1E6FFF">Open on Wikipedia ↗</a></p>`
    });

  } catch (err) {
    console.error("[TopicContent] Error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
};