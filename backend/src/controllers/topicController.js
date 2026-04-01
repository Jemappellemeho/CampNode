const prisma = require("../utils/prisma");
const axios = require("axios");
const { scrapeUrl } = require("../services/scraperService");
const { parsePdf } = require("../services/pdfService");
const aiService = require("../services/aiService");

const BLOCKED_SECTION_TITLES = new Set([
  "references",
  "see also",
  "external links",
  "notes",
  "bibliography",
  "further reading",
  "citations",
  "sources",
  "literature",
  "web links",
  "gallery",
  "history"
]);

const normalizeTopicName = (value) => String(value || "").trim().toLowerCase();

async function fetchWikiSectionTitles(wikidataId, lang = "en") {
  try {
    const entityUrl = `https://www.wikidata.org/wiki/Special:EntityData/${wikidataId}.json`;
    const entityRes = await axios.get(entityUrl, { headers: { "User-Agent": "WissenGraph/1.0" } });
    const entity = entityRes.data.entities[wikidataId];
    if (!entity) return [];

    const wikiTitle = entity.sitelinks?.[`${lang}wiki`]?.title
      || entity.sitelinks?.["enwiki"]?.title
      || entity.sitelinks?.["dewiki"]?.title;

    if (!wikiTitle) return [];

    const wikiLang = entity.sitelinks?.[`${lang}wiki`]
      ? lang
      : entity.sitelinks?.["enwiki"]
      ? "en"
      : "de";

    const parseUrl =
      `https://${wikiLang}.wikipedia.org/w/api.php` +
      `?action=parse` +
      `&format=json` +
      `&page=${encodeURIComponent(wikiTitle)}` +
      `&prop=sections` +
      `&origin=*`;

    const parseRes = await axios.get(parseUrl, { headers: { "User-Agent": "WissenGraph/1.0" } });
    const sections = parseRes.data?.parse?.sections || [];

    return [...new Set(
      sections
        .map((s) => String(s.line || "").trim())
        .filter(Boolean)
        .filter((line) => line.length >= 3 && line.length <= 50)
        .filter((line) => !BLOCKED_SECTION_TITLES.has(line.toLowerCase()))
    )];
  } catch (err) {
    console.warn("fetchWikiSectionTitles failed:", err.message);
    return [];
  }
}

async function fetchWikidataRelatedEntities(wikidataId, lang = "en") {
  try {
    const entityUrl = `https://www.wikidata.org/wiki/Special:EntityData/${wikidataId}.json`;
    const entityRes = await axios.get(entityUrl, { headers: { "User-Agent": "WissenGraph/1.0" } });
    const entity = entityRes.data.entities[wikidataId];
    if (!entity) return [];

    const relatedProperties = ["P527", "P361", "P279"]; // has part, part of, subclass of
    const relatedIds = new Set();

    for (const property of relatedProperties) {
      const claims = entity.claims?.[property] || [];
      for (const claim of claims) {
        const targetId = claim?.mainsnak?.datavalue?.value?.id;
        if (targetId && typeof targetId === "string" && /^Q\d+$/.test(targetId)) {
          relatedIds.add(targetId);
        }
      }
    }

    const ids = [...relatedIds].slice(0, 30);
    if (ids.length === 0) return [];

    const languages = [lang, "en", "de"].join("|");
    const entitiesUrl =
      `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json` +
      `&props=labels|descriptions&languages=${encodeURIComponent(languages)}` +
      `&ids=${encodeURIComponent(ids.join("|"))}`;

    const entitiesRes = await axios.get(entitiesUrl, { headers: { "User-Agent": "WissenGraph/1.0" } });
    const payloadEntities = entitiesRes.data?.entities || {};

    return ids
      .map((id) => {
        const payload = payloadEntities[id] || {};
        const labels = payload.labels || {};
        const descriptions = payload.descriptions || {};
        const label = labels[lang]?.value || labels.en?.value || labels.de?.value || null;
        const description = descriptions[lang]?.value || descriptions.en?.value || descriptions.de?.value || null;
        if (!label) return null;
        return {
          id,
          label: String(label).trim(),
          description: description ? String(description).trim() : null
        };
      })
      .filter(Boolean);
  } catch (err) {
    console.warn("fetchWikidataRelatedEntities failed:", err.message);
    return [];
  }
}

