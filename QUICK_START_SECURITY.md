# 🚀 Quick Start: Sicherheit & Robustheit (Diese Woche)

Eine fokussierte Liste für die **nächsten 5 Tage** zum sofort loslegen.

---

## 📅 Tag 1-2: JWT Security Fix (KRITISCH)

### Was du tun musst:

```bash
# Im backend/ Ordner ausführen:
npm install redis dotenv cookie-parser
npm install --save-dev @types/cookie-parser
```

> **Warum `cookie-parser`?** Express liest Cookies nicht automatisch aus — ohne dieses Package ist `req.cookies` immer `undefined`.

### 1. Environment Setup & cookie-parser einbinden

Zuerst `cookie-parser` in `backend/src/server.js` einbinden (direkt nach `express.json()`):

```javascript
const cookieParser = require("cookie-parser");
app.use(express.json());
app.use(cookieParser()); // ← Neu hinzufügen!
```

Dann die `.env`-Variablen ergänzen:

```bash
# backend/.env.local
JWT_SECRET=generate-a-random-32-char-string-here
JWT_REFRESH_SECRET=another-random-32-char-string
REDIS_URL=redis://localhost:6379
BCRYPT_ROUNDS=12
NODE_ENV=development
```

### 2. Token Generation updaten

**Datei:** `backend/src/controllers/authController.js`

```javascript
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const generateAccessToken = (userId, role) => {
  return jwt.sign(
    { userId, role, type: "access" },
    process.env.JWT_SECRET,
    { expiresIn: "15m" }, // ← Kurz!
  );
};

const generateRefreshToken = (userId, role) => {
  return jwt.sign(
    { userId, role, type: "refresh" }, // ← role mitspeichern!
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: "7d" }, // ← Lang!
  );
};
```

### 3. Login Response updaten

```javascript
const login = async (req, res) => {
  // ... existing validation ...

  const accessToken = generateAccessToken(user.id, user.role);
  const refreshToken = generateRefreshToken(user.id, user.role); // ← role mitgeben!

  // httpOnly Cookie für Refresh Token
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 Tage
  });

  // Nur Access Token im Body
  res.json({
    accessToken,
    user: { id: user.id, email: user.email, role: user.role },
  });
};
```

### 4. Refresh & Logout Endpoints hinzufügen

**In bestehende Datei:** `backend/src/routes/authRoutes.js` (die existiert schon — diese Routen einfach unten hinzufügen)

```javascript
router.post("/refresh", (req, res) => {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    return res.status(401).json({ error: "No refresh token" });
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const newAccessToken = generateAccessToken(decoded.userId, decoded.role);

    res.json({ accessToken: newAccessToken });
  } catch (err) {
    res.status(401).json({ error: "Invalid refresh token" });
  }
});

router.post("/logout", (req, res) => {
  res.clearCookie("refreshToken");
  res.json({ message: "Logged out" });
});
```

### 5. Frontend: Axios Interceptor

**Datei:** `client/src/utils/axiosConfig.ts`

```typescript
import axios from "axios";

let accessToken: string | null = null;

const axiosInstance = axios.create({
  baseURL: "http://localhost:3000/api",
  withCredentials: true, // ← Wichtig für Cookies!
});

// Request Interceptor: Token hinzufügen
axiosInstance.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// Response Interceptor: Token refresh bei 401
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const { data } = await axios.post(
          "http://localhost:3000/api/auth/refresh",
          {},
          { withCredentials: true },
        );
        accessToken = data.accessToken;

        return axiosInstance(originalRequest);
      } catch (refreshError) {
        // Refresh fehlgeschlagen → Logout
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  },
);

export function setAccessToken(token: string) {
  accessToken = token;
}

export { axiosInstance };
```

### 6. Login Page updaten

```typescript
// client/src/pages/Login.tsx

import { axiosInstance, setAccessToken } from "../utils/axiosConfig";

const handleLogin = async (email: string, password: string) => {
  const response = await axiosInstance.post("/auth/login", { email, password });

  // Token in Memory speichern (nicht localStorage!)
  setAccessToken(response.data.accessToken);

  // Redirect
  navigate("/dashboard");
};
```

---

## 📅 Tag 2-3: Input Validation (KRITISCH)

```bash
npm install zod
```

**Schema:** `backend/src/schemas/index.js`

