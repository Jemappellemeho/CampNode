# CampNode: Robustheit, Skalierbarkeit & Security — TODO

Dieses Dokument listet alle notwendigen Verbesserungen für Production-Readiness auf.

---

## 🔴 **KRITISCH — Muss vor Production erledigt sein**

### 1. Security: JWT Token & Authentication

- [x] **Access Token: Kurze Lebensdauer (15min)** ✅ Erledigt
- [x] **Refresh Token in httpOnly Cookie** ✅ Erledigt — Token lebt nicht mehr in localStorage
- [x] **Kein `|| "supersecret"` Fallback** ✅ Erledigt — JWT_SECRET muss in .env vorhanden sein
- [x] **CORS richtig konfiguriert** ✅ Erledigt — spezifische Origin + credentials: true
- [x] **helmet.js** ✅ Erledigt — Security-Headers automatisch gesetzt
- [x] **Rate Limiting auf Login/Register** ✅ Erledigt — 10 Versuche / 15min
- [x] **bcrypt 12 Rounds** ✅ Erledigt — war 10, jetzt 12
- [x] **Stack Trace nicht mehr an Client senden** ✅ Erledigt
- [x] **Globaler Error Handler** ✅ Erledigt — server.js

- [ ] **Refresh Token Rotation** — noch offen
  - Beim `/refresh` Call sollte auch ein neuer Refresh Token ausgestellt werden
  - Aktuell: Nur neuer Access Token, Refresh Token bleibt gleich
  - Umsetzung: In `authController.js` → `exports.refresh` → `res.cookie(...)` hinzufügen

- [ ] **Token Blacklist / Revocation** — noch offen (braucht Redis)
  - Redis installieren + `tokenBlacklist.js` erstellen
  - Beim Logout: Access Token in Redis blacklisten (TTL = verbleibende Gültigkeitsdauer)
  - Im `authMiddleware.js`: vor `jwt.verify` gegen Blacklist checken

- [ ] **HTTPS erzwingen** — noch offen (nur für Production relevant)
  - HSTS Header (`Strict-Transport-Security`) ist bereits via helmet gesetzt
  - HTTP→HTTPS Redirect in `server.js` für Production aktivieren
  - Secure Flag auf Cookies ist bereits korrekt (`secure: NODE_ENV === "production"`)

- [ ] **Input Validierung & Sanitization** — noch offen
  - Zod installieren: `npm install zod`
  - `backend/src/schemas/index.js` erstellen
  - Alle Endpoints absichern (besonders courseId, topicId als UUID)
  - XSS-Prevention: `npm install dompurify @types/dompurify` im Frontend

- [ ] **Passwort-Stärke-Anforderungen** — noch offen
  - Min. 8 Zeichen, Uppercase, Zahl
  - Im `authController.js` → `exports.register` vor `bcrypt.hash` prüfen

---

### 2. Testing — Grundlage für Vertrauen

- [ ] **Unit Tests für RAG-Pipeline** — noch offen
  - `ai-service/tests/test_rag.py` (pytest)
  - Test: `create_embedding()` mit Mock-API
  - Test: `search_chunks()` mit Test-Daten
  - Test: `answer_question()` mit verschiedenen Chunk-Szenarien
  - Min. 80% Coverage

- [ ] **Integration Tests für Backend** — noch offen
  - `backend/__tests__/auth.test.js` (Jest)
  - Test: Login → JWT Token + httpOnly Cookie bekommen
  - Test: `/refresh` mit gültigem Cookie → neuer Access Token
  - Test: Protected Route ohne Token → 401
  - Test: Rate Limiting greift nach 10 Versuchen

- [ ] **E2E Tests für kritische Flows** — noch offen
  - Vitest/Playwright
  - Flow: Register → Login → Course erstellen → Topic hinzufügen → Quiz machen

---

### 3. Error Handling & Logging

- [x] **Globaler Error Handler** ✅ Erledigt — fängt alle unbehandelten Fehler ab
- [x] **Stack Traces nicht an Client senden** ✅ Erledigt

- [ ] **Strukturiertes Logging (Winston)** — noch offen
  - `npm install winston` im Backend
  - `backend/src/utils/logger.js` erstellen
  - Alle `console.log()` / `console.error()` durch `logger.info()` / `logger.error()` ersetzen
  - Python AI Service: `logging` Modul konfigurieren statt `print()`

- [ ] **Graceful Degradation** — noch offen
  - Wenn Gemini API down: Alternative Response statt 500
  - Wenn Supabase down: Retry-Logik mit exponential backoff
  - Circuit Breaker Pattern für externe APIs

---

## 🟡 **HOCH — Sollte bald implementiert sein**

### 4. Performance & Skalierbarkeit

#### 4.1 Async Job Queue — noch offen
- [ ] **Bull Job Queue einführen**
  - PDF-Parsing, Embedding-Generierung, Quiz-Generierung → Async Jobs
  - `npm install bull redis`
  - `backend/src/queues/jobQueue.js` erstellen

#### 4.2 Caching — noch offen
- [ ] **Redis Caching einführen**
  - Cache für Courses (TTL: 5min), Topics, Quizzes
  - `backend/src/utils/cache.js` erstellen