async function findBestWikidataMatch(topicName, parentTopicName, lang = "en") {
  try {
    const query = `${topicName} ${parentTopicName}`.trim();
    const searchUrl =
      `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json` +
      `&language=${encodeURIComponent(lang)}` +
      `&limit=5` +
      `&search=${encodeURIComponent(query)}`;

    const res = await axios.get(searchUrl, {
      headers: { "User-Agent": "WissenGraph/1.0" },
      timeout: 2500
    });

    const candidates = res.data?.search || [];
    if (candidates.length === 0) return null;

    const normalizedTarget = normalizeTopicName(topicName);
    const exact = candidates.find((c) => normalizeTopicName(c.label) === normalizedTarget);
    const best = exact || candidates[0];
    if (!best?.id) return null;

    return {
      id: best.id,
      description: best.description ? String(best.description).trim() : null
    };
  } catch (err) {
    return null;
  }
}

async function enrichSubtopicsWithWikidata(createdSubtopics, parentTopicName, lang = "en") {
  try {
    for (const subtopic of createdSubtopics) {
      if (!subtopic?.id || subtopic?.wikidataId) continue;
      const match = await findBestWikidataMatch(subtopic.name, parentTopicName, lang);
      if (!match?.id) continue;
      await prisma.topic.update({
        where: { id: subtopic.id },
        data: {
          wikidataId: match.id,
          description: match.description || subtopic.description
        }
      });
    }
  } catch (err) {
    console.warn("enrichSubtopicsWithWikidata failed:", err.message);
  }
}

function pickSubtopicsFromWikidata(mainTopicName, candidates, limit = 8) {
  const blocked = new Set([
    "overview",
    "definition",
    "history",
    "references",
    "external links",
    "see also",
    "bibliography",
    "notes"
  ]);

  const main = normalizeTopicName(mainTopicName);
  const result = [];
  const seen = new Set();

  for (const candidate of candidates) {
    const name = String(candidate || "").trim();
    const normalized = normalizeTopicName(name);
    if (!name) continue;
    if (normalized === main) continue;
    if (blocked.has(normalized)) continue;
    if (normalized.length < 3 || normalized.length > 60) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(name);
    if (result.length >= limit) break;
  }

  return result;
}

async function createAutoSubtopics({ courseId, parentTopic, parentWikidataId, lang = "en" }) {
  if (!courseId || !parentTopic?.id || !parentTopic?.name || !parentWikidataId) {
    return [];
  }

  const existingTopics = await prisma.topic.findMany({
    where: { courseId },
    select: { id: true, name: true }
  });

  const existingNameSet = new Set(existingTopics.map((topic) => normalizeTopicName(topic.name)));
  existingNameSet.add(normalizeTopicName(parentTopic.name));

  const sectionCandidates = await fetchWikiSectionTitles(parentWikidataId, lang);
  const relatedEntities = await fetchWikidataRelatedEntities(parentWikidataId, lang);
  const relatedLabelLookup = new Map(
    relatedEntities.map((entity) => [normalizeTopicName(entity.label), entity])
  );

  const generatedSubtopics = pickSubtopicsFromWikidata(
    parentTopic.name,
    [...sectionCandidates, ...relatedEntities.map((entity) => entity.label)],
    8
  );

  const filteredNames = generatedSubtopics
    .map((name) => String(name || "").trim())
    .filter(Boolean)
    .filter((name) => normalizeTopicName(name) !== normalizeTopicName(parentTopic.name))
    .filter((name) => !existingNameSet.has(normalizeTopicName(name)));

  if (filteredNames.length === 0) {
    return [];
  }

  const createdSubtopics = [];
  for (const subtopicName of filteredNames) {
    const relatedEntity = relatedLabelLookup.get(normalizeTopicName(subtopicName));
    const createdTopic = await prisma.topic.create({
      data: {
        name: subtopicName,
        description: relatedEntity?.description || `Auto-generated subtopic for "${parentTopic.name}".`,
        courseId,
        wikidataId: relatedEntity?.id || null,
        prerequisites: {
          connect: [{ id: parentTopic.id }]
        }
      }
    });
    createdSubtopics.push(createdTopic);
  }

  // Nicht-blockierend: fehlende Wikidata-IDs später ergänzen, damit Topic-Erstellung schnell bleibt.
  enrichSubtopicsWithWikidata(createdSubtopics, parentTopic.name, lang).catch(() => {});

  return createdSubtopics;
}

