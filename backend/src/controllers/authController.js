const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../utils/prisma");


// Registrierungs-Logik
exports.register = async (req, res) => {
  try {
    const { email, password, role } = req.body;

    // 1. Prüfen, ob der User schon existiert
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: "Email bereits vergeben" });
    }

    // 2. Passwort verschlüsseln (Hashing)
    const hashedPassword = await bcrypt.hash(password, 10);

    // 3. User in der Datenbank speichern
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        role: role || "STUDENT",
      },
    });

    res.status(201).json({ message: "User erfolgreich erstellt", userId: user.id });
  } catch (error) {
    console.error("Registrierungs-Fehler:", error);
    res.status(500).json({ error: "Fehler beim Registrieren", details: error.message, stack: error.stack });
  }
};

// Login-Logik
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. User suchen
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: "Ungültige Anmeldedaten" });
    }
    // 2. Passwort vergleichen
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Ungültige Anmeldedaten" });
    }

    // 3. JWT erstellen ("Ausweis")
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || "supersecret", 
      { expiresIn: "7d" }
    );
    res.json({
      message: "Login erfolgreich",
      token,
      user: { id: user.id, email: user.email, role: user.role }
    });
  } catch (error) {
    res.status(500).json({ error: "Fehler beim Login", details: error.message });
  }
};