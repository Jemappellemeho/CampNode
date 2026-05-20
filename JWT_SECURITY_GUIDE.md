# JWT Security Guide für CampNode

Ein detaillierter Leitfaden für sichere JWT-Implementierung.

---

## 🔐 Aktuelle Situation

**Was du vermutlich hast:**
- JWT Token Generation in `authController.js`
- Token wird vermutlich in localStorage gespeichert (⚠️ XSS-Anfällig!)
- Kurze Lebensdauer wahrscheinlich nicht implementiert
- Kein Refresh Token System

---

## ✅ Was muss geändert werden

### 1. Token Struktur & Lebensdauer

**Access Token (kurz):**
```javascript
const generateAccessToken = (userId, role) => {
  return jwt.sign(
    { userId, role, type: 'access' },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }  // ← 15 Minuten!
  );
};
```

**Refresh Token (lang):**
```javascript
const generateRefreshToken = (userId, role) => {
  return jwt.sign(
    { userId, role, type: 'refresh' },  // ← role mitspeichern, damit beim Refresh der neue Access Token korrekt generiert wird!
    process.env.JWT_REFRESH_SECRET,  // ← ANDERER Secret!
    { expiresIn: '7d' }  // ← 7 Tage
  );
};
```

**Im Login-Response:**
```javascript
res.json({
  accessToken,    // → Kurz, in Memory
  refreshToken    // → Lang, in HttpOnly Cookie
});
```

---

### 2. Speicherung im Frontend

**❌ FALSCH (Aktuell wahrscheinlich):**
```javascript
// localStorage ist XSS-anfällig!
localStorage.setItem('token', token);
```

**✅ RICHTIG:**
```javascript
// Access Token: In Memory Variable (stirbt bei Reload)
let accessToken = null;

// Refresh Token: HttpOnly Cookie (vom Backend automatisch)
// Der Browser sendet es automatisch mit jedem Request
```

**Im Backend (Login-Response):**
```javascript
const refreshToken = generateRefreshToken(userId);

res.cookie('refreshToken', refreshToken, {
  httpOnly: true,      // ← JavaScript kann NICHT zugreifen!
  secure: true,        // ← Nur über HTTPS!
  sameSite: 'strict',  // ← CSRF Protection!
  maxAge: 7 * 24 * 60 * 60 * 1000  // ← 7 Tage
});

res.json({ accessToken });  // ← Nur Access Token im Body!
```

---

### 3. Access Token Verwendung

**Frontend: Jeden Request mit Access Token senden**
```javascript
// utils/axiosConfig.ts
const axiosInstance = axios.create({
  baseURL: 'http://localhost:3000/api'
});

axiosInstance.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Wenn 401 → Token ist expired, refresh!
    if (error.response?.status === 401 && !error.config._retry) {
      error.config._retry = true;
      try {
        const newAccessToken = await refreshAccessToken();
        accessToken = newAccessToken;
        return axiosInstance(error.config);
      } catch (err) {
        // Refresh fehlgeschlagen → logout
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);
```

---

### 4. Refresh Endpoint

**`POST /api/auth/refresh`**
```javascript
// backend/src/routes/authRoutes.js
router.post('/refresh', (req, res) => {
  const { refreshToken } = req.cookies;  // ← Automatisch vom Browser!
  
  if (!refreshToken) {
    return res.status(401).json({ error: 'No refresh token' });
  }
  
  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    
    // Prüfe ob Token in Blacklist ist (s.u.)
    if (isTokenBlacklisted(refreshToken)) {
      return res.status(401).json({ error: 'Token revoked' });
    }
    
    const newAccessToken = generateAccessToken(decoded.userId, decoded.role);
    
    // Optional: Refresh Token rotieren
    const newRefreshToken = generateRefreshToken(decoded.userId);
    res.cookie('refreshToken', newRefreshToken, { /* ... */ });
    
    res.json({ accessToken: newAccessToken });
  } catch (err) {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});
```

---

### 5. Token Blacklist (für Logout)

**Problem:** JWT ist "stateless" — wenn jemand seinen Token stiehlt, nutzt der Dieb ihn bis er expired.

**Lösung:** Redis Blacklist

```javascript
// backend/src/utils/tokenBlacklist.js
const redis = require('redis');
const client = redis.createClient(process.env.REDIS_URL);

async function blacklistToken(token) {
  const decoded = jwt.decode(token);
  const ttl = decoded.exp - Math.floor(Date.now() / 1000);  // Verbleibende Zeit
  
  if (ttl > 0) {
    await client.setex(`blacklist:${token}`, ttl, 'true');
  }
}

async function isTokenBlacklisted(token) {
  const result = await client.get(`blacklist:${token}`);
  return !!result;
}

module.exports = { blacklistToken, isTokenBlacklisted };
```

**Im Auth Middleware:**
```javascript
// backend/src/middleware/authMiddleware.js
const { isTokenBlacklisted } = require('../utils/tokenBlacklist');

const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token' });
  }
  
  // ← Neuer Check!
  if (await isTokenBlacklisted(token)) {
    return res.status(401).json({ error: 'Token revoked' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};
```

**Logout Endpoint:**
```javascript
router.post('/logout', authMiddleware, async (req, res) => {
  const token = req.headers.authorization.split(' ')[1];
  
  // Blacklist den Access Token
  await blacklistToken(token);
  
  // Clear den Refresh Token Cookie
  res.clearCookie('refreshToken');
  
  res.json({ message: 'Logged out' });
});
```

---

