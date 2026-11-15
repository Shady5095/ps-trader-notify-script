import fs from 'node:fs';
import { CONFIG } from './config.js';

let memorySeenSet = null;

/**
 * Loads seen ad IDs from JSON file into memory set
 */
export function loadSeenAds() {
  if (memorySeenSet) return memorySeenSet;

  memorySeenSet = new Set();
  try {
    if (fs.existsSync(CONFIG.DB_FILE)) {
      const data = fs.readFileSync(CONFIG.DB_FILE, 'utf8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        for (const id of parsed) {
          memorySeenSet.add(String(id));
        }
      }
    }
  } catch (err) {
    console.error('[Storage] خطأ أثناء قراءة قاعدة بيانات الإعلانات المسجلة:', err.message);
  }

  return memorySeenSet;
}

/**
 * Checks if an ad ID has already been seen
 */
export function isAdSeen(adId) {
  const set = loadSeenAds();
  return set.has(String(adId));
}

/**
 * Saves a new ad ID to the seen set and persists to disk
 */
export function markAdAsSeen(adId) {
  const set = loadSeenAds();
  set.add(String(adId));

  try {
    // Keep only the most recent 2,500 ads to prevent file bloat
    const arr = Array.from(set);
    const trimmed = arr.length > 2500 ? arr.slice(arr.length - 2500) : arr;

    fs.writeFileSync(CONFIG.DB_FILE, JSON.stringify(trimmed, null, 2), 'utf8');
  } catch (err) {
    console.error('[Storage] خطأ أثناء حفظ الإعلانات في القرص:', err.message);
  }
}
