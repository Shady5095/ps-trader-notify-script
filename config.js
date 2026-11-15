import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to load .env manually if dotenv is not installed
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnv();

export const CONFIG = {
  // Check interval in minutes (default 5 minutes as requested)
  CHECK_INTERVAL_MINUTES: parseInt(process.env.CHECK_INTERVAL_MINUTES || '5', 10),

  // Google Gemini API Key
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  // Default to gemini-3.1-flash-lite for instant responses and generous free tier
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',

  // Free Mobile Notifications: Telegram
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '',

  // Free Mobile Notifications: ntfy.sh (Zero-setup alternative)
  NTFY_TOPIC: process.env.NTFY_TOPIC || '',

  // Local storage for seen ads
  DB_FILE: path.join(__dirname, 'seen_ads.json'),

  // Alert on existing ads during the very first run, or just baseline them?
  // false = index current ads silently on first launch, alert ONLY for new ones arriving next
  // true = send notifications immediately for everything found currently
  ALERT_ON_INITIAL_RUN: process.env.ALERT_ON_INITIAL_RUN === 'true',

  // Comprehensive Keywords list across Arabic and English
  // Every possible search term someone in Egypt might use when listing a PS5
  KEYWORDS: [
    'ps5',
    'playstation 5',
    'بلايستيشن 5',
    'بلاي ستيشن 5',
    'ps5 slim',
    'ps5 pro',
    'بي اس 5',
    'بليستيشن 5',
    'ps 5',
    'بلايستيشن5',
    'بلاي ستيشن 5',
    'playstation5',
    'play station 5',
    'بلايستيشن ٥',
    'بلاي ستيشن ٥',
    'بلايستيشن سليم',
    'بلايستيشن برو',
    'جهاز ps5'
  ],

  // Dubizzle Egypt Base URLs
  BASE_URL_EN: 'https://www.dubizzle.com.eg/en',
  BASE_URL_AR: 'https://www.dubizzle.com.eg/ar',

  // Request headers to mimic real browser
  REQUEST_HEADERS: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
  }
};
