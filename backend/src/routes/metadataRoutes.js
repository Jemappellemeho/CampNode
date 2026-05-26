const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");

// Nur http/https erlaubt — verhindert SSRF auf interne Docker-Services (redis://, file://, etc.)
const ALLOWED_PROTOCOLS = ["http:", "https:"];

router.get("/", verifyToken, async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "URL is required" });

  // URL-Validierung: nur echte externe HTTP(S)-URLs erlauben
  try {
    const parsed = new URL(url);
    if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
      return res.status(400).json({ error: "Only http and https URLs are allowed" });
    }
    // Interne IP-Ranges und Docker-Service-Namen blockieren
    const hostname = parsed.hostname;
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      hostname.startsWith("172.") ||
      hostname === "postgres" ||
      hostname === "redis" ||
      hostname === "backend" ||
      hostname === "ai-service" ||
      hostname === "caddy" ||
      hostname === "169.254.169.254" // AWS/GCP Metadata-Service
    ) {
      return res.status(400).json({ error: "URL not allowed" });
    }
  } catch {
    return res.status(400).json({ error: "Invalid URL" });
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    const html = await response.text();
    
    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    let title = titleMatch ? titleMatch[1] : "";

    // If no title tag found, try to extract from other meta tags like og:title
    if (!title) {
        const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
        if (ogTitleMatch) title = ogTitleMatch[1];
    }

    if (!title) title = url;

    // Decode HTML entities (basic)
    title = title.replace(/&quot;/g, '"')
                 .replace(/&#39;/g, "'")
                 .replace(/&amp;/g, "&")
                 .replace(/&lt;/g, "<")
                 .replace(/&gt;/g, ">")
                 .replace(/&#x27;/g, "'");

    // Extract website name
    let website = "";
    try {
      const urlObj = new URL(url);
      website = urlObj.hostname.replace('www.', '');
      if (website.includes('youtube.com') || website.includes('youtu.be')) website = 'YouTube';
      if (website.includes('wikipedia.org')) website = 'Wikipedia';
      if (website.includes('artforum.com')) website = 'Artforum';
      if (website.includes('stylezeitgeist.com')) website = 'StyleZeitgeist';
      if (website.includes('archedu.org')) website = 'Archedu';
    } catch(e) {}

    // Clean up title (remove trailing site names)
    if (website && title.includes(` - ${website}`)) {
      title = title.split(` - ${website}`)[0];
    }

    res.json({ title: title.trim(), website });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch metadata" });
  }
});

module.exports = router;
