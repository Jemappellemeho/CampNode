const pdf = require("pdf-parse");

/**
 * Extracts text content from a given PDF file buffer.
 * @param {Buffer} dataBuffer - The raw PDF data buffer
 * @returns {Promise<string>} - The extracted text
 */
const parsePdf = async (dataBuffer) => {
  try {
    // Read the file using pdf-parse
    const data = await pdf(dataBuffer);
    
    // Return the text and clean up excessive whitespace
    return data.text.replace(/\s+/g, ' ').trim();
  } catch (error) {
    console.error("PDF Parsing Error:", error.message);
    throw new Error("Could not read the PDF file.");
  }
};

module.exports = { parsePdf };
