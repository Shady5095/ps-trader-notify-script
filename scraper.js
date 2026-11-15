import { CONFIG } from './config.js';

/**
 * Checks if an ad title or description mentions PlayStation 5
 * @param {Object} ad 
 * @returns {boolean}
 */
export function matchesPs5(ad) {
  const text = `${ad.title || ''} ${ad.description || ''}`;
  return CONFIG.PS5_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Searches Dubizzle Egypt in the Video Games & Consoles category
 * Uses a single polite request every 5 minutes to avoid bot detection and 403 blocks.
 * @returns {Promise<Array>} List of extracted ad objects
 */
export async function fetchDubizzleVideoGames() {
  let targetUrl = CONFIG.TARGET_CATEGORY_URL;

  // 1. If ScraperAPI is configured (Enable premium=true for protected domains like Dubizzle)
  if (CONFIG.SCRAPERAPI_KEY) {
    targetUrl = `https://api.scraperapi.com?api_key=${CONFIG.SCRAPERAPI_KEY}&url=${encodeURIComponent(targetUrl)}&premium=true`;
  }
  // 2. If ScrapeOps is configured
  else if (CONFIG.SCRAPEOPS_API_KEY) {
    targetUrl = `https://proxy.scrapeops.io/v1/?api_key=${CONFIG.SCRAPEOPS_API_KEY}&url=${encodeURIComponent(targetUrl)}&residential=true`;
  }

  const headers = { ...CONFIG.REQUEST_HEADERS };
  if (CONFIG.DUBIZZLE_COOKIE) {
    headers['Cookie'] = CONFIG.DUBIZZLE_COOKIE;
  }

  try {
    // Give proxies and residential connections up to 60s to resolve smoothly
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    const response = await fetch(targetUrl, {
      headers,
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const errSnippet = await response.text().catch(() => '');
      if (response.status === 403) {
        console.warn(`[Dubizzle] ⚠️ تحذير: تم تلقي كود 403 من حماية دوبيزل.`);
      } else {
        console.warn(`[Dubizzle] Warning: HTTP ${response.status} from proxy/target: ${errSnippet.slice(0, 160)}`);
      }
      return [];
    }

    const html = await response.text();
    const allAds = parseAdsFromHtml(html);
    
    console.log(`[Dubizzle] تم جلب ${allAds.length} إعلان من قسم ألعاب الفيديو والأجهزة.`);
    return allAds;
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error(`[Dubizzle] مهلة الاتصال انتهت (Timeout) أثناء جلب دوبيزل`);
    } else {
      console.error(`[Dubizzle] خطأ في جلب الإعلانات:`, err.message);
    }
    return [];
  }
}

/**
 * Parses ad listings from Dubizzle HTML
 */
function parseAdsFromHtml(html) {
  const ads = [];
  const seenIds = new Set();

  // Strategy 1: Next.js __NEXT_DATA__
  try {
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (nextDataMatch && nextDataMatch[1]) {
      const nextData = JSON.parse(nextDataMatch[1]);
      const extracted = extractAdsFromNextData(nextData);
      for (const item of extracted) {
        if (item.id && !seenIds.has(item.id)) {
          seenIds.add(item.id);
          ads.push(item);
        }
      }
      if (ads.length > 0) return ads;
    }
  } catch {}

  // Strategy 2: HTML Regex Fallback
  try {
    const linkRegex = /href="(\/(?:en\/|ar\/)?ad\/[^"]+)"/g;
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      const relativeUrl = match[1];
      const fullUrl = relativeUrl.startsWith('http') ? relativeUrl : `https://www.dubizzle.com.eg${relativeUrl}`;
      
      const idMatch = relativeUrl.match(/ID([0-9a-zA-Z]+)/i) || relativeUrl.match(/[-_](\d{6,})/);
      const id = idMatch ? idMatch[1] : relativeUrl;

      if (!seenIds.has(id)) {
        seenIds.add(id);

        const startPos = Math.max(0, match.index - 200);
        const endPos = Math.min(html.length, match.index + 800);
        const snippet = html.substring(startPos, endPos);

        const titleMatch = snippet.match(/title="([^"]+)"/) || 
                           snippet.match(/aria-label="([^"]+)"/) ||
                           snippet.match(/alt="([^"]+)"/);
        const priceMatch = snippet.match(/([\d,]+)\s*(?:EGP|ج\.م|جنيه)/i) || 
                           snippet.match(/(?:EGP|ج\.م|جنيه)\s*([\d,]+)/i);
        const imgMatch = snippet.match(/src="(https:\/\/[^"]+images\.dubizzle[^"]+)"/) ||
                         snippet.match(/src="(https:\/\/[^"]+\.(?:jpg|jpeg|webp|png)[^"]*)"/);

        ads.push({
          id: String(id),
          title: titleMatch ? titleMatch[1].trim() : 'PlayStation 5 Listing',
          price: priceMatch ? priceMatch[1].trim() + ' EGP' : 'غير محدد',
          location: 'مصر (Dubizzle)',
          url: fullUrl,
          imageUrl: imgMatch ? imgMatch[1] : null,
          description: ''
        });
      }
    }
  } catch (err) {
    console.error('[Dubizzle] خطأ في استخراج الإعلانات من كود HTML:', err.message);
  }

  return ads;
}

