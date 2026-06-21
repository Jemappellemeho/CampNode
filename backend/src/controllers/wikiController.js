const axios = require("axios");

// Wikipedia maintenance/administrative category fragments. Concepts that merely share these
// (e.g. "Articles with example code", "Webarchive ...", "Use dmy dates") are NOT topically
// related, so they are excluded from related-concept suggestions to keep them on-topic.
const MAINTENANCE_CATEGORY_MARKERS = [
  "Articles_", "Wikipedia", "Pages_", "CS1_", "Webarchive", "Use_",
  "Short_description", "All_", "_stubs", "Commons_", "Wikidata",
];

async function fetchWikidataEntity(id) {
  const entityUrl = `https://www.wikidata.org/wiki/Special:EntityData/${id}.json`;
  const entityRes = await axios.get(entityUrl, {
    headers: { "User-Agent": "WissenGraph/1.0" },
    timeout: 8000,
  });
  return entityRes.data.entities[id];
}

function getWikiTitle(entity, lang) {
  return entity?.sitelinks?.[`${lang}wiki`]?.title || null;
}

function normalizeWikiLabel(title) {
  return String(title || "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchWikipediaLinkSuggestions(wikiTitle, lang) {
  const wikiUrl =
    `https://${lang}.wikipedia.org/w/api.php` +
    `?action=query` +
    `&format=json` +
    `&prop=links` +
    `&titles=${encodeURIComponent(wikiTitle)}` +
    `&plnamespace=0` +
    `&pllimit=max` +
    `&origin=*`;

  const wikiRes = await axios.get(wikiUrl, {
    headers: { "User-Agent": "WissenGraph/1.0" },
    timeout: 8000,
  });

  const pages = wikiRes.data?.query?.pages || {};
  const pageId = Object.keys(pages)[0];
  const links = pages[pageId]?.links || [];
  const seen = new Set();

  return links
    .map((link) => normalizeWikiLabel(link.title))
    .filter((label) => {
      if (!label || label.toLowerCase() === normalizeWikiLabel(wikiTitle).toLowerCase()) return false;
      if (label.length < 3 || label.length > 80) return false;
      if (seen.has(label.toLowerCase())) return false;
      seen.add(label.toLowerCase());
      return true;
    })
    .slice(0, 10)
    .map((label) => ({
      label,
      uri: `wikipedia:${lang}:${label.replace(/\s+/g, "_")}`,
      dbPediaName: label.replace(/\s+/g, "_"),
    }));
}

// Search Wikidata entities by keyword
// Returns a short list of matches with id, label, and description
exports.search = async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.json([]);

    // wbsearchentities returns Wikidata items matching the search string
    // limit=5 keeps the dropdown short and responsive
    const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&limit=5&search=${encodeURIComponent(q)}`;
    const response = await axios.get(url, {
      headers: { "User-Agent": "WissenGraph/1.0 (student project)" },
    });
    
    // Only return the fields the frontend needs — id is the Q-number (e.g. "Q8777")
    const results = response.data.search.map((item) => ({
      id: item.id,
      label: item.label,
      description: item.description,
    }));
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: "Wikidata search failed" });
  }
};

// Fetch a Wikipedia article by Wikidata Q-number
// Flow: Wikidata entity -> sitelinks -> Wikipedia mobile HTML -> sanitized HTML
exports.article = async (req, res) => {
  try {
    const id = req.params.id;
    const lang = req.query.lang || 'en';

    // Step 1: Resolve the Wikipedia page title from Wikidata
    // Wikidata stores sitelinks like { "enwiki": { title: "HTTP" }, "dewiki": { title: "HTTP" } }
    const entity = await fetchWikidataEntity(id);
    const wikiTitle = getWikiTitle(entity, lang);

    if (!wikiTitle) {
      return res.json({ content: "No Wikipedia page found." });
    }

    // Step 2: Fetch full article HTML via the MediaWiki parse API
    // prop=text gives the full HTML; prop=displaytitle gives the formatted title.
    const parseUrl =
      `https://${lang}.wikipedia.org/w/api.php` +
      `?action=parse` +
      `&format=json` +
      `&page=${encodeURIComponent(wikiTitle)}` +
      `&prop=text|displaytitle` +
      `&disablelimitreport=1` +
      `&disableeditsection=1` +  // removes [edit] buttons
      `&origin=*`;
 
    const parseRes = await axios.get(parseUrl, {
      headers: { "User-Agent": "WissenGraph/1.0" },
    });
 
    if (parseRes.data.error) {
      return res.status(404).json({ error: parseRes.data.error.info });
    }
 
    let html = parseRes.data.parse.text["*"];
    const displayTitle = parseRes.data.parse.displaytitle;

    // Step 3: normalize relative URLs so images and links always render correctly.
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

    // Internal links should open a new tab.
    html = html.replace(/<a\b(?![^>]*\btarget=)/g, '<a target="_blank" rel="noopener noreferrer"');
 
    // Step 4: strip elements that break our UI
    // Remove inline <style> blocks injected by the parser
    html = html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");
 
    res.json({
      title: displayTitle,
      content: html.trim(),
    });
  } catch (err) {
    console.error("WIKI ERROR:", err.message);
    res.status(500).json({ error: "Failed to fetch article" });
  }
};