async function collectDescendantTopicIds(rootTopicId) {
  const descendants = new Set();
  let frontier = [rootTopicId];

  while (frontier.length > 0) {
    const children = await prisma.topic.findMany({
      where: {
        prerequisites: {
          some: { id: { in: frontier } }
        }
      },
      select: { id: true }
    });

    const nextFrontier = [];
    for (const child of children) {
      if (!descendants.has(child.id) && child.id !== rootTopicId) {
        descendants.add(child.id);
        nextFrontier.push(child.id);
      }
    }
    frontier = nextFrontier;
  }

  return [...descendants];
}

// Erstellt ein neues Thema und verarbeitet optionale Quellen (Web-Link oder PDF)
exports.createTopic = async (req, res) => {
  try {
    const {
      name,
      description,
      courseId,
      wikidataId,
      sourceUrl,
      generateSubtopics: generateSubtopicsRaw
    } = req.body;

    const shouldGenerateSubtopics =
      generateSubtopicsRaw === undefined
        ? Boolean(courseId && wikidataId)
        : String(generateSubtopicsRaw).toLowerCase() !== "false";

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

    let autoSubtopics = [];
    if (shouldGenerateSubtopics && courseId && wikidataId) {
      autoSubtopics = await createAutoSubtopics({
        courseId,
        parentTopic: topic,
        parentWikidataId: wikidataId,
        lang: "en"
      });
    }

    res.status(201).json({
      ...topic,
      autoGeneratedSubtopics: autoSubtopics
    });
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

    const topic = await prisma.topic.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!topic) return res.status(404).json({ error: "Thema nicht gefunden" });

    const descendantIds = await collectDescendantTopicIds(id);
    const allIdsToDelete = [id, ...descendantIds];

    await prisma.$transaction([
      prisma.progress.deleteMany({ where: { topicId: { in: allIdsToDelete } } }),
      prisma.quiz.deleteMany({ where: { topicId: { in: allIdsToDelete } } }),
      prisma.topic.deleteMany({ where: { id: { in: allIdsToDelete } } })
    ]);

    res.json({
      message: "Thema und Unterthemen erfolgreich gelöscht",
      deletedTopicIds: allIdsToDelete,
      deletedCount: allIdsToDelete.length
    });
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
      console.log("Fetching Wiki content...");
    
      const wikiText = await fetchWikiText(topic.wikidataId);
    
      if (!wikiText) {
        console.log("❌ Wiki fetch failed");
    
        // 🔥 TEMP FIX (VERY IMPORTANT)
        topic = await prisma.topic.update({
          where: { id },
          data: { content: "Fallback content for testing" }
        });
    
      } else {
        console.log("✅ Wiki content loaded");
    
        topic = await prisma.topic.update({
          where: { id },
          data: { content: wikiText }
        });
      }
    }

    if (!topic || !topic.content) return res.status(400).json({ error: "Kein Inhalt vorhanden." });

    console.log("CONTENT LENGTH:", topic.content?.length);
    console.log("CONTENT PREVIEW:", topic.content?.substring(0, 200));

    const summary = await aiService.generateSummary(topic.content);
    const quizQuestions = await aiService.generateQuiz(topic.content);

    console.log("AI QUIZ:", quizQuestions);

    const updatedTopic = await prisma.topic.update({
      where: { id },
      data: {
        description: summary, 
        quizzes: { create: { questions: quizQuestions } }
      },
      include: { quizzes: true }
    });

    res.json({ message: "KI-Modul wurde erfolgreich angereichert!", topic: updatedTopic });
  } //catch (error) { res.status(500).json({ error: "Fehler bei der KI-Analyse." }); }
  catch (error) {
    console.error("AI ERROR:", error);
    res.status(500).json({ error: error.message });
  }
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
