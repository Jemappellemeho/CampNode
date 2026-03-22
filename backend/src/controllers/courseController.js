const prisma = require("../utils/prisma");
const crypto = require("crypto"); // Eingebautes Node-Modul für zufällige Codes

// Neuen Kurs erstellen
exports.createCourse = async (req, res) => {
  try {
    const { title, description } = req.body;

    // Die Instructor-ID kommt aus dem JWT-Token, der von der authMiddleware
    // entschlüsselt wurde- so wissen wir sicher, wer die Anfrage stellt
    const instructorId = req.user.userId;

    if (req.user.role !== "PROFESSOR") {
      return res.status(403).json({ error: "Only professors can create courses." });
    }

    // Zufälligen 6-stelligen Beitrittscode generieren (z.B. "A3F9C1")
    const joinCode = crypto.randomBytes(3).toString("hex").toUpperCase();

    const course = await prisma.course.create({
      data: {
        title,
        description,
        joinCode,
        isPublic: true,
        instructorId,
      },
    });

    res.status(201).json({ message: "Course created successfully", course });
  } catch (error) {
    res.status(500).json({ error: "Error creating course" });
  }
};

// Alle Kurse abrufen
exports.getAllCourses = async (req, res) => {
  try {
    const courses = await prisma.course.findMany({
      // Wir holen uns auch direkt die Info zum Instructor (ohne sein Passwort)
      include: {
        instructor: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
      },
    });

    res.status(200).json(courses);
  } catch (error) {
    console.error("Fehler beim Abrufen der Kurse:", error);
    res.status(500).json({ error: "Fehler beim Abrufen der Kurse" });
  }
};

// Einem Kurs als Student beitreten
exports.joinCourse = async (req, res) => {
  try {
    const { joinCode } = req.body;
    const userId = req.user.userId; // Aus dem Token (Dank Middleware!)

    // 1. Suche den Kurs mit diesem Code (Groß-/Kleinschreibung ignorieren)
    const course = await prisma.course.findUnique({
      where: { joinCode: joinCode.toUpperCase() },
      // Wir laden direkt die Studenten mit, um zu prüfen, ob der User schon drin ist
      include: { students: true }
    });

    if (!course) {
      return res.status(404).json({ error: "Kurs mit diesem Code nicht gefunden." });
    }

    // 2. Prüfen, ob der Student schon eingeschrieben ist
    const isAlreadyEnrolled = course.students.some(student => student.id === userId);
    
    if (isAlreadyEnrolled) {
      return res.status(400).json({ error: "Du bist in diesen Kurs bereits eingeschrieben." });
    }

    // 3. Den Studenten zum Kurs hinzufügen (Die "viele-zu-viele" Verbindung speichern wir so in Prisma)
    await prisma.course.update({
      where: { id: course.id },
      data: {
        students: {
          connect: { id: userId }
        }
      }
    });

    res.status(200).json({ message: "Erfolgreich dem Kurs beigetreten!", courseId: course.id });
  } catch (error) {
    console.error("Fehler beim Beitreten des Kurses:", error);
    res.status(500).json({ error: "Ein Fehler ist aufgetreten." });
  }
};

// Einzelnen Kurs mit allen zugehörigen Daten abrufen
exports.getCourseById = async (req, res) => {
  try {
    const { id } = req.params; // Die ID kommt aus der URL, z.B. /api/courses/123
    const course = await prisma.course.findUnique({
      where: { id },
      include: {
        instructor: { select: { id: true, email: true, role: true } },
        topics: true, // Lädt direkt die Themen des Kurses mit (brauchen wir später)
        students: { select: { id: true, email: true } }
      }
    });

    if (!course) return res.status(404).json({ error: "Kurs nicht gefunden" });
    
    res.json(course);
  } catch (error) {
    res.status(500).json({ error: "Fehler beim Abrufen des Kurses" });
  }
};

// Kurstitel und Beschreibung aktualisieren (nur für Professoren)
exports.updateCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description } = req.body;

    // Nur Professoren dürfen das (später prüfen wir, ob es auch IHR Kurs ist)
    if (req.user.role !== "PROFESSOR") {
      return res.status(403).json({ error: "Nur Professoren dürfen Kurse bearbeiten" });
    }

    const updatedCourse = await prisma.course.update({
      where: { id },
      data: { title, description }
    });

    res.json({ message: "Kurs aktualisiert", course: updatedCourse });
  } catch (error) {
    res.status(500).json({ error: "Fehler beim Aktualisieren" });
  }
};

// Kurs löschen- Themen bleiben erhalten (Caching-Strategie)
exports.deleteCourse = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.role !== "PROFESSOR") {
      return res.status(403).json({ error: "Nur Professoren dürfen Kurse löschen" });
    }

    const course = await prisma.course.findUnique({ where: { id } });

    if (!course) {
      return res.status(404).json({ error: "Kurs nicht gefunden" });
    }

    // Sicherstellen, dass nur der eigene Kurs gelöscht werden kann
    if (course.instructorId !== req.user.userId) {
      return res.status(403).json({ error: "Das ist nicht dein Kurs" });
    }

    // Themen vom Kurs trennen, aber NICHT löschen —
    // so bleiben Quizfragen und Wikipedia-Inhalte für zukünftige Kurse erhalten    
    await prisma.topic.updateMany({
      where: { courseId: id },
      data: { courseId: null }
    });

    // Erst jetzt kann der Kurs selbst gelöscht werden
    await prisma.course.delete({ where: { id } });

    res.json({ message: "Kurs erfolgreich gelöscht" });
  } catch (error) {
    console.error("Fehler beim Löschen:", error.message);
    res.status(500).json({ error: "Fehler beim Löschen" });
  }
};

// Alle Kurse des eingeloggten Nutzers abrufen (als Dozent oder Student)
exports.getMyCourses = async (req, res) => {
  try {
    const userId = req.user.userId;

    const courses = await prisma.course.findMany({
      where: {
        OR: [
          // Kurse, die der Nutzer selbst erstellt hat (als Professor)
          { instructorId: userId },

          // Kurse, in denen der Nutzer eingeschrieben ist (als Student)
          {
            students: {
              some: {
                id: userId,
              },
            },
          },
        ],
      },
      // this block for counter of students and topics in course list
      include: {
        _count: {
          select: {
            students: true, 
            topics: true,  
          }
        }
      }
    });

    res.json(courses);
  } catch (err) {
    console.log(err);
    res.status(500).json({
      error: "getMyCourses failed",
    });
  }
};