// Resolve Wikipedia article titles (for one wiki site, e.g. "enwiki") to Wikidata Q-numbers
// in a single batched API call. Lets accepted suggestions reuse the normal Wikidata content
// pipeline (so the new subtopic gets real article text instead of being empty).
// Returns Map<lowercasedTitle, "Qxxx">.
async function resolveWikidataIds(titles, site) {
  const unique = [...new Set((titles || []).filter(Boolean))].slice(0, 50);
  if (!unique.length) return new Map();
  try {
    // NB: no `normalize=1` — the Wikidata API rejects it when more than one title is given.
    // Our titles are already canonical article titles, and matching is case-insensitive below.
    const url =
      `https://www.wikidata.org/w/api.php?action=wbgetentities` +
      `&sites=${site}&sitefilter=${site}&props=sitelinks&format=json` +
      `&titles=${encodeURIComponent(unique.join("|"))}`;
    const res = await axios.get(url, { headers: { "User-Agent": "WissenGraph/1.0" }, timeout: 8000 });
    const entities = res.data?.entities || {};
    const map = new Map();
    for (const [qid, entity] of Object.entries(entities)) {
      if (!/^Q\d+$/.test(qid)) continue; // skip "-1" entries for missing titles
      const title = entity?.sitelinks?.[site]?.title;
      if (title) map.set(title.toLowerCase(), qid);
    }
    return map;
  } catch (e) {
    console.warn("wbgetentities resolve failed:", e.message);
    return new Map();
  }
}

// Fetch DBpedia subtopic suggestions using the Wikidata Q-number
exports.suggestions = async (req, res) => {
  try {
    const id = req.params.id;
    const lang = req.query.lang || 'en';

    // Resolve the source article title once so we can try multiple suggestion strategies.
    const entity = await fetchWikidataEntity(id);
    const wikiTitle = getWikiTitle(entity, lang);

    if (!wikiTitle) return res.json([]);

    try {
      // Primary source: concepts that are BOTH linked from the source article AND share real
      // (non-maintenance) categories with it, ranked by how many categories they share.
      // This keeps suggestions on-topic (e.g. JavaScript -> TypeScript/ECMAScript, not random pages).
      const dbpediaResource = `http://dbpedia.org/resource/${wikiTitle.replace(/ /g, '_')}`;
      const categoryFilters = MAINTENANCE_CATEGORY_MARKERS
        .map((marker) => `FILTER (!CONTAINS(STR(?category), "${marker}"))`)
        .join("\n          ");
      const sparqlQuery = `
        SELECT ?concept ?label (COUNT(?category) AS ?shared) WHERE {
          <${dbpediaResource}> <http://dbpedia.org/ontology/wikiPageWikiLink> ?concept .
          <${dbpediaResource}> <http://purl.org/dc/terms/subject> ?category .
          ?concept <http://purl.org/dc/terms/subject> ?category .
          ?concept <http://www.w3.org/2000/01/rdf-schema#label> ?label .
          FILTER (lang(?label) = '${lang}')
          FILTER (?concept != <${dbpediaResource}>)
          ${categoryFilters}
        }
        GROUP BY ?concept ?label
        ORDER BY DESC(?shared)
        LIMIT 10
      `;

      const sparqlUrl = `https://dbpedia.org/sparql?query=${encodeURIComponent(sparqlQuery)}&format=application%2Fsparql-results%2Bjson`;
      const sparqlRes = await axios.get(sparqlUrl, { timeout: 10000 });

      const suggestions = (sparqlRes.data?.results?.bindings || []).map((b) => ({
        label: b.label.value,
        uri: b.concept.value,
        dbPediaName: b.concept.value.split('/').pop()
      }));

      if (suggestions.length > 0) {
        // DBpedia resources map to English Wikipedia titles → resolve to Wikidata ids so the
        // professor's accepted suggestion can pull the real article text as content.
        const idMap = await resolveWikidataIds(
          suggestions.map((s) => s.dbPediaName.replace(/_/g, ' ')),
          'enwiki'
        );
        const enriched = suggestions.map((s) => ({
          ...s,
          wikidataId: idMap.get(s.dbPediaName.replace(/_/g, ' ').toLowerCase()) || null,
        }));
        return res.json(enriched);
      }
    } catch (dbpediaError) {
      console.warn("DBPEDIA FALLBACK:", dbpediaError.message);
    }

    // Fallback source: relevant links from the article itself.
    const fallbackSuggestions = await fetchWikipediaLinkSuggestions(wikiTitle, lang);
    const fallbackIdMap = await resolveWikidataIds(
      fallbackSuggestions.map((s) => s.label),
      `${lang}wiki`
    );
    const enrichedFallback = fallbackSuggestions.map((s) => ({
      ...s,
      wikidataId: fallbackIdMap.get(String(s.label).toLowerCase()) || null,
    }));
    return res.json(enrichedFallback);
  } catch (err) {
    console.error("DBPEDIA ERROR:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to fetch DBpedia suggestions" });
  }
};
