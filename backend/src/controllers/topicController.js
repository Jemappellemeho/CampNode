// Topic controller.
// Handles source parsing, topic content, and quiz regeneration.
const prisma = require("../utils/prisma");
const axios = require("axios");
const { scrapeUrl, tryScrapeUrl } = require("../services/scraperService");
const { parsePdfDocument } = require("../services/pdfService");
const aiService = require("../services/aiService");
const { resolveTopicCourseId, getCourseAccess } = require("../utils/courseAccess");
const { sanitizeQuestionsForStudent, gradeQuestion } = require("../services/quizGrading");

// B7: enforce "enrolled student OR course owner" for a topic's course.
// When the topic is not attached to any course (orphaned/reusable), there is no enrollment
// context to check, so access is left as-is (still requires a valid token via the route).
// Returns true when allowed; otherwise sends the response and returns false.
async function assertTopicAccess(req, res, topicId) {
  const courseId = await resolveTopicCourseId(topicId);
  if (!courseId) return true;
  const access = await getCourseAccess(req.user.userId || req.user.id, courseId);
  if (!access.allowed) {
    res.status(403).json({ error: "You are not enrolled in this course" });
    return false;
  }
  return access;
}

// Save quiz to database: update existing or create new if none exists.
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

// Load a topic and every nested child.
async function getTopicTree(topicId) {
  const root = await prisma.topic.findUnique({ where: { id: topicId } });
  if (!root) return [];

  const courseTopics = root.courseId
    ? await prisma.topic.findMany({ where: { courseId: root.courseId } })
    : [root];
  const byParent = new Map();

  courseTopics.forEach((topic) => {
    const children = byParent.get(topic.parentTopicId) || [];
    children.push(topic);
    byParent.set(topic.parentTopicId, children);
  });

  const tree = [];
  const visited = new Set();
  const visit = (topic) => {
    if (visited.has(topic.id)) return;
    visited.add(topic.id);
    tree.push(topic);
    (byParent.get(topic.id) || []).forEach(visit);
  };
  visit(root);
  return tree;
}

// Combine readable material from the full tree.
async function getTopicTreeSource(topicId, { refreshLinkedSources = false } = {}) {
  const topics = await getTopicTree(topicId);
  const sections = [];

  for (const topic of topics) {
    const source = await ensureTopicSourceContent(topic, { refreshLinkedSource: refreshLinkedSources });
    if (source.content) sections.push({ name: topic.name, content: source.content });
  }

  const sectionLimit = Math.max(4000, Math.floor(120000 / Math.max(sections.length, 1)));

  return {
    topics,
    content: sections
      .map(({ name, content }) => `## ${name}\n${content.slice(0, sectionLimit)}`)
      .join("\n\n"),
  };
}