### 6. Rate Limiting auf Auth Endpoints

```javascript
// backend/src/middleware/rateLimiter.js
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 Minuten
  max: 5,                     // Max 5 Login-Versuche
  message: 'Too many login attempts, try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,   // 1 Stunde
  max: 3,                      // Max 3 Registrierungen pro IP
});

module.exports = { loginLimiter, registerLimiter };
```

**In Routes:**
```javascript
const { loginLimiter, registerLimiter } = require('../middleware/rateLimiter');

router.post('/login', loginLimiter, authController.login);
router.post('/register', registerLimiter, authController.register);
```

---

### 7. Password Security

**Ziel:** Starke Passwörter, sichere Speicherung

```javascript
// backend/src/utils/passwordUtils.js
const bcrypt = require('bcryptjs');

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

function validatePassword(password) {
  if (!PASSWORD_REGEX.test(password)) {
    throw new Error(
      'Password must be 8+ chars with uppercase, lowercase, number, and special char (@$!%*?&)'
    );
  }
}

async function hashPassword(password) {
  const salt = await bcrypt.genSalt(12);  // ← 12 rounds = langsam & sicher
  return bcrypt.hash(password, salt);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

module.exports = { validatePassword, hashPassword, verifyPassword };
```

**Im Register:**
```javascript
const { validatePassword, hashPassword } = require('../utils/passwordUtils');

const register = async (req, res) => {
  const { email, password } = req.body;
  
  // Validiere
  try {
    validatePassword(password);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  
  // Hash & speicher
  const hashedPassword = await hashPassword(password);
  
  await prisma.user.create({
    data: { email, password: hashedPassword }
  });
  
  res.json({ message: 'Registered' });
};
```

---

### 8. HTTPS & Secure Headers

```javascript
// backend/src/server.js
const helmet = require('helmet');

app.use(helmet());  // ← Setzt automatisch viele Security Headers

app.use((req, res, next) => {
  res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// HTTPS Redirect (in Production)
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      res.redirect(`https://${req.header('host')}${req.url}`);
    } else {
      next();
    }
  });
}
```

---

### 9. cookie-parser einbinden (Pflicht!)

`req.cookies` ist ohne dieses Package immer `undefined`:
```bash
npm install cookie-parser
```

```javascript
// backend/src/server.js
const cookieParser = require('cookie-parser');
app.use(express.json());
app.use(cookieParser());  // ← Direkt nach express.json()!
```

---

### 10. CORS richtig konfigurieren

```javascript
// backend/src/server.js
const cors = require('cors');

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,  // ← Erlaubt Cookies!
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
```

---

### 11. Environment Variables

**`.env.local` (NIEMALS in Git!)**
```
JWT_SECRET=your-super-secret-key-min-32-chars-long-random
JWT_REFRESH_SECRET=another-different-secret-key-min-32-chars
REDIS_URL=redis://localhost:6379
BCRYPT_ROUNDS=12
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
```

**Für Production:**
```
# Nutze Secrets deines Hosting-Providers (Vercel, Railway, etc.)
# NICHT in .env Datei!
```

---

## 📋 Implementierungs-Checklist

```
JWT Core:
- [ ] Access Token: 15 Minuten Expiry
- [ ] Refresh Token: 7 Tage Expiry, httpOnly Cookie
- [ ] Separate Secrets für Access & Refresh

Frontend:
- [ ] Access Token in Memory Variable (nicht localStorage!)
- [ ] Axios Interceptor für Token Refresh
- [ ] Auto-Logout wenn Refresh fehlschlägt
- [ ] Clear Cookies bei Logout

Backend:
- [ ] /api/auth/refresh Endpoint
- [ ] Token Blacklist mit Redis
- [ ] Rate Limiting (5 Login-Versuche / 15min)
- [ ] Password Validation (8+ chars, Uppercase, Number, Special)
- [ ] bcryptjs mit 12 Rounds

Security:
- [ ] helmet.js installiert
- [ ] CORS mit credentials: true
- [ ] HTTPS erzwingen (Production)
- [ ] HSTS Header
- [ ] Secure Cookies (httpOnly, secure, sameSite)

Testing:
- [ ] Test: Login → Tokens bekommen
- [ ] Test: Access Token expired → Auto-refresh
- [ ] Test: Refresh fehlgeschlagen → Logout
- [ ] Test: Logout → Token blacklisted
- [ ] Test: Rate Limiting funktioniert
```

---

## 🚨 Common Security Mistakes (Nicht machen!)

| Fehler | Problem | Lösung |
|--------|---------|--------|
| Token in localStorage | XSS-Angriff stiehlt Token | httpOnly Cookie |
| Kein Refresh Token | Lange Token-Lebensdauer = großes Risiko | 15min Access + 7d Refresh |
| Wildcard CORS (`*`) | Jede Website kann dich angreifen | Spezifische Origins |
| Plaintext Passwords | Datenbank-Leak = alle Passwords geleakt | bcrypt mit 12+ Rounds |
| JWT secret im Code | Git-History = secret exposed | Environment Variables |
| Kein Token Revocation | Gelöschte User können noch token nutzen | Redis Blacklist |
| HTTPS nur Optional | Man-in-the-Middle stiehlt Token | HTTPS erzwingen + HSTS |

---

## 📚 Weitere Ressourcen

- [RFC 8725: JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [Auth0: Refresh Token Rotation](https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation)
- [OWASP: Broken Authentication](https://owasp.org/www-project-top-ten/2021/A07_2021-Identification_and_Authentication_Failures/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)

