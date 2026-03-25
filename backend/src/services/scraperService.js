const axios = require("axios");
const cheerio = require("cheerio");

/**
 * Diese Funktion besucht eine Webseite, "liest" sie und gibt nur den Text zurück.
 * @param {string} url - Die Adresse der Webseite (z.B. von Wikipedia oder einer Doku)
 * @returns {Promise<string>} - Der gefundene, bereinigte Text-Inhalt
 */
const scrapeUrl = async (url) => {
  try {
    // 1. Die Webseite als HTML abrufen
    // Wir nutzen einen User-Agent, damit manche Seiten uns nicht direkt blockieren
    const { data } = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
      }
    });

    // 2. Das HTML in Cheerio laden (fühlt sich an wie jQuery im Browser)
    const $ = cheerio.load(data);

    // 3. "Lärm" entfernen: Wir löschen Skripte, Styles, Menüs und Fußzeilen
    // So behalten wir nur den eigentlichen Wissens-Inhalt
    $("script, style, nav, footer, header, aside").remove();

    // 4. Nur den Text aus dem <body> extrahieren
    // Wir ersetzen mehrfache Leerzeichen durch ein einfaches, damit der Text kompakt ist
    const text = $("body").text().replace(/\\s\\s+/g, ' ').trim();

    return text;
  } catch (error) {
    console.error("Scraper Fehler:", error.message);
    throw new Error("Konnte die Webseite nicht auslesen.");
  }
};

module.exports = { scrapeUrl };
