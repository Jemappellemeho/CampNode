// PDF extraction service.
// Produces clean text for RAG and quiz generation without saving uploaded files.
const pdf = require("pdf-parse");
const pdfjsLib = require("pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js");
// Normalize whitespace and punctuation in a line of text
const normalizeLine = (line) => line
  .replace(/[\t\u00A0]+/g, " ") // non-breaking spaces to regular spaces
  .replace(/\s+([,.;:!?])/g, "$1") // remove space before punctuation
  .replace(/([([{])\s+/g, "$1") // remove space after opening bracket
  .replace(/\s+([)\]}])/g, "$1") // remove space before closing bracket
  .replace(/\s{2,}/g, " ") // collapse multiple spaces
  .trim();

// Fix words split by PDF (e.g., "D r." -> "Dr.", "An droid" -> "Android")
const fixBrokenWords = (text) => String(text || "")
  .replace(/\bD\s+r\.\s+/g, "Dr. ") // fix "D r." -> "Dr."
  // join 5 lowercase letters split across lines (e.g., "An droid")
  .replace(/\b([A-Z])\s+([a-z])\s+([a-z])\s+([a-z])\s+([a-z]+)\b/g, "$1$2$3$4$5")
  // join 6+ letters, max 14 chars to avoid joining unrelated words
  .replace(/\b([A-Za-z])\s+([A-Za-z])\s+([A-Za-z])\s+([A-Za-z])\s+([A-Za-z])\s+([A-Za-z]+)\b/g, (match) => {
    const joined = match.replace(/\s+/g, "");
    return joined.length <= 14 ? joined : match;
  });

// Check if line should be dropped (page numbers, headers, footers, etc.)
const shouldDropLine = (line) => {
  const normalized = normalizeLine(line);
  if (!normalized) return true;
  if (/^\d+$/.test(normalized)) return true; // page numbers
  if (/^(page|seite)\s+\d+$/i.test(normalized)) return true;
  if (/^(copyright|all rights reserved|isbn)\b/i.test(normalized)) return true;
  if (/^(block|unit)\s+\d+\s*$/i.test(normalized)) return true;
  if (/^(dr\.|prof\.|mr\.|mrs\.|ms\.)\s+[A-Z]/i.test(normalized) && normalized.length < 90) return true;
  if (/^(mobile application development|basics of android application|pgdca\s+\d+)\b/i.test(normalized) && normalized.length < 120) return true;
  return false;
};

// Clean text inside PDF item (similar to normalizeLine but preserves split detection)
const cleanInlineText = (text) => String(text || "")
  .replace(/[\t\u00A0]+/g, " ") // non-breaking spaces
  .replace(/\s{2,}/g, " ") // collapse whitespace
  .replace(/\s+([,.;:!?])/g, "$1") // no space before punctuation
  .replace(/([([{])\s+/g, "$1") // no space after opening
  .replace(/\s+([)\]}])/g, "$1") // no space before closing
  .replace(/\s+\/\s+/g, "/") // no spaces around slash
  .trim();

// Check if line looks like a heading (short, no punctuation, alphanumeric + basic chars)
const isLikelyHeading = (line) => {
  if (!line) return false;
  return line.length < 85
    && /^[A-Z0-9][A-Za-z0-9\s:()\-\/,&.]+$/.test(line)
    && !/[.?!]$/.test(line);
};

// Check if line starts with bullet or number (list item)
const isLikelyListItem = (line) => /^([\-\u2022*]|\d+[.)])\s+/.test(line);

// Split dense lines into multiple segments (bullets, arrows, numbered items)
const explodeDenseLine = (line) => {
  const normalized = String(line || "")
    .replace(/\s*([•·])\s*/g, "\n$1 ") // bullets to newlines
    .replace(/\s+(?=\d+[.)]\s+)/g, "\n") // numbered items: "1) text" -> newline
    .replace(/\s+(?=o\s+)/gi, "\n") // "o" items to newline
    // presentation-style arrow chains: A > B > C
    // Keep them separate to avoid run-on text.
    .replace(/\s*>\s*/g, "\n> ")
    .replace(/\n{2,}/g, "\n"); // collapse blank lines

  return normalized
    .split(/\n+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
};

