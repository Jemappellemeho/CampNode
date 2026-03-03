const bcrypt = require("bcryptjs");
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
