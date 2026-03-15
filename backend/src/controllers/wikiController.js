const axios = require("axios");

exports.search = async (req, res) => {
  try {
    const q = req.query.q;

    if (!q) return res.json([]);

    const url =
      "https://www.wikidata.org/w/api.php" +
      "?action=wbsearchentities" +
      "&format=json" +
      "&language=en" +
      "&limit=5" +
      "&search=" +
      encodeURIComponent(q);

    const response = await axios.get(url, {
      headers: {
        "User-Agent": "WissenGraph/1.0 (student project)",
      },
    });

    const results = response.data.search.map((item) => ({
      id: item.id,
      label: item.label,
      description: item.description,
    }));

    res.json(results);

  } catch (err) {
    console.log("WIKIDATA ERROR");
    console.log(err.response?.data || err.message);

    res.status(500).json({
      error: "Wikidata search failed",
    });
  }
};

exports.article = async (req, res) => {
  try {
    const id = req.params.id;

    // 1. get wikidata entity

    const entityUrl =
      `https://www.wikidata.org/wiki/Special:EntityData/${id}.json`;

    const entityRes = await axios.get(entityUrl, {
      headers: {
        "User-Agent": "WissenGraph/1.0",
      },
    });

    const entity =
      entityRes.data.entities[id];

    const title =
      entity.sitelinks?.enwiki?.title;

    if (!title) {
      return res.json({
        error: "No wikipedia page",
      });
    }

    // 2. get wikipedia summary

    const wikiUrl =
      "https://en.wikipedia.org/api/rest_v1/page/summary/" +
      encodeURIComponent(title);

    const wikiRes = await axios.get(wikiUrl, {
      headers: {
        "User-Agent": "WissenGraph/1.0",
      },
    });

    res.json({
      title: wikiRes.data.title,
      extract: wikiRes.data.extract,
      url: wikiRes.data.content_urls.desktop.page,
    });

  } catch (err) {
    console.log(err.response?.data || err.message);

    res.status(500).json({
      error: "Article failed",
    });
  }
};