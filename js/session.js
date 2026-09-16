/**
 * AirRunner - Session & API Client
 * Shared by the sign-in page, the portal and the game: where the API lives,
 * how the login token is stored, and one fetch helper with readable errors.
 */

const origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
export const API_BASE = origin.includes(':8080')
  ? 'http://localhost:8000/api'
  : (origin.startsWith('http') ? `${origin}/api` : 'http://localhost:8000/api');

const KEYS = {
  token: 'airrunner_token',
  pilotName: 'airrunner_pilotName',
  gamerId: 'airrunner_gamerId'
};

export function saveSession({ token, pilotName, gamerId }) {
  localStorage.setItem(KEYS.token, token);
  localStorage.setItem(KEYS.pilotName, pilotName);
  localStorage.setItem(KEYS.gamerId, gamerId);
}

export function clearSession() {
  Object.values(KEYS).forEach((key) => localStorage.removeItem(key));
}

/** Returns the stored session, or null (and clears it) when missing or expired. */
export function getSession() {
  const token = localStorage.getItem(KEYS.token);
  if (!token || isExpired(token)) {
    clearSession();
    return null;
  }
  return {
    token,
    pilotName: localStorage.getItem(KEYS.pilotName) || 'Pilot',
    gamerId: localStorage.getItem(KEYS.gamerId) || ''
  };
}

// Reads the token's exp claim only to skip requests that would fail; the server verifies the signature
function isExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

export async function api(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error(`Cannot reach the AirRunner server at ${API_BASE}. Is it running?`);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // FastAPI sends a string for HTTPException and a list of field errors for validation failures
    const detail = Array.isArray(data.detail)
      ? data.detail.map((d) => `${d.loc.at(-1)}: ${d.msg}`).join('; ')
      : data.detail;
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return data;
}
