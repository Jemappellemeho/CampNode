// Web source extraction service.
// Keeps only readable article text for RAG/quiz generation.
const axios = require("axios");
const cheerio = require("cheerio");

// Reader fallback helps when normal HTML scraping is blocked.
const READER_FALLBACK_ENABLED = process.env.SCRAPER_READER_FALLBACK !== "false";

// Ensure URL has protocol (add https:// if missing)
const normalizeUrl = (url) => {
  const value = String(url || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
};

// Normalize whitespace and line endings in extracted text
const normalizeExtractedText = (text) => String(text || "")
  .replace(/\r\n?/g, "\n") // Windows -> Unix line endings
  .replace(/[\t\u00A0]+/g, " ") // non-breaking spaces
  .replace(/[ ]{2,}/g, " ") // collapse double spaces
  .replace(/\n[ \t]+/g, "\n") // spaces after newlines
  .replace(/[ \t]+\n/g, "\n") // spaces before newlines
  .replace(/\n{3,}/g, "\n\n") // collapse blank lines
  .trim();

// Remove reader-service metadata before sending text to RAG/quiz generation.
const cleanReaderText = (text) => normalizeExtractedText(text)
  .replace(/^Title:\s*/gim, "")
  .replace(/^URL Source:\s*https?:\/\/\S+\s*/gim, "")
  .replace(/^Markdown Content:\s*/gim, "")
  .trim();

// Fallback for pages that block simple HTML scraping or require browser/OAuth redirects.
const fetchReaderText = async (targetUrl) => {
  const readerUrl = `https://r.jina.ai/http://${targetUrl}`;
  const { data } = await axios.get(readerUrl, {
    timeout: 30000,
    responseType: "text",
    headers: {
      "Accept": "text/plain,text/markdown,*/*;q=0.8",
      "User-Agent": "CampNode/1.0",
    },
  });

  const text = cleanReaderText(data);
  if (text.length < 300 || /^error\b/i.test(text)) {
    throw new Error("Reader fallback did not expose enough readable text.");
  }

  return text;
};

// Extract text from block elements (add newlines around content)
const extractBlockText = ($, root) => {
  // select heading, paragraph, list, code, table elements
  root.find("h1, h2, h3, h4, p, li, pre, code, blockquote, table").each((_, el) => {
    const current = $(el).text();
    $(el).text(`\n${current}\n`);
  });

  return normalizeExtractedText(root.text());
};

/**
 * Visits a web page, parses its HTML, and extracts only the main text content.
 * @param {string} url - The address of the web page (e.g., Wikipedia or documentation)
 * @returns {Promise<string>} - The parsed, cleaned text content
 */
const scrapeUrl = async (url) => {
  const targetUrl = normalizeUrl(url);
  try {
    if (!targetUrl) throw new Error("Missing URL.");

    // 1. Fetch the raw HTML of the webpage
    // We use a modern User-Agent to prevent immediate blocks from some websites
    const { data, headers } = await axios.get(targetUrl, {
      timeout: 20000,
      responseType: "text",
      maxRedirects: 5,
      headers: {
        "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
      }
    });

    const contentType = String(headers?.["content-type"] || "").toLowerCase();
    if (contentType.includes("text/plain")) {
      const plainText = normalizeExtractedText(data);
      if (plainText.length >= 80) return plainText;
    }

    // 2. Load the HTML into Cheerio (similar to jQuery for Node.js)
    const $ = cheerio.load(data);

    // 3. Remove "noise": Delete scripts, styles, nav bars, footers, headers, and asides
    // This allows us to isolate the actual content
    $("script, style, nav, footer, header, aside, form, button, iframe, noscript").remove();
    $("[class*='breadcrumb'], [class*='sidebar'], [class*='menu'], [class*='nav'], [class*='toc'], [class*='comment'], [class*='ad'], [id*='sidebar'], [id*='menu'], [id*='nav'], [id*='toc'], [id*='comment'], [id*='ad']").remove();

    // 4. Prefer article/main content and keep block boundaries so the quiz generator
    // does not receive one dense navigation/content string.
    const root = $("article").first().length
      ? $("article").first()
      : $("main").first().length
        ? $("main").first()
        : $("#main, [role='main']").first().length
          ? $("#main, [role='main']").first()
          : $("body");

    let text = extractBlockText($, root);
    if (text.length < 300 && root.get(0) !== $("body").get(0)) {
      text = extractBlockText($, $("body"));
    }

    if (text.length < 80) {
      throw new Error("The webpage did not expose enough readable text for quiz generation.");
    }

    return text;
  } catch (error) {
    const statusCode = error.response?.status;
    console.error("Scraper Error:", statusCode ? `HTTP ${statusCode}` : error.message);

    if (targetUrl && READER_FALLBACK_ENABLED) {
      try {
        console.log("[Scraper] Trying reader fallback for:", targetUrl);
        return await fetchReaderText(targetUrl);
      } catch (readerError) {
        console.error("[Scraper] Reader fallback failed:", readerError.message);
      }
    }

    const wrappedError = new Error("Could not read the webpage content.");
    wrappedError.statusCode = statusCode;
    throw wrappedError;
  }
};

// Soft scraper for create/update flows.
// A blocked website should not prevent the topic from being saved.
const tryScrapeUrl = async (url) => {
  try {
    return await scrapeUrl(url);
  } catch (error) {
    console.warn(`[Scraper] Skipping unreadable source: ${error.message}`);
    return "";
  }
};

module.exports = { scrapeUrl, tryScrapeUrl };