// Group PDF items into lines based on Y position (same row = same line)
const groupItemsIntoLines = (items) => {
  // extract text and position data (x, y, height)
  const orderedItems = items
    .filter((item) => item && typeof item.str === "string" && item.str.trim())
    .map((item) => ({
      text: cleanInlineText(item.str),
      x: Number(item.transform?.[4]) || 0,
      y: Number(item.transform?.[5]) || 0,
      h: Number(item.height) || 0,
    }))
    .sort((a, b) => (b.y - a.y) || (a.x - b.x)); // top-to-bottom, left-to-right

  const lines = [];
  let currentLine = null;
  let yTolerance = 2.5;

  for (const item of orderedItems) {
    if (!currentLine) {
      currentLine = { y: item.y, h: item.h, parts: [item] };
      continue;
    }

    // items on same Y axis within tolerance = same line
    const sameLine = Math.abs(item.y - currentLine.y) <= yTolerance;
    if (sameLine) {
      currentLine.parts.push(item);
      currentLine.y = (currentLine.y + item.y) / 2;
      currentLine.h = Math.max(currentLine.h, item.h);
      continue;
    }

    // finalize current line: sort by X, join parts
    const sortedParts = currentLine.parts
      .sort((a, b) => a.x - b.x)
      .map((part) => part.text)
      .join(" ")
      .replace(/\s{2,}/g, " ")
      .trim();

    lines.push({
      text: sortedParts,
      y: currentLine.y,
      h: currentLine.h,
      x: currentLine.parts.reduce((min, part) => Math.min(min, part.x), Number.POSITIVE_INFINITY),
    });

    // dynamic tolerance based on font height
    yTolerance = Math.max(2.5, Math.min(6, (currentLine.h || item.h || 0) * 0.45 || 2.5));
    currentLine = { y: item.y, h: item.h, parts: [item] };
  }

  // handle last line
  if (currentLine) {
    const sortedParts = currentLine.parts
      .sort((a, b) => a.x - b.x)
      .map((part) => part.text)
      .join(" ")
      .replace(/\s{2,}/g, " ")
      .trim();

    lines.push({
      text: sortedParts,
      y: currentLine.y,
      h: currentLine.h,
      x: currentLine.parts.reduce((min, part) => Math.min(min, part.x), Number.POSITIVE_INFINITY),
    });
  }

  return lines.filter((line) => line?.text && !shouldDropLine(line.text));
};

// Build structured paragraphs from raw text (no layout info available)
const buildStructuredText = (rawText) => {
  // split by newlines, normalize, filter noise
  const cleanedLines = String(rawText || "")
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter((line) => !shouldDropLine(line));

  const paragraphs = [];
  let current = "";

  for (const line of cleanedLines) {
    // split line into segments (bullets, arrows, numbers)
    for (const segment of explodeDenseLine(line)) {
      // detect headings and list items -> new paragraph
      const isHeading = segment.length > 0
        && segment.length < 85
        && /^[A-Z0-9][A-Za-z0-9\s:()\-\/,&.]+$/.test(segment)
        && !/[.?!]$/.test(segment);

      const startsListItem = /^([\-\u2022*]|\d+[.)])\s+/.test(segment);

      if (isHeading || startsListItem) {
        if (current) {
          paragraphs.push(current.trim());
          current = "";
        }
        paragraphs.push(segment);
        continue;
      }

      if (!current) {
        current = segment;
        continue;
      }

      // end paragraph on punctuation or length limit
      const needsBreak = /[.?!]$/.test(current) || current.length > 900;
      if (needsBreak) {
        paragraphs.push(current.trim());
        current = segment;
      } else {
        current = `${current} ${segment}`;
      }
    }
  }

  if (current) paragraphs.push(current.trim());

  return paragraphs.join("\n\n").trim();
};

