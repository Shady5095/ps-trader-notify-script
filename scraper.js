import { CONFIG } from './config.js';

/**
 * Searches Dubizzle Egypt for ads matching a given keyword across all categories.
 * @param {string} keyword 
 * @returns {Promise<Array>} List of extracted ad objects
 */
export async function searchDubizzle(keyword) {
  // Dubizzle keyword formatting: spaces replaced with hyphens or encoded
  const encodedQuery = encodeURIComponent(keyword.trim().replace(/\s+/g, '-'));
  
  // Search across all categories sorted by newest first
  const searchUrl = `${CONFIG.BASE_URL_EN}/ads/q-${encodedQuery}/?sorting=desc-creation`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(searchUrl, {
      headers: CONFIG.REQUEST_HEADERS,
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!response.ok) {
      // If 404 or empty results, return empty array
      if (response.status === 404) return [];
      console.warn(`[Dubizzle] Warning: HTTP ${response.status} for query "${keyword}"`);
      return [];
    }

    const html = await response.text();
    return parseAdsFromHtml(html);
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error(`[Dubizzle] Timeout fetching search for "${keyword}"`);
    } else {
      console.error(`[Dubizzle] Error fetching query "${keyword}":`, err.message);
    }
    return [];
  }
}

/**
 * Parses ad listings from Dubizzle HTML using multiple strategies:
 * 1. Next.js __NEXT_DATA__ state (richest and most accurate)
 * 2. Regular Expressions & HTML structure fallback
 */
function parseAdsFromHtml(html) {
  const ads = [];
  const seenIds = new Set();

  // Strategy 1: Check for Next.js __NEXT_DATA__
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
      if (ads.length > 0) {
        return ads;
      }
    }
  } catch (e) {
    // If JSON parsing fails, continue to HTML fallback
  }

  // Strategy 2: HTML Regex Fallback
  // Matches ad cards containing links to /ad/ or /en/ad/
  try {
    const linkRegex = /href="(\/(?:en\/|ar\/)?ad\/[^"]+)"/g;
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      const relativeUrl = match[1];
      const fullUrl = relativeUrl.startsWith('http') ? relativeUrl : `https://www.dubizzle.com.eg${relativeUrl}`;
      
      // Extract unique ID from URL (e.g. ID123456789.html or last digits)
      const idMatch = relativeUrl.match(/ID([0-9a-zA-Z]+)/i) || relativeUrl.match(/[-_](\d{6,})/);
      const id = idMatch ? idMatch[1] : relativeUrl;

      if (!seenIds.has(id)) {
        seenIds.add(id);

        // Find surrounding HTML snippet to extract title and price
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
    console.error('[Dubizzle] Error in HTML fallback parser:', err.message);
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
          // Check if item looks like an ad
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

/**
 * Heuristic check if an object represents an ad
 */
function isAdObject(obj) {
  return (
    obj &&
    (obj.id !== undefined || obj.ad_id !== undefined) &&
    (obj.title !== undefined || obj.subject !== undefined) &&
    (obj.price !== undefined || obj.price_value !== undefined || obj.displayPrice !== undefined)
  );
}

/**
 * Standardizes an ad object
 */
function formatAdObject(item) {
  const id = item.id || item.ad_id || item.itemId;
  if (!id) return null;

  const title = item.title || item.subject || 'PlayStation 5';
  
  // Format price
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

  // Location
  let location = 'مصر';
  if (item.location) {
    if (typeof item.location === 'string') location = item.location;
    else if (item.location.name) location = item.location.name;
    else if (item.location.city) location = `${item.location.city}${item.location.sub_city ? ' - ' + item.location.sub_city : ''}`;
  } else if (item.city) {
    location = typeof item.city === 'object' ? item.city.name : item.city;
  }

  // URL
  let url = '';
  if (item.url) {
    url = item.url.startsWith('http') ? item.url : `https://www.dubizzle.com.eg${item.url}`;
  } else if (item.slug) {
    url = `https://www.dubizzle.com.eg/en/ad/${item.slug}-ID${id}.html`;
  } else {
    url = `https://www.dubizzle.com.eg/en/ad/${id}`;
  }

  // Image
  let imageUrl = null;
  if (item.images && Array.isArray(item.images) && item.images.length > 0) {
    imageUrl = item.images[0].url || item.images[0].external_url || item.images[0];
  } else if (item.photos && Array.isArray(item.photos) && item.photos.length > 0) {
    imageUrl = item.photos[0].url || item.photos[0];
  }

  // Description
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

/**
 * Optionally fetches full ad page to get complete description if needed
 */
export async function fetchAdDetails(adUrl) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(adUrl, {
      headers: CONFIG.REQUEST_HEADERS,
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const html = await res.text();

    // Check description in NextData or meta description
    const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i) ||
                      html.match(/<div[^>]*data-aut-id="itemDescriptionContent"[^>]*>([\s\S]*?)<\/div>/i);
    
    return descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : '';
  } catch {
    return '';
  }
}
