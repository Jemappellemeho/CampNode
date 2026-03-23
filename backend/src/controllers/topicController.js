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

      // Step 3: Fetch the FULL article via MediaWiki parse API
      // This returns the complete rendered article HTML including images,
      // infoboxes, and all sections — not a summary.
      try {
         const parseUrl =
          `https://${tryLang}.wikipedia.org/w/api.php` +
          `?action=parse` +
          `&format=json` +
          `&page=${encodeURIComponent(titleForLang)}` +
          `&prop=text|displaytitle` +
          `&disablelimitreport=1` +
          `&disableeditsection=1` +   // removes [edit] buttons
          `&origin=*`;
 
        const parseRes = await axios.get(parseUrl, {
          headers: { "User-Agent": "WissenGraph/1.0" },
        });
 
        if (parseRes.data.error) {
          console.warn(`[Wikipedia] Parse error for ${titleForLang}: ${parseRes.data.error.info}`);
          continue;
        }
 
        let html = parseRes.data.parse.text["*"];
 
        // Step 4: Fix relative URLs -> absolute so images and links work
        // Wikipedia serves images as "//upload.wikimedia.org/..." (protocol-relative)
        html = html.replace(/src="\/\//g, 'src="https://');
        html = html.replace(/srcset="\/\//g, 'srcset="https://');
 
        // Internal wiki links → open Wikipedia in a new tab
        html = html.replace(
          /href="\/wiki\//g,
          `href="https://${tryLang}.wikipedia.org/wiki/`
        );
 
        // Step 5: Strip only elements that break our UI
        // Remove inline <style> blocks injected by the parser
        html = html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");
 
        return res.json({ content: html.trim() });
 
      } catch (err) {
        console.warn(`[Wikipedia] Failed for lang=${tryLang}, title=${titleForLang}: ${err.message}`);
        // Continue to next language in the fallback chain
      }
    }

    // All language attempts failed- return a link to Wikipedia as last resort
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