// Build structured text from PDF layout data (uses x, y, height positions)
const buildStructuredTextFromLayout = (lines) => {
  const paragraphs = [];
  let current = "";
  let previousLine = null;

  // Handle arrow chains like "Learning Objectives > Understand > Apply"
  const pushArrowChainAsBlocks = (maybeChain) => {
    const cleaned = String(maybeChain || "").trim();
    if (!cleaned) return false;

    if (!/learning objectives/i.test(cleaned)) return false;
    if (!/\s>\s*/.test(cleaned)) return false;

    const parts = cleaned
      .split(/\s*>\s*/g)
      .map((p) => p.trim())
      .filter(Boolean);

    if (!parts.length) return false;

    paragraphs.push(parts[0]);
    for (let i = 1; i < parts.length; i += 1) paragraphs.push(parts[i]);
    return true;
  };

  for (const rawLine of lines) {
    // clean and fix broken words
    const line = fixBrokenWords(cleanInlineText(rawLine.text));
    if (!line || shouldDropLine(line)) continue;

    // special handling for arrow chains
    if (pushArrowChainAsBlocks(line)) {
      previousLine = rawLine;
      current = "";
      continue;
    }

    // calculate gaps to detect paragraph boundaries
    const yGap = previousLine ? Math.abs(previousLine.y - rawLine.y) : 0;
    const indentShift = previousLine ? Math.abs((rawLine.x || 0) - (previousLine.x || 0)) : 0;
    const paragraphBreak = previousLine
      ? (yGap > Math.max(12, (previousLine.h || 0) * 1.65)) || indentShift > 22
      : false;

    for (const segment of explodeDenseLine(line)) {
      const lineBreak = /[.?!:]$/.test(current) || current.length > 900;
      const shouldStartNewBlock = isLikelyHeading(segment) || isLikelyListItem(segment);

      // arrow tokens start new blocks
      if (segment === '>' || segment.startsWith('>')) {
        if (current) {
          paragraphs.push(current.trim());
          current = "";
        }
        previousLine = rawLine;
        continue;
      }

      // headings and list items -> new paragraph
      if (shouldStartNewBlock || paragraphBreak) {
        if (current) {
          paragraphs.push(current.trim());
          current = "";
        }
        paragraphs.push(segment);
        previousLine = rawLine;
        continue;
      }

      if (!current) {
        current = segment;
      } else if (lineBreak) {
        paragraphs.push(current.trim());
        current = segment;
      } else if (/-$/.test(current)) {
        // hyphens at end: join words ("under-" + "stand" = "understand")
        current = `${current.slice(0, -1)}${segment}`;
      } else {
        current = `${current} ${segment}`;
      }

      previousLine = rawLine;
    }
  }

  if (current) paragraphs.push(current.trim());

  return paragraphs.join("\n\n").trim();
};

// Pick the first readable heading on a page.
const detectPageHeading = (pageText, fallbackHeading) => {
  const heading = String(pageText || "")
    .split(/\n+/)
    .map(normalizeLine)
    .find((line) => isLikelyHeading(line) && line.length >= 4);

  return heading || fallbackHeading;
};

// Split page text into RAG-ready section chunks.
const buildPageChunks = (pageText, pageNumber) => {
  const lines = String(pageText || "")
    .split(/\n+/)
    .map(normalizeLine)
    .filter(Boolean);

  const chunks = [];
  let heading = `Page ${pageNumber}`;
  let body = [];

  // Save current section before starting another one.
  const flush = () => {
    const text = body.join(" ").replace(/\s{2,}/g, " ").trim();
    if (text.length >= 40) chunks.push({ heading, text, page: pageNumber });
    body = [];
  };

  for (const line of lines) {
    if (isLikelyHeading(line)) {
      flush();
      heading = line;
      continue;
    }

    body.push(line);
  }

  flush();

  if (!chunks.length && lines.join(" ").trim()) {
    chunks.push({
      heading: detectPageHeading(pageText, `Page ${pageNumber}`),
      text: lines.join(" ").trim(),
      page: pageNumber,
    });
  }

  return chunks;
};

// Build one clean text stream for embeddings and quiz generation.
const buildRagText = (chunks) => chunks
  .map((chunk) => [
    `Heading: ${chunk.heading}`,
    `Page: ${chunk.page}`,
    chunk.text,
  ].join("\n"))
  .join("\n\n")
  .trim();

// Build page preview data for the student view.
const buildPdfPreview = ({ pages, fileName, fileUrl }) => ({
  type: "pdf",
  fileName: fileName || null,
  fileUrl: fileUrl || null,
  pageCount: pages.length,
  pages: pages.map((page) => ({
    page: page.page,
    heading: page.heading,
    text: page.text,
  })),
});