/**
 * Traverses __NEXT_DATA__ JSON tree to locate listing/ad objects
 */
function extractAdsFromNextData(obj) {
  const results = [];
  const seenIds = new Set();

  function traverse(node, depth = 0) {
    if (!node || depth > 8) return;

    if (Array.isArray(node)) {
      for (const item of node) {
        if (item && typeof item === 'object') {
          if (isAdObject(item)) {
            const ad = formatAdObject(item);
            if (ad && !seenIds.has(ad.id)) {
              seenIds.add(ad.id);
              results.push(ad);
            }
          } else {
            traverse(item, depth + 1);
          }
        }
      }
      return;
    }

    if (typeof node === 'object') {
      if (isAdObject(node)) {
        const ad = formatAdObject(node);
        if (ad && !seenIds.has(ad.id)) {
          seenIds.add(ad.id);
          results.push(ad);
        }
      } else {
        for (const key of Object.keys(node)) {
          if (['header', 'footer', 'seo', 'navigation', 'filters', 'user'].includes(key.toLowerCase())) continue;
          traverse(node[key], depth + 1);
        }
      }
    }
  }

  traverse(obj);
  return results;
}

function isAdObject(obj) {
  return (
    obj &&
    (obj.id !== undefined || obj.ad_id !== undefined) &&
    (obj.title !== undefined || obj.subject !== undefined) &&
    (obj.price !== undefined || obj.price_value !== undefined || obj.displayPrice !== undefined)
  );
}

function formatAdObject(item) {
  const id = item.id || item.ad_id || item.itemId;
  if (!id) return null;

  const title = item.title || item.subject || 'PlayStation 5';
  
  let price = 'غير محدد';
  if (item.price) {
    if (typeof item.price === 'object') {
      price = `${item.price.value || item.price.display || ''} EGP`.trim();
    } else {
      price = `${item.price} EGP`;
    }
  } else if (item.price_value !== undefined) {
    price = `${item.price_value} EGP`;
  } else if (item.displayPrice) {
    price = item.displayPrice;
  }

  let location = 'مصر';
  if (item.location) {
    if (typeof item.location === 'string') location = item.location;
    else if (item.location.name) location = item.location.name;
    else if (item.location.city) location = `${item.location.city}${item.location.sub_city ? ' - ' + item.location.sub_city : ''}`;
  } else if (item.city) {
    location = typeof item.city === 'object' ? item.city.name : item.city;
  }

  let url = '';
  if (item.url) {
    url = item.url.startsWith('http') ? item.url : `https://www.dubizzle.com.eg${item.url}`;
  } else if (item.slug) {
    url = `https://www.dubizzle.com.eg/en/ad/${item.slug}-ID${id}.html`;
  } else {
    url = `https://www.dubizzle.com.eg/en/ad/${id}`;
  }

  let imageUrl = null;
  if (item.images && Array.isArray(item.images) && item.images.length > 0) {
    imageUrl = item.images[0].url || item.images[0].external_url || item.images[0];
  } else if (item.photos && Array.isArray(item.photos) && item.photos.length > 0) {
    imageUrl = item.photos[0].url || item.photos[0];
  }

  const description = item.description || item.body || '';

  return {
    id: String(id),
    title,
    price,
    location,
    url,
    imageUrl,
    description
  };
}
