const pdf = require("pdf-parse");

/**
 * Diese Funktion nimmt eine PDF-Datei (als Buffer) und extrahiert den Text.
 * @param {Buffer} dataBuffer - Die rohen Daten der PDF-Datei
 * @returns {Promise<string>} - Der extrahierte Text
 */
const parsePdf = async (dataBuffer) => {
  try {
    // pdf-parse liest die Datei aus
    const data = await pdf(dataBuffer);
    
    // Wir geben den Text zurück und bereinigen ihn von zu vielen Leerzeichen
    return data.text.replace(/\s+/g, ' ').trim();
  } catch (error) {
    console.error("PDF Parsing Fehler:", error.message);
    throw new Error("Konnte die PDF-Datei nicht lesen.");
  }
};

module.exports = { parsePdf };