// Extract pages from PDF preserving layout positions.
const extractPdfPagesWithLayout = async (dataBuffer) => {
  // load PDF document (disable fonts for security/speed)
  const loadingTask = pdfjsLib.getDocument({
    data: dataBuffer,
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true,
  });

  const document = await loadingTask.promise;
  const pages = [];

  // process each page
  for (let pageIndex = 1; pageIndex <= document.numPages; pageIndex += 1) {
    const page = await document.getPage(pageIndex);
    // get text with positions (x, y, height)
    const textContent = await page.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false });
    const lines = groupItemsIntoLines(textContent.items || []);
    const pageText = buildStructuredTextFromLayout(lines);
    if (pageText) {
      pages.push({
        page: pageIndex,
        text: pageText,
        heading: detectPageHeading(pageText, `Page ${pageIndex}`),
      });
    }
  }

  return pages;
};

// Clean extracted PDF text (remove page breaks, footers, fix broken words)
const cleanExtractedText = (rawText) => {
  let cleaned = String(rawText || "");

  // normalize page break markers
  cleaned = cleaned.replace(/\s*---\s*PAGE\s+BREAK\s*---\s*/gi, "\n\n--- PAGE BREAK ---\n\n");
  // remove footers with school names and page numbers
  cleaned = cleaned.replace(/[^\n]*(?:Campus|CSDC|FH\s+Wien|Mobile\s+App|Development).*?\d+\s*$/gm, "");

  // remove standalone page numbers
  cleaned = cleaned.replace(/^\s*\d+\s*$/gm, "");
  // fix broken words and filter noise
  cleaned = cleaned
    .split(/\n/)
    .map((line) => fixBrokenWords(normalizeLine(line)))
    .filter((line) => line === "--- PAGE BREAK ---" || !shouldDropLine(line))
    .join("\n");

  // normalize whitespace, keep paragraph breaks
  cleaned = cleaned.replace(/[ \t\u00A0]{2,}/g, " ");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

  return cleaned.trim();
};

// Extract pages with a text-only fallback.
const extractPdfPages = async (dataBuffer) => {
  try {
    // Primary parser keeps page layout.
    return await extractPdfPagesWithLayout(dataBuffer);
  } catch (layoutError) {
    // Fallback parser keeps the pipeline alive.
    console.warn("PDF layout extraction failed, falling back to text-only parsing:", layoutError.message);
    const data = await pdf(dataBuffer);
    const pageTexts = String(data.text || "")
      .split(/\f|\n\s*---\s*PAGE\s+BREAK\s*---\s*\n/gi)
      .map(buildStructuredText)
      .filter(Boolean);

    return pageTexts.map((pageText, index) => ({
      page: index + 1,
      text: pageText,
      heading: detectPageHeading(pageText, `Page ${index + 1}`),
    }));
  }
};

// Main export: parse PDF into RAG text and preview data.
const parsePdfDocument = async (dataBuffer, options = {}) => {
  try {
    const rawPages = await extractPdfPages(dataBuffer);
    const pages = rawPages
      .map((page) => {
        const text = cleanExtractedText(page.text);
        return {
          page: page.page,
          heading: detectPageHeading(text, page.heading || `Page ${page.page}`),
          text,
        };
      })
      .filter((page) => page.text);

    const chunks = pages.flatMap((page) => buildPageChunks(page.text, page.page));
    const text = buildRagText(chunks) || cleanExtractedText(pages.map((page) => page.text).join("\n\n--- PAGE BREAK ---\n\n"));

    return {
      text,
      chunks,
      preview: buildPdfPreview({ pages, fileName: options.fileName, fileUrl: options.fileUrl }),
    };
  } catch (error) {
    console.error("PDF Parsing Error:", error.message);
    throw new Error("Could not read the PDF file.");
  }
};

// Compatibility export for older call sites.
const parsePdf = async (dataBuffer, options = {}) => {
  const parsed = await parsePdfDocument(dataBuffer, options);
  return parsed.text;
};

module.exports = { parsePdf, parsePdfDocument, cleanExtractedText };
