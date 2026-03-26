const axios = require("axios");
const cheerio = require("cheerio");

/**
 * Visits a web page, parses its HTML, and extracts only the main text content.
 * @param {string} url - The address of the web page (e.g., Wikipedia or documentation)
 * @returns {Promise<string>} - The parsed, cleaned text content
 */
const scrapeUrl = async (url) => {
  try {
    // 1. Fetch the raw HTML of the webpage
    // We use a modern User-Agent to prevent immediate blocks from some websites
    const { data } = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
      }
    });

    // 2. Load the HTML into Cheerio (similar to jQuery for Node.js)
    const $ = cheerio.load(data);

    // 3. Remove "noise": Delete scripts, styles, nav bars, footers, headers, and asides
    // This allows us to isolate the actual content
    $("script, style, nav, footer, header, aside").remove();

    // 4. Extract only the text from the <body> element
    // Reduce duplicate whitespace into standard spacing for cleaner LLM injection
    const text = $("body").text().replace(/\s\s+/g, ' ').trim();

    return text;
  } catch (error) {
    console.error("Scraper Error:", error.message);
    throw new Error("Could not read the webpage content.");
  }
};

module.exports = { scrapeUrl };
