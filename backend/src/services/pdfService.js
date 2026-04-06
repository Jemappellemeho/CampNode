const pdf = require("pdf-parse");
const pdfjsLib = require("pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js");

const normalizeLine = (line) => line
  .replace(/[\t\u00A0]+/g, " ")
  .replace(/\s{2,}/g, " ")
  .trim();

const shouldDropLine = (line) => {
  if (!line) return true;
  if (/^\d+$/.test(line)) return true; // page numbers
  if (/^(page|seite)\s+\d+$/i.test(line)) return true;
  return false;
};

const cleanInlineText = (text) => String(text || "")
  .replace(/[\t\u00A0]+/g, " ")
  .replace(/\s{2,}/g, " ")
  .replace(/\s+([,.;:!?])/g, "$1")
  .trim();

const isLikelyHeading = (line) => {
  if (!line) return false;
  return line.length < 85
    && /^[A-Z0-9][A-Za-z0-9\s:()\-\/,&.]+$/.test(line)
    && !/[.?!]$/.test(line);
};

const isLikelyListItem = (line) => /^([\-\u2022*]|\d+[.)])\s+/.test(line);

const explodeDenseLine = (line) => {
  const normalized = String(line || "")
    .replace(/\s*([•·])\s*/g, "\n$1 ")
    .replace(/\s+(?=\d+[.)]\s+)/g, "\n")
    .replace(/\s+(?=o\s+)/gi, "\n")
    .replace(/\n{2,}/g, "\n");

  return normalized
    .split(/\n+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
};

const groupItemsIntoLines = (items) => {
  const orderedItems = items
    .filter((item) => item && typeof item.str === "string" && item.str.trim())
    .map((item) => ({
      text: cleanInlineText(item.str),
      x: Number(item.transform?.[4]) || 0,
      y: Number(item.transform?.[5]) || 0,
      h: Number(item.height) || 0,
    }))
    .sort((a, b) => (b.y - a.y) || (a.x - b.x));

  const lines = [];
  let currentLine = null;
  let yTolerance = 2.5;

  for (const item of orderedItems) {
    if (!currentLine) {
      currentLine = { y: item.y, h: item.h, parts: [item] };
      continue;
    }

    const sameLine = Math.abs(item.y - currentLine.y) <= yTolerance;
    if (sameLine) {
      currentLine.parts.push(item);
      currentLine.y = (currentLine.y + item.y) / 2;
      currentLine.h = Math.max(currentLine.h, item.h);
      continue;
    }

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

    yTolerance = Math.max(2.5, Math.min(6, (currentLine.h || item.h || 0) * 0.45 || 2.5));
    currentLine = { y: item.y, h: item.h, parts: [item] };
  }

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

// Convert noisy PDF lines into stable paragraph blocks for easier reading and AI processing.
const buildStructuredText = (rawText) => {
  const cleanedLines = String(rawText || "")
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter((line) => !shouldDropLine(line));

  const paragraphs = [];
  let current = "";

  for (const line of cleanedLines) {
    for (const segment of explodeDenseLine(line)) {
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

const buildStructuredTextFromLayout = (lines) => {
  const paragraphs = [];
  let current = "";
  let previousLine = null;

  for (const rawLine of lines) {
    const line = cleanInlineText(rawLine.text);
    if (!line || shouldDropLine(line)) continue;

    const yGap = previousLine ? Math.abs(previousLine.y - rawLine.y) : 0;
    const indentShift = previousLine ? Math.abs((rawLine.x || 0) - (previousLine.x || 0)) : 0;
    const paragraphBreak = previousLine
      ? (yGap > Math.max(12, (previousLine.h || 0) * 1.65)) || indentShift > 22
      : false;

    for (const segment of explodeDenseLine(line)) {
      const lineBreak = /[.?!:]$/.test(current) || current.length > 900;
      const shouldStartNewBlock = isLikelyHeading(segment) || isLikelyListItem(segment);

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

const extractPdfTextWithLayout = async (dataBuffer) => {
  const loadingTask = pdfjsLib.getDocument({
    data: dataBuffer,
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true,
  });

  const document = await loadingTask.promise;
  const pages = [];

  for (let pageIndex = 1; pageIndex <= document.numPages; pageIndex += 1) {
    const page = await document.getPage(pageIndex);
    const textContent = await page.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false });
    const lines = groupItemsIntoLines(textContent.items || []);
    const pageText = buildStructuredTextFromLayout(lines);
    if (pageText) pages.push(pageText);
  }

  return pages.join("\n\n--- PAGE BREAK ---\n\n").trim();
};

/**
 * Extracts text content from a given PDF file buffer.
 * @param {Buffer} dataBuffer - The raw PDF data buffer
 * @returns {Promise<string>} - Clean, structured extracted text
 */
const parsePdf = async (dataBuffer) => {
  try {
    // Prefer layout-aware extraction to preserve paragraph and list structure.
    try {
      return await extractPdfTextWithLayout(dataBuffer);
    } catch (layoutError) {
      console.warn("PDF layout extraction failed, falling back to text-only parsing:", layoutError.message);
    }

    // Fallback path when layout reconstruction is not available.
    const data = await pdf(dataBuffer);
    return buildStructuredText(data.text);
  } catch (error) {
    console.error("PDF Parsing Error:", error.message);
    throw new Error("Could not read the PDF file.");
  }
};

module.exports = { parsePdf };