```javascript
const { z } = require("zod");

const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Password too short"),
});

const courseSchema = z.object({
  title: z.string().min(3, "Title too short"),
  description: z.string().optional(),
  isPublic: z.boolean(),
});

const topicSchema = z.object({
  name: z.string().min(2),
  content: z.string().optional(),
  courseId: z.string().uuid("Invalid course ID"),
});

module.exports = { loginSchema, courseSchema, topicSchema };
```

**Middleware:** `backend/src/middleware/validate.js`

```javascript
const validate = (schema) => (req, res, next) => {
  try {
    schema.parse(req.body);
    next();
  } catch (error) {
    res.status(400).json({
      error: "Validation failed",
      details: error.errors,
    });
  }
};

module.exports = validate;
```

**In Routes:**

```javascript
const validate = require("../middleware/validate");
const { loginSchema } = require("../schemas");

router.post("/login", validate(loginSchema), authController.login);
```

---

## 📅 Tag 3-4: Logging & Error Handling

```bash
npm install winston
```

**Logger Setup:** `backend/src/utils/logger.js`

```javascript
const winston = require("winston");

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: "logs/error.log", level: "error" }),
    new winston.transports.File({ filename: "logs/combined.log" }),
  ],
});

if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  );
}

module.exports = logger;
```

**Global Error Handler:** `backend/src/middleware/errorHandler.js`

```javascript
const logger = require("../utils/logger");

const errorHandler = (err, req, res, next) => {
  logger.error({
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
  });

  res.status(err.status || 500).json({
    error:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message,
  });
};

module.exports = errorHandler;
```

---

## 📅 Tag 4-5: Testing Setup

```bash
npm install --save-dev jest supertest @types/jest
```

**Test:** `backend/__tests__/auth.test.js`

```javascript
const request = require("supertest");
const app = require("../src/server");

describe("Auth Endpoints", () => {
  test("POST /api/auth/login returns access token", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "test@test.com", password: "Password123!" });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.headers["set-cookie"]).toContain("refreshToken");
  });

  test("POST /api/auth/refresh with valid token returns new access token", async () => {
    // 1. Login
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "test@test.com", password: "Password123!" });

    const cookies = loginRes.headers["set-cookie"];

    // 2. Refresh
    const refreshRes = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookies);

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.accessToken).toBeDefined();
  });

  test("POST /api/auth/logout clears refresh token", async () => {
    const res = await request(app).post("/api/auth/logout");

    expect(res.headers["set-cookie"]).toBeDefined();
    expect(res.headers["set-cookie"][0]).toContain("refreshToken=;");
  });
});
```

---

## 🎯 Was nach dieser Woche funktionieren sollte

- ✅ JWT Token: 15min Access + 7d Refresh
- ✅ Token in httpOnly Cookie (nicht localStorage)
- ✅ Auto-Refresh beim Ablaufen
- ✅ Input Validierung auf allen Endpoints
- ✅ Strukturiertes Logging
- ✅ Basis-Tests für Auth
- ✅ Keine Plaintext Errors zu Clients

---

## 📦 Dependencies für diese Woche

```bash
# Alle auf einmal installieren (im backend/ Ordner):
npm install redis zod winston dotenv cookie-parser express-rate-limit
npm install --save-dev jest supertest @types/jest @types/cookie-parser
```

---

## ⚠️ Häufige Fehler

| Problem                  | Symptom                     | Fix                          |
| ------------------------ | --------------------------- | ---------------------------- |
| Token in localStorage    | XSS kann ihn stehlen        | Nur httpOnly Cookie + Memory |
| Kein Refresh Token       | Token hat lange Lebensdauer | 15min Access + 7d Refresh    |
| Wildcard CORS            | Jede Website greift an      | Nur Frontend-URL             |
| console.log statt Logger | Keine strukturierten Logs   | Winston einführen            |
| Keine Input Validation   | SQL/XSS möglich             | Zod nutzen                   |

---

## ✅ Completion Checklist

- [] JWT Secret in .env
- [ ] Access Token 15min, Refresh 7d
- [ ] httpOnly Cookies konfiguriert
- [ ] Axios Interceptor im Frontend
- [ ] /auth/refresh Endpoint
- [ ] /auth/logout Endpoint
- [ ] Zod Validation Setup
- [ ] Winston Logger Setup
- [ ] Global Error Handler
- [ ] Auth Tests schreiben
- [ ] CORS mit credentials: true
- [ ] Alle neuen .env vars dokumentiert

Geschätzte Zeit: **8-12 Stunden** für ein Entwickler
