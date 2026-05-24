import axios from 'axios';

// Der Access Token lebt NUR in dieser Variable (im Browser-Memory).
// Er ist nicht in localStorage → JavaScript auf anderen Tabs/Seiten kann ihn NICHT stehlen.
// Nachteil: Bei Seiten-Refresh ist er weg → wird durch initAuth() wiederhergestellt.
let accessToken: string | null = null;

const BASE = 'http://localhost:3000/api';

// Die zentrale Axios-Instanz. Statt axios.get() nutzt du api.get() überall.
export const api = axios.create({
  baseURL: BASE,
  withCredentials: true, // WICHTIG: schickt den httpOnly Cookie (Refresh Token) automatisch mit
});

// Request-Interceptor: Fügt den Authorization-Header automatisch hinzu.
// Statt in jeder Komponente { headers: { Authorization: `Bearer ${token}` } }
// macht das jetzt dieser Interceptor automatisch.
api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// Response-Interceptor: Reagiert auf 401-Fehler (Token abgelaufen).
// Ablauf: Request schlägt fehl (401) → Token refreshen → Request nochmal versuchen → bei Fehler: Logout
api.interceptors.response.use(
  (response) => response, // Alles OK → einfach durchreichen
  async (error) => {
    const originalRequest = error.config;

    // Nur einmal versuchen zu refreshen (_retry-Flag verhindert Endlosschleife)
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        // Refresh: Der Browser schickt den httpOnly Cookie automatisch mit
        const { data } = await axios.post(`${BASE}/auth/refresh`, {}, { withCredentials: true });
        accessToken = data.token;

        // Original-Request nochmal versuchen, diesmal mit neuem Token
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch {
        // Refresh fehlgeschlagen → Session abgelaufen, User muss sich neu einloggen
        accessToken = null;
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

// Wird nach erfolgreichem Login aufgerufen um den Token zu setzen
export function setToken(token: string) {
  accessToken = token;
}

// Gibt den aktuellen Token zurück (für Fälle wo er direkt gebraucht wird)
export function getToken() {
  return accessToken;
}

// Löscht den Token aus dem Memory (beim Logout)
export function clearToken() {
  accessToken = null;
}

// Wird beim App-Start aufgerufen um die Session wiederherzustellen.
// Der Browser schickt den httpOnly Cookie automatisch → wir bekommen einen neuen Access Token.
// Gibt true zurück wenn eingeloggt, false wenn nicht.
export async function initAuth(): Promise<boolean> {
  try {
    const { data } = await axios.post(`${BASE}/auth/refresh`, {}, { withCredentials: true });
    accessToken = data.token;
    return true;
  } catch {
    return false; // Kein gültiger Refresh Token → nicht eingeloggt
  }
}