// Escape HTML special characters to prevent XSS.
function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Convert plain PDF text to HTML with proper formatting.
function formatPlainPdfTextAsHtml(rawText) {
  // === STEP 1: Normalize whitespace and line endings ===
  const normalized = String(rawText || "")
    .replace(/\r\n?/g, "\n")          // Windows line endings -> Unix
    .replace(/[\u00A0\t]+/g, " ")      // Non-breaking spaces, tabs -> space
    .replace(/\bD\s+r\.\s+/g, "Dr. ") // Fix "D r." to "Dr."
    .replace(/\s+([,.;:!?])/g, "$1")  // Remove space before punctuation
    .replace(/\n{3,}/g, "\n\n")       // Multiple blank lines -> double
    .replace(/\s*---\s*PAGE\s+BREAK\s*---\s*/gi, "\n\n[[PAGE_BREAK]]\n\n") // Mark page breaks
    .replace(/([.!?])\s+(?=\d+\.\s+[A-Z])/g, "$1\n\n") // Sentence + numbered heading -> newline
    .replace(/:\s+(?=\d+\.\s+[A-Z])/g, ":\n\n") // Colon + numbered heading -> newline
    .replace(/\s+•\s+/g, "\n• ")      // Spaces around bullet -> newline + bullet
    .replace(/\s+o\s+/gi, "\no ")    // Spaces around "o" -> newline + "o "
    .replace(/\s+-\s+/g, "\n- ");     // Spaces around dash -> newline + dash

  // STEP 2: Split into blocks (separated by double newlines) 
  const blocks = normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const html = [];

  // STEP 3: Process each block 
  for (const block of blocks) {
    // Handle page break markers
    if (block === "[[PAGE_BREAK]]") {
      html.push('<hr style="margin: 1.5rem 0; border: 0; border-top: 1px dashed rgba(125, 125, 125, 0.25);" />');
      continue;
    }

    // Split block into individual lines
    const lines = block
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);

    const paragraphs = [];
    const listItems = [];

    // Helper: flush collected list items as <ul>
    const flushList = () => {
      if (!listItems.length) return;
      html.push(`<ul class="pdf-list">${listItems.map((item) => `<li>${item}</li>`).join("")}</ul>`);
      listItems.length = 0;
    };

    // Helper: flush collected paragraphs as <p>
    const flushParagraphs = () => {
      if (!paragraphs.length) return;
      paragraphs.forEach((paragraph) => html.push(`<p>${paragraph}</p>`));
      paragraphs.length = 0;
    };

    // STEP 4: Process each line and detect its type 
    for (const rawLine of lines) {
      // Page break within block
      if (rawLine === "[[PAGE_BREAK]]") {
        flushList();
        flushParagraphs();
        html.push('<hr style="margin: 1.5rem 0; border: 0; border-top: 1px dashed rgba(125, 125, 125, 0.25);" />');
        continue;
      }

      // Numbered section heading (e.g., "1. Introduction")
      const sectionMatch = rawLine.match(/^(\d+)\.\s+(.+)$/);
      if (sectionMatch) {
        flushList();
        flushParagraphs();

        const sectionTitle = sectionMatch[2].replace(/\s*•\s*/g, " ").trim();
        html.push(`<h3 class="pdf-heading">${escapeHtml(`${sectionMatch[1]}. ${sectionTitle}`)}</h3>`);

        // Sub-items after section title (bullets or key:value pairs)
        const tailParts = sectionTitle
          .split(/\s*•\s*/)
          .map((part) => part.trim())
          .filter(Boolean);

        if (tailParts.length > 1) {
          tailParts.slice(1).forEach((part) => {
            if (/^[•o\-*]\s*/.test(part)) {
              listItems.push(escapeHtml(part.replace(/^[•o\-*]\s*/, "")));
            } else {
              paragraphs.push(`<strong>${escapeHtml(part.split(":")[0])}:</strong> ${escapeHtml(part.includes(":") ? part.slice(part.indexOf(":") + 1).trim() : "")}`.trim());
            }
          });
        }

        continue;
      }

      // Bullet or asterisk line (list item)
      const bulletMatch = rawLine.match(/^[•o\-*]\s*(.+)$/i);
      if (bulletMatch) {
        flushParagraphs();
        listItems.push(escapeHtml(bulletMatch[1]));
        continue;
      }

      // Label:value pair (e.g., "Author: John Doe")
      const labelMatch = rawLine.match(/^([A-Za-z][A-Za-z\s\/()\-]{1,40}):\s*(.+)$/);
      if (labelMatch) {
        flushList();
        paragraphs.push(`<strong>${escapeHtml(labelMatch[1])}:</strong> ${escapeHtml(labelMatch[2])}`);
        continue;
      }

      // All-caps heading (no punctuation at end)
      if (/^[A-Z][A-Z0-9\s:()\-\/,&.]{6,90}$/.test(rawLine) && !/[.?!]$/.test(rawLine)) {
        flushList();
        flushParagraphs();
        html.push(`<h3 class="pdf-heading">${escapeHtml(rawLine)}</h3>`);
        continue;
      }

      // Regular paragraph text
      if (listItems.length) flushList();
      paragraphs.push(escapeHtml(rawLine));
    }

    // Flush any remaining content
    flushList();
    flushParagraphs();
  }

  return html.join("");
}

