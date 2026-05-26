const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../utils/prisma");

// Hilfsfunktionen für Token-Generierung
// Ausgelagert damit Register und Login dasselbe System nutzen
function generateAccessToken(userId, role) {
  // Access Token: Läuft nach 15 Minuten ab.
  // Wird im Frontend-Memory gespeichert (nicht localStorage!).
  return jwt.sign(
    { userId, role, type: "access" },
    process.env.JWT_SECRET, // KEIN Fallback! Wenn JWT_SECRET fehlt, soll es crashen, nicht "supersecret" nutzen
    { expiresIn: "15m" }
  );
}

function generateRefreshToken(userId, role) {
  // Refresh Token: Läuft nach 7 Tagen ab.
  // Wird als httpOnly Cookie gesetzt (JavaScript kann NICHT darauf zugreifen).
  // role wird mitgespeichert, damit generateAccessToken sie beim Refresh kennt.
  return jwt.sign(
    { userId, role, type: "refresh" },
    process.env.JWT_REFRESH_SECRET, // ANDERER Secret als Access Token!
    { expiresIn: "7d" }
  );
}

// User Registration Logic
exports.register = async (req, res) => {
  try {
    const { email, password, role } = req.body;

    // Basis-Validierung
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // 1. Check if the user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: "Email already taken" });
    }

    // 2. Hash the password
    // 12 statt 10 Rounds: etwas langsamer für den User (~0.3s), aber deutlich sicherer
    const hashedPassword = await bcrypt.hash(password, 12);

    // 3. Save the new user to the database
    // SICHERHEIT: role aus dem Request-Body wird IGNORIERT — jeder wäre sonst Professor!
    // Neue Accounts bekommen immer STUDENT. Rollen-Änderung nur durch Admin direkt in DB.
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        role: "STUDENT", // Niemals role aus req.body übernehmen!
      },
    });

    res.status(201).json({ message: "User successfully created", userId: user.id });
  } catch (error) {
    console.error("Registration error:", error.message);
    // stack: error.stack wird NICHT mehr mitgesendet — das gibt internen Code-Aufbau preis!
    res.status(500).json({ error: "Failed to register user" });
  }
};

// User Login Logic
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // 1. Find the user
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // SSO-Guard: Wenn ein User NUR per Uni-Login existiert, hat er kein Passwort.
    // bcrypt.compare(x, null) würde crashen → stattdessen saubere 401-Meldung.
    if (!user.password) {
      return res.status(401).json({ error: "Please use your university login (SSO)" });
    }

    // 2. Compare passwords
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // 3. Tokens generieren
    const accessToken = generateAccessToken(user.id, user.role);
    const refreshToken = generateRefreshToken(user.id, user.role);

    // 4. Refresh Token als httpOnly Cookie setzen
    // httpOnly: true → JavaScript kann diesen Cookie NICHT lesen (XSS-Schutz!)
    // sameSite: "strict" → Cookie wird nur bei Requests an dieselbe Domain gesendet (CSRF-Schutz!)
    // secure: true nur in Production (in Dev läuft kein HTTPS)
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 Tage in Millisekunden
    });

    // 5. Nur der kurzlebige Access Token wird im Response Body zurückgegeben
    res.json({
      message: "Login successful",
      token: accessToken, // Heißt weiterhin "token" damit das Frontend keine große Änderung braucht
      user: { id: user.id, email: user.email, role: user.role, name: user.displayName || user.email }
    });
  } catch (error) {
    console.error("Login error:", error.message);
    res.status(500).json({ error: "Login failed" });
  }
};

// Refresh Token: Gibt neuen Access Token zurück wenn der alte abläuft
exports.refresh = (req, res) => {
  // Der Browser schickt den Refresh Token automatisch im Cookie mit (wegen withCredentials: true)
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    return res.status(401).json({ error: "No refresh token" });
  }

  try {
    // Refresh Token verifizieren mit dem REFRESH Secret (nicht dem Access Secret!)
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    // Neuen Access Token ausstellen
    const newAccessToken = generateAccessToken(decoded.userId, decoded.role);

    // Refresh Token Rotation: Auch neuen Refresh Token ausstellen und Cookie ersetzen.
    // Jeder Refresh Token ist damit nur einmal verwendbar → gestohlene Tokens werden schnell ungültig.
    const newRefreshToken = generateRefreshToken(decoded.userId, decoded.role);
    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ token: newAccessToken });
  } catch (error) {
    // Token ungültig oder abgelaufen → User muss sich neu einloggen
    res.status(401).json({ error: "Invalid or expired refresh token" });
  }
};

// Logout: Löscht den Refresh Token Cookie
exports.logout = (req, res) => {
  // Cookie löschen → der Browser sendet ihn nicht mehr mit
  res.clearCookie("refreshToken", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  });
  res.json({ message: "Logged out successfully" });
};