const jwt = require("jsonwebtoken");

const verifyToken = (req, res, next) => {
  // 1. Wir suchen den Token im Header der Anfrage (Postman: "Authorization" Tab)
  const authHeader = req.headers.authorization;

  // 2. Prüfen, ob überhaupt ein Header mitgeschickt wurde und ob er mit "Bearer " anfängt
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Zugriff verweigert. Kein gültiger Token vorhanden." });
  }

  // 3. Den eigentlichen Token vom Wort "Bearer " trennen
  const token = authHeader.split(" ")[1];

  try {
    // 4. Den Token mit unserem geheimen Passwort aus der .env entschlüsseln
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "supersecret");
    
    // 5. Die entschlüsselten User-Daten (id, email, role) an die Anfrage dranhängen
    req.user = decoded;
    
    // 6. next() ruft die nächste Funktion auf (z.B. den courseController)
    next();
  } catch (error) {
    res.status(401).json({ error: "Ungültiger oder abgelaufener Token." });
  }
};

module.exports = { verifyToken };