#### 4.3 Datenbank Optimierung — noch offen
- [ ] **Indizes erstellen** in `schema.prisma`:
  - `@@index([instructorId])` auf Course
  - `@@index([isPublic])` auf Course
  - `@@index([courseId])` auf Topic

- [ ] **Pagination implementieren**
  - Courses Liste: `?page=1&limit=20`
  - Topics per Course: `?offset=0&limit=50`

#### 4.4 Frontend Performance — noch offen
- [ ] **Code Splitting**
  - `React.lazy()` + `Suspense` für CoursePlayer, Playground, CourseManager

- [ ] **Image Optimization**
  - `loading="lazy"` auf `<img>` Tags setzen

---

### 5. TypeScript im Backend — noch offen

- [ ] **Express Backend zu TypeScript migrieren**
  - `npm install --save-dev typescript ts-node @types/express @types/node`
  - Alle `.js` Dateien in `backend/src/` → `.ts`
  - Types für API-Responses definieren (`CourseDTO`, `ApiResponse<T>` etc.)

---

### 6. DevOps & Deployment — noch offen

#### 6.1 Docker
- [ ] **Docker Compose Setup** (`docker-compose.yml` im Root)
- [ ] **Dockerfiles** für backend, client, ai-service

#### 6.2 Environment Management
- [ ] **`.env.example` erstellen** (Vorlage ohne echte Secrets, für neue Entwickler)
- [ ] **Secrets Management**: Production über Hosting-Provider (Vercel, Railway etc.)

---

### 7. Monitoring & Observability — noch offen

- [ ] **Health Check erweitern**
  - Aktuell: `/health` gibt nur `{ ok: true }` zurück
  - Soll: DB-Check, Redis-Check, AI-Service-Check mitliefern

- [ ] **Sentry Error Tracking**
  - `npm install @sentry/node`
  - Im `server.js` initialisieren

- [ ] **Logging Dashboard**
  - Datadog / ELK Stack / Cloud Logging

---

## 🟢 **MITTEL — Kann nach Launch kommen**

### 8. Weitere Robustheitsmassnahmen — noch offen

- [ ] **Database Backups**: Supabase Automated Backups aktivieren
- [ ] **Request Timeouts**: Axios Timeout 30s + Express `server.timeout`
- [ ] **Graceful Shutdown**: SIGTERM abfangen, DB-Verbindung sauber schließen

---

### 9. Frontend-seitige Sicherheit

- [x] **Token nicht mehr in localStorage** ✅ Erledigt — Token lebt nur im Memory (api.ts)
- [x] **Axios Interceptor für Auto-Refresh** ✅ Erledigt — api.ts

- [ ] **XSS Prevention (DOMPurify)** — noch offen
  - `npm install dompurify @types/dompurify` im Frontend
  - Benutzergenerierten Content (z.B. Kurs-Beschreibungen) sanitizen

- [ ] **CSRF Protection** — noch offen
  - Durch httpOnly Cookie + sameSite: "strict" bereits stark reduziert
  - Optional: CSRF Token für extra Absicherung

- [ ] **Dependency Scanning** — noch offen
  - `npm audit` regelmäßig ausführen
  - Dependabot auf GitHub aktivieren

---

### 10. Code Quality — noch offen

- [ ] **ESLint & Prettier im Backend**
  - `.eslintrc.json` für Backend
  - Pre-commit Hooks (Husky)

- [ ] **Prisma Schema Validation**
  - `npx prisma validate` vor Deployments

- [ ] **Strict TypeScript**: `"strict": true` in `tsconfig.json`

---

## 📋 **Aktueller Status nach erstem Refactoring**

### ✅ Phase 1 — Größtenteils erledigt
- [x] JWT Refresh Token System (Access 15min + Refresh 7d)
- [x] Token aus localStorage entfernt (alle 12 Frontend-Dateien)
- [x] CORS, helmet, cookie-parser, globaler Error Handler
- [x] Rate Limiting auf Auth-Endpoints
- [ ] Refresh Token Rotation — noch offen
- [ ] Input Validierung (Zod) — noch offen
- [ ] Strukturiertes Logging (Winston) — noch offen

### ⏳ Phase 2 — Nächste Schritte
1. Refresh Token Rotation (klein, schnell)
2. Input Validierung mit Zod
3. Passwort-Stärke-Check
4. Winston Logging
5. Auth Tests

### ⏳ Phase 3 — Performance (Wochen 3-4)
1. Redis Caching
2. Bull Job Queue
3. Database Indexing
4. Frontend Code Splitting

### ⏳ Phase 4 — Deployment (Wochen 5-6)
1. Docker Compose
2. Dockerfiles
3. Health Checks erweitern
4. Sentry Error Tracking

### ⏳ Phase 5 — Laufend
1. Logging Dashboard
2. Performance Monitoring
3. Dependency Updates

---

## ✅ Fertigstellung checken

Für Production-Readiness mindestens abhaken:
- [ ] Alle KRITISCH-Items done
- [ ] Alle HOCH-Items done
- [ ] >80% Test Coverage
- [ ] Security Audit bestanden
- [ ] Load Test bestanden (100+ concurrent users)
- [ ] Disaster Recovery Plan
- [ ] Monitoring aktiv
- [ ] Documentation updated