// Parse PDF once for RAG text.
async function preparePdfSource(file) {
  const parsedPdf = await parsePdfDocument(file.buffer, { fileName: file.originalname });

  return {
    content: parsedPdf.text,
  };
}

// GET Quiz for a topic
// If missing or < 8 questions, regenerates to ensure a full session.
exports.getQuizByTopic = async (req, res) => {
  try {
    const { topicId } = req.params;
    const includeSubtopics = req.query.scope === "tree";

    // B7: only the course owner or enrolled students may load a quiz.
    const access = await assertTopicAccess(req, res, topicId);
    if (!access) return;
    const isOwner = access === true ? false : access.isOwner;

    // Load the latest quiz for this topic.
    let quiz = await prisma.quiz.findFirst({
      where: { topicId: topicId }
    });

    // Never replace a teacher's saved quiz.
    if (!quiz) {
      console.log(`[Quiz] No valid quiz found for topic ${topicId}. Generating 10 questions...`);
      const topic = await prisma.topic.findUnique({ where: { id: topicId } });
      if (!topic) return res.status(404).json({ error: "Topic not found." });

      // Resolve the best available source before quiz generation.
      const source = includeSubtopics
        ? await getTopicTreeSource(topicId)
        : await ensureTopicSourceContent(topic);
      const sourceContent = source.content;
      
      // Generate a normalized quiz using source text when available.
      const questions = await aiService.generateQuiz(sourceContent || topic.name, topic.name, {
        courseId: topic.courseId,
      });

      quiz = await upsertTopicQuiz(topicId, questions);
    }

    // B4: students receive the quiz WITHOUT correct answers/explanations.
    // Scoring + reveal happen server-side via POST /api/topics/quizzes/:quizId/grade.
    // The owner (professor) still gets the full quiz (e.g. for previewing).
    const safeQuiz = isOwner
      ? quiz
      : { ...quiz, questions: sanitizeQuestionsForStudent(quiz.questions) };

    // Subtopic-aware scope (from QuizWithRag): which topic ids this quiz covers.
    const scopeTopicIds = includeSubtopics
      ? (await getTopicTree(topicId)).map((topic) => topic.id)
      : [topicId];

    res.json({ ...safeQuiz, scopeTopicIds });
  } catch (error) {
    console.error("Quiz Fetch Error:", error.message);
    const statusCode = error.message?.toLowerCase().includes("quota") ? 503 : 500;
    res.status(statusCode).json({ error: error.message || "Failed to load or generate quiz." });
  }
};

// POST grade a single quiz answer server-side (B4).
// Body: { questionIndex, answer }. Returns { correct, partial, pointsEarned, maxPoints, correctAnswer, explanation }.
// The correct answer/explanation are returned only for the question the student just answered.
exports.gradeQuizQuestion = async (req, res) => {
  try {
    const { quizId } = req.params;
    const { questionIndex, answer } = req.body;

    const quiz = await prisma.quiz.findUnique({ where: { id: quizId } });
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    // Enforce enrollment/ownership via the quiz's topic.
    if (!(await assertTopicAccess(req, res, quiz.topicId))) return;

    const questions = Array.isArray(quiz.questions) ? quiz.questions : [];
    const index = Number(questionIndex);
    const question = Number.isInteger(index) ? questions[index] : null;
    if (!question) return res.status(400).json({ error: "Invalid question index" });

    res.json(gradeQuestion(question, answer));
  } catch (error) {
    console.error("Quiz grade error:", error.message);
    res.status(500).json({ error: "Failed to grade answer" });
  }
};

