// localStorage 存取封裝：收藏 / 偏好 / 已參加。
// 沒有伺服器端使用者狀態，全部資料只存在使用者裝置上。這個檔案只能在 client component 使用。

const KEYS = {
  favorites: "era:favorites",
  attended: "era:attended",
  preferences: "era:preferences",
} as const;

export interface Preferences {
  favoriteCities: string[];
  favoriteCategories: string[];
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage 滿了或被瀏覽器封鎖時，安靜失敗，不影響其他功能
  }
}

// ---- 收藏 ----
export function getFavoriteIds(): string[] {
  return readJson<string[]>(KEYS.favorites, []);
}
export function isFavorite(eventId: string): boolean {
  return getFavoriteIds().includes(eventId);
}
export function toggleFavorite(eventId: string): string[] {
  const current = getFavoriteIds();
  const next = current.includes(eventId)
    ? current.filter((id) => id !== eventId)
    : [...current, eventId];
  writeJson(KEYS.favorites, next);
  return next;
}

// ---- 已參加 ----
export function getAttendedMap(): Record<string, number> {
  return readJson<Record<string, number>>(KEYS.attended, {});
}
export function toggleAttended(eventId: string): Record<string, number> {
  const current = getAttendedMap();
  const next = { ...current };
  if (next[eventId]) {
    delete next[eventId];
  } else {
    next[eventId] = Date.now();
  }
  writeJson(KEYS.attended, next);
  return next;
}

// ---- 偏好 ----
const DEFAULT_PREFERENCES: Preferences = { favoriteCities: [], favoriteCategories: [] };
export function getPreferences(): Preferences {
  return readJson<Preferences>(KEYS.preferences, DEFAULT_PREFERENCES);
}
export function setPreferences(prefs: Preferences): void {
  writeJson(KEYS.preferences, prefs);
}
