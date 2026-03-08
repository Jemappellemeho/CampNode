const prisma = require("../utils/prisma");
const crypto = require("crypto"); // Eingebautes Node-Modul für zufällige Codes

// Neuen Kurs erstellen
exports.createCourse = async (req, res) => {
  try {
    const { title, description } = req.body;

    // Sicherheitsprüfung (Das machen wir später noch sauberer über die Middleware)
    if (req.user.role !== "PROFESSOR") {
      return res.status(403).json({ error: "Nur Professoren dürfen Kurse erstellen." });
    }

    // Einen einzigartigen, 6-stelligen Eintrittscode generieren
    const joinCode = crypto.randomBytes(3).toString("hex").toUpperCase();

    // Kurs in der Datenbank speichern
    const course = await prisma.course.create({
      data: {
        title,
        description,
        joinCode,
        instructorId: req.user.userId, // Das kommt direkt aus unserem JWT!
      },
    });

    res.status(201).json({ message: "Kurs erfolgreich erstellt", course });
  } catch (error) {
    console.error("Fehler beim Erstellen des Kurses:", error);
    res.status(500).json({ error: "Fehler beim Erstellen des Kurses", details: error.message });
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

    // 1. Suche den Kurs mit diesem Code
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

// Einzelnen Kurs abrufen (R = Read)
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

// Kurs aktualisieren (U = Update)
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

// Kurs löschen (D = Delete)
exports.deleteCourse = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.role !== "PROFESSOR") {
      return res.status(403).json({ error: "Nur Professoren dürfen Kurse löschen" });
    }

    await prisma.course.delete({ where: { id } });

    res.json({ message: "Kurs erfolgreich gelöscht" });
  } catch (error) {
    res.status(500).json({ error: "Fehler beim Löschen" });
  }
};