// POST Create a new topic
exports.createTopic = async (req, res) => {
  try {
    const { name, description, courseId, wikidataId, sourceUrl, articleUrl, language } = req.body;
    let content = "";
    // articleUrl is used only for external source links.
    // Uploaded PDFs are parsed in memory and not stored as files.
    const sourceLink = sourceUrl || articleUrl || null;
    let resolvedArticleUrl = sourceLink;

    // Uploaded PDFs are parsed first because they are the strongest source.
    if (req.file) {
      console.log("Parsing PDF:", req.file.originalname);
      const pdfSource = await preparePdfSource(req.file);
      content = pdfSource.content;
      resolvedArticleUrl = null;
    }
    else if (sourceLink) {
      console.log("Scraping website:", sourceLink);
      // Save the topic even when the linked page blocks scraping.
      content = await tryScrapeUrl(sourceLink);
    } 
    else if (wikidataId) {
      console.log("Fetching WikiText for:", wikidataId);
      // The optional language keeps standalone topic creation consistent with the course modal flow.
      const wikiText = await fetchWikiText(wikidataId, language);
      if (wikiText) content = wikiText;
    }

    // Store extracted text and source pointers, not uploaded files.
    const topic = await prisma.topic.create({
      data: {
        name,
        description,
        courseId,
        wikidataId,
        articleUrl: resolvedArticleUrl,
        content: content || null,
      }
    });

    if (topic.courseId && content) {
      // RAG receives clean text only.
      aiService.ingestToRAG(courseId, name, content);
    }

    res.status(201).json(topic);
  } catch (error) {
    console.error("Topic Creation Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

// GET topics by course
exports.getTopicsByCourse = async (req, res) => {
  try {
    const { courseId } = req.params;

    // B7: only the course owner or enrolled students may list a course's topics.
    const access = await getCourseAccess(req.user.userId || req.user.id, courseId);
    if (!access.exists) return res.status(404).json({ error: "Course not found" });
    if (!access.allowed) return res.status(403).json({ error: "You are not enrolled in this course" });

    const topics = await prisma.topic.findMany({
      where: { courseId },
      include: {
        prerequisites: { select: { id: true, name: true } },
      }
    });
    res.json(topics);
  } catch (error) {
    console.error("Fetch topics error:", error.message);
    res.status(500).json({ error: "Failed to fetch topics" });
  }
};

// PUT update a topic, optionally attaching a new PDF file and merging content
exports.updateTopic = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, prerequisiteIds, sourceUrl, articleUrl } = req.body;

    if (req.user.role !== "PROFESSOR") {
      return res.status(403).json({ error: "Access denied" });
    }

    const currentTopic = await prisma.topic.findUnique({ where: { id } });
    if (!currentTopic) return res.status(404).json({ error: "Topic not found" });

    // New source text is appended to existing content.
    let newContent = "";
    let nextArticleUrl = currentTopic.articleUrl || null;
    const sourceLink = sourceUrl || articleUrl || null;

    // File replacement wins over linked sources.
    if (req.file) {
      const pdfSource = await preparePdfSource(req.file);
      newContent = pdfSource.content;
      nextArticleUrl = null;
    } else if (sourceLink) {
      // Keep the topic update successful even if scraping fails.
      newContent = await tryScrapeUrl(sourceLink);
      nextArticleUrl = sourceLink;
    }

    // Keep existing extracted material and append new source text as supplementary content.
    let combinedContent = currentTopic.content || "";
    if (newContent) {
      combinedContent = combinedContent 
        ? `${combinedContent}\n\n--- Supplementary Material ---\n\n${newContent}` 
        : newContent;
    }

    // Build a Prisma update payload from editable fields.
    const data = { 
      name, 
      description,
      articleUrl: nextArticleUrl,
      content: combinedContent,
    };

    if (prerequisiteIds && Array.isArray(prerequisiteIds)) {
      // Replace prerequisite links with the teacher-selected list.
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

// DELETE a specific topic
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

// GET topic content from Wikipedia
exports.getTopicContent = async (req, res) => {
  try {
    const { id } = req.params;
    const lang = req.query.lang || "en";

    // B7: gate topic content behind course enrollment/ownership.
    if (!(await assertTopicAccess(req, res, id))) return;

    const topic = await prisma.topic.findUnique({ where: { id } });

    if (!topic) return res.status(404).json({ error: "Topic not found" });

    // For PDF/source-based nodes we render HTML from extracted text.
    if (!topic.wikidataId) {
      if (topic.content && topic.content.trim()) {
        return res.status(200).json({ content: formatPlainPdfTextAsHtml(topic.content) });
      }

      return res.status(200).json({ content: `<p>No source content is attached to this topic.</p>` });
    }

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
    
    if (!titleForLang) {
      return res.status(200).json({ content: `<p>No Wikidata article is available for this topic.</p>` });
    }

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

// Fetch plain text from Wikipedia
async function fetchWikiText(wikidataId, preferredLang = "en") {
  try {
    const entityUrl = `https://www.wikidata.org/wiki/Special:EntityData/${wikidataId}.json`;
    const entityRes = await axios.get(entityUrl, { headers: { "User-Agent": "CampNode/1.0" } });
    const entity = entityRes.data.entities[wikidataId];
    // Prefer the requested language first, then fall back to the other supported wiki.
    const normalizedLang = preferredLang === "de" ? "de" : "en";
    const preferredWikiKey = `${normalizedLang}wiki`;
    const fallbackWikiKey = normalizedLang === "en" ? "dewiki" : "enwiki";
    const wikiTitle = entity.sitelinks?.[preferredWikiKey]?.title || entity.sitelinks?.[fallbackWikiKey]?.title;
    if (!wikiTitle) return null;
    const lang = entity.sitelinks?.[preferredWikiKey] ? normalizedLang : normalizedLang === "en" ? "de" : "en";
    const wikiUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&titles=${encodeURIComponent(wikiTitle)}&format=json&origin=*`;
    const wikiRes = await axios.get(wikiUrl, { headers: { "User-Agent": "CampNode/1.0" } });
    const pages = wikiRes.data.query.pages;
    const pageId = Object.keys(pages)[0];
    return pages[pageId].extract || null;
  } catch (err) { return null; }
}

// Get content for topic: check local content first, then fetch from Wikipedia/web.
async function ensureTopicSourceContent(topic, { refreshLinkedSource = false } = {}) {
  if (!topic) return { topic, content: "" };

  // Refresh the current article for teacher drafts.
  if (refreshLinkedSource && topic.articleUrl) {
    try {
      const refreshedContent = await scrapeUrl(topic.articleUrl);
      if (refreshedContent) {
        const updatedTopic = await prisma.topic.update({
          where: { id: topic.id },
          data: { content: refreshedContent }
        });
        return { topic: updatedTopic, content: refreshedContent };
      }
    } catch (error) {
      console.error("Article refresh failed:", error.message);
    }
  }

  // Reuse already extracted source text when possible.
  if (topic.content && topic.content.trim()) {
    return { topic, content: topic.content.trim() };
  }

  let nextContent = "";

  // Wikidata topics fetch plain Wikipedia text.
  if (topic.wikidataId) {
    const wikiText = await fetchWikiText(topic.wikidataId);
    if (wikiText) nextContent = wikiText;
  }

  // Linked article topics fall back to the scraper.
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

  // Cache extracted text so later quiz generation is faster.
  const updatedTopic = await prisma.topic.update({
    where: { id: topic.id },
    data: { content: nextContent }
  });

  return { topic: updatedTopic, content: nextContent };
}


// POST: Trigger AI to generate summary and quiz questions based on topic content
exports.enrichTopic = async (req, res) => {
  try {
    const { id } = req.params;
    const includeSubtopics = Boolean(req.body?.includeSubtopics);
    const draftOnly = Boolean(req.body?.draftOnly);

    // Only professors can generate or replace quizzes.
    if (req.user.role !== "PROFESSOR") return res.status(403).json({ error: "Unauthorized." });

    // Load the topic before resolving its source text.
    let topic = await prisma.topic.findUnique({ where: { id } });
    if (!topic) return res.status(404).json({ error: "Topic not found." });

    // Resolve source text from cached content, Wikidata, or linked article.
    const source = includeSubtopics
      ? await getTopicTreeSource(id, { refreshLinkedSources: true })
      : await ensureTopicSourceContent(topic, { refreshLinkedSource: true });
    topic = source.topic || topic;

    console.log(`[Debug] Enriching Topic: ${topic.name}. Content found: ${!!source.content}`);

    // Stop early when the quiz generator has no readable material.
    if (!source.content) {
      const hasLinkedSource = Boolean(topic.articleUrl || topic.wikidataId);
      return res.status(400).json({
        error: hasLinkedSource
          ? "Could not extract readable text from the linked source. Try adding the link as a source URL, using another article page, or uploading the PDF/text directly."
          : "No content available for AI.",
      });
    }

    // Send clean source text to RAG before quiz generation.
    if (topic.courseId) {
      console.log(`[Debug] Sending enriched content to RAG for course ${topic.courseId}`);
      aiService.ingestToRAG(topic.courseId, topic.name, source.content);
    } else {
      console.log("[Debug] Skipping RAG ingestion in enrich: no courseId");
    }

    // Generate source-grounded quiz questions.
    const quizQuestions = await aiService.generateQuiz(source.content, topic.name, {
      courseId: topic.courseId,
    });

    // Return a draft without saving it.
    if (draftOnly) {
      const updatedTopic = await prisma.topic.findUnique({
        where: { id },
        include: { quizzes: { orderBy: { createdAt: "desc" } } }
      });
      if (!updatedTopic) return res.status(404).json({ error: "Topic not found." });

      const existingQuiz = updatedTopic.quizzes[0] || null;
      const draftQuiz = existingQuiz
        ? { ...existingQuiz, questions: quizQuestions }
        : { id: null, topicId: id, questions: quizQuestions };

      return res.json({
        message: "Quiz draft generated.",
        topic: { ...updatedTopic, quizzes: [draftQuiz] }
      });
    }

    // Save generated questions into the topic quiz slot.
    const quiz = await upsertTopicQuiz(id, quizQuestions);

    // Reload topic so the response includes the latest quiz list.
    const updatedTopic = await prisma.topic.findUnique({
      where: { id },
      include: { quizzes: true }
    });

    if (!updatedTopic) return res.status(404).json({ error: "Topic not found." });

    res.json({
      message: "AI Enrichment successful!",
      topic: {
        ...updatedTopic,
        // Ensure the freshly saved quiz is included even if Prisma ordering changes.
        quizzes: updatedTopic.quizzes.some((item) => item.id === quiz.id)
          ? updatedTopic.quizzes
          : [quiz, ...updatedTopic.quizzes]
      }
    });
  } catch (error) {
    console.error("AI Enrichment failed:", error.message);
    const statusCode = error.message?.toLowerCase().includes("quota") ? 503 : 500;
    res.status(statusCode).json({ error: error.message || "AI Enrichment failed." });
  }
};

// PUT update quiz questions (Professor only)
exports.updateQuiz = async (req, res) => {
  try {
    const { quizId } = req.params;
    const { questions } = req.body;
    if (req.user.role !== "PROFESSOR") return res.status(403).json({ error: "Unauthorized." });
    const updatedQuiz = await prisma.quiz.update({ where: { id: quizId }, data: { questions } });
    res.json({ message: "Quiz updated!", quiz: updatedQuiz });
  } catch (error) { res.status(500).json({ error: "Failed to update quiz." }); }
};

// DELETE a quiz (Professor only)
exports.deleteQuiz = async (req, res) => {
  try {
    const { quizId } = req.params;
    if (req.user.role !== "PROFESSOR") return res.status(403).json({ error: "Unauthorized." });
    await prisma.quiz.delete({ where: { id: quizId } });
    res.json({ message: "Quiz deleted!" });
  } catch (error) { res.status(500).json({ error: "Failed to delete quiz." }); }
};
