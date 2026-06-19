const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const authController = require("../controllers/authController");

// Rate Limiter für Login: Max 10 Versuche pro 15 Minuten pro IP.
// Verhindert Brute-Force-Angriffe (unbegrenzt Passwörter ausprobieren).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 Minuten
  max: 10,
  message: { error: "Too many login attempts. Please try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate Limiter für Register: Max 5 Registrierungen pro Stunde pro IP.
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 Stunde
  max: 5,
  message: { error: "Too many accounts created. Please try again later." },
});

// POST /api/auth/register
router.post("/register", registerLimiter, authController.register);

// POST /api/auth/login
router.post("/login", loginLimiter, authController.login);

// POST /api/auth/refresh — gibt neuen Access Token zurück (nutzt httpOnly Cookie)
router.post("/refresh", authController.refresh);

// POST /api/auth/logout — löscht den Refresh Token Cookie
router.post("/logout", authController.logout);

module.exports = router;

