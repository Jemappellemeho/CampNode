const axios = require("axios");

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
    const entityUrl = `https://www.wikidata.org/wiki/Special:EntityData/${id}.json`;
    const entityRes = await axios.get(entityUrl, { headers: { "User-Agent": "WissenGraph/1.0" } });
    
    const entity = entityRes.data.entities[id];
    const wikiTitle = entity.sitelinks?.[`${lang}wiki`]?.title;

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

// Fetch DBpedia subtopic suggestions using the Wikidata Q-number
exports.suggestions = async (req, res) => {
  try {
    const id = req.params.id;
    const lang = req.query.lang || 'en';

    // 1. Get the Wikipedia title from Wikidata (needed for the DBpedia resource path)
    const entityUrl = `https://www.wikidata.org/wiki/Special:EntityData/${id}.json`;
    const entityRes = await axios.get(entityUrl, { headers: { "User-Agent": "WissenGraph/1.0" } });
    const entity = entityRes.data.entities[id];
    const wikiTitle = entity.sitelinks?.[`${lang}wiki`]?.title;

    if (!wikiTitle) return res.json([]);

    // 2. DBpedia SPARQL Query
    // We search for resources that share the same categories (dct:subject)
    const dbpediaResource = `http://dbpedia.org/resource/${wikiTitle.replace(/ /g, '_')}`;
    const sparqlQuery = `
      SELECT DISTINCT ?concept ?label WHERE {
        <${dbpediaResource}> <http://purl.org/dc/terms/subject> ?category .
        ?concept <http://purl.org/dc/terms/subject> ?category .
        ?concept <http://www.w3.org/2000/01/rdf-schema#label> ?label .
        FILTER (lang(?label) = '${lang}')
        FILTER (?concept != <${dbpediaResource}>)
      } LIMIT 10
    `;

    const sparqlUrl = `https://dbpedia.org/sparql?query=${encodeURIComponent(sparqlQuery)}&format=application%2Fsparql-results%2Bjson`;
    const sparqlRes = await axios.get(sparqlUrl);

    const suggestions = sparqlRes.data.results.bindings.map(b => ({
      label: b.label.value,
      uri: b.concept.value,
      dbPediaName: b.concept.value.split('/').pop()
    }));

    res.json(suggestions);
  } catch (err) {
    console.error("DBPEDIA ERROR:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to fetch DBpedia suggestions" });
  }
};
