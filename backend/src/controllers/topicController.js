const prisma = require("../utils/prisma");

// 1. Thema erstellen (Create)
exports.createTopic = async (req, res) => {
  try {
    const { name, description, courseId, wikidataId } = req.body;

    // 1) first check if course exists
    const course = await prisma.course.findUnique({
      where: { id: courseId }
    });

    if (!course) {
      return res.status(404).json({ error: "Kurs nicht gefunden" });
    }

    // 2) check permissions: 
    // entweder ist es der Professor, der diesen Kurs erstellt hat (instructorId),
    // oder es ist der User (instructorId == userId)
    const isOwner = course.instructorId === req.user.userId;
    const isProfessor = req.user.role === "PROFESSOR";

    if (!isOwner && !isProfessor) {
      return res.status(403).json({ error: "Du hast keine Berechtigung, Themen in diesem Kurs zu erstellen." });
    }

    const topic = await prisma.topic.create({
      data: {
        name,
        description,
        courseId
      }
    });

    res.status(201).json({ message: "Thema erfolgreich erstellt", topic });
  } catch (error) {
    res.status(500).json({ error: "Fehler beim Erstellen des Themas", details: error.message });
  }
};

// 2) Alle Themen eines bestimmten Kurses abrufen (Read)
exports.getTopicsByCourse = async (req, res) => {
  try {
    const { courseId } = req.params; // Die Kurs-ID kommt aus der URL

    const topics = await prisma.topic.findMany({
      where: { courseId }
    });

    res.json(topics);
  } catch (error) {
    res.status(500).json({ error: "Fehler beim Abrufen der Themen" });
  }
};

// 3) Thema bearbeiten (Update)
exports.updateTopic = async (req, res) => {
  try {
    const { id } = req.params; // Das ist die Topic-ID
    const { name, description } = req.body;

    if (req.user.role !== "PROFESSOR") return res.status(403).json({ error: "Zugriff verweigert" });

    const updatedTopic = await prisma.topic.update({
      where: { id },
      data: { name, description }
    });

    res.json({ message: "Thema aktualisiert", topic: updatedTopic });
  } catch (error) {
    res.status(500).json({ error: "Fehler beim Aktualisieren des Themas" });
  }
};

// 4) Thema löschen (Delete)
exports.deleteTopic = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.role !== "PROFESSOR") return res.status(403).json({ error: "Zugriff verweigert" });

    await prisma.topic.delete({ where: { id } });

    res.json({ message: "Thema erfolgreich gelöscht" });
  } catch (error) {
    res.status(500).json({ error: "Fehler beim Löschen des Themas" });
  }
};

const axios = require("axios");

exports.getTopicContent = async (req, res) => {
  try {
    const id = req.params.id;

    const topic = await prisma.topic.findUnique({ where: { id } });
    if (!topic) return res.status(404).json({ error: "Topic not found" });
    if (topic.content) return res.json({ content: topic.content });
    if (!topic.name) return res.status(400).json({ error: "Topic name missing" });

    // Запрос к Wikipedia напрямую
    const wikiUrl =
      "https://en.wikipedia.org/api/rest_v1/page/summary/" +
      encodeURIComponent(topic.name);

    let wikiRes;
    try {
      wikiRes = await axios.get(wikiUrl, {
        headers: { "User-Agent": "WissenGraph/1.0" },
      });
    } catch (err) {
      console.log("Wikipedia API error:", err.response?.data || err.message);
      return res.status(502).json({ error: "Failed to fetch article from Wikipedia" });
    }

    const text = wikiRes.data.extract || "";

    const updated = await prisma.topic.update({
      where: { id },
      data: { content: text, wikipediaTitle: wikiRes.data.title || topic.name },
    });

    res.json({ content: updated.content });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load topic content" });
  }
};