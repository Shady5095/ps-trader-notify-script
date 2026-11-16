import puppeteer from 'puppeteer-core';
import { CONFIG } from './config.js';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

/**
 * Scrapes Dubizzle using real local Google Chrome browser
 * to easily bypass Cloudflare and PerimeterX 503 challenges.
 */
export async function scrapeWithBrowser() {
  console.log('🌐 جاري فتح دوبيزل عبر متصفح Chrome المحلي لتخطي فحص الأمان...');

  let browser = null;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: 'new', // Runs invisibly in the background
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1366,768'
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');

    await page.goto(CONFIG.TARGET_CATEGORY_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 45000
    });

    // Wait 5 seconds for page data and Next.js to render
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Extract listings directly from page DOM
    const ads = await page.evaluate(() => {
      const items = [];
      const seen = new Set();

      // Strategy 1: Check NextData script tag
      const nextDataEl = document.querySelector('#__NEXT_DATA__');
      if (nextDataEl && nextDataEl.textContent) {
        try {
          const json = JSON.parse(nextDataEl.textContent);
          // Helper to find ads recursively
          function findAds(obj, depth = 0) {
            if (!obj || depth > 7) return;
            if (Array.isArray(obj)) {
              for (const it of obj) {
                if (it && (it.id || it.itemId) && (it.title || it.subject)) {
                  const id = String(it.id || it.itemId);
                  if (!seen.has(id)) {
                    seen.add(id);
                    items.push({
                      id,
                      title: it.title || it.subject || 'PlayStation 5',
                      price: (it.price ? (typeof it.price === 'object' ? it.price.value : it.price) : 'غير محدد') + ' EGP',
                      location: it.location?.name || it.city?.name || 'مصر',
                      url: it.slug ? `https://www.dubizzle.com.eg/en/ad/${it.slug}-ID${id}.html` : `https://www.dubizzle.com.eg/en/ad/${id}`,
                      description: it.description || ''
                    });
                  }
                } else if (typeof it === 'object') {
                  findAds(it, depth + 1);
                }
              }
              return;
            }
            if (typeof obj === 'object') {
              for (const k of Object.keys(obj)) {
                if (['header', 'footer', 'seo', 'navigation', 'filters', 'user'].includes(k.toLowerCase())) continue;
                findAds(obj[k], depth + 1);
              }
            }
          }
          findAds(json);
        } catch {}
      }

      // Strategy 2: Fallback to DOM elements if NextData was empty
      if (items.length === 0) {
        const adLinks = document.querySelectorAll('a[href*="/ad/"]');
        for (const a of adLinks) {
          const href = a.getAttribute('href') || '';
          const idMatch = href.match(/ID([0-9a-zA-Z]+)/i) || href.match(/[-_](\d{6,})/);
          const id = idMatch ? idMatch[1] : href;

          if (!seen.has(id) && href.includes('/ad/')) {
            seen.add(id);
            const fullUrl = href.startsWith('http') ? href : `https://www.dubizzle.com.eg${href}`;
            const title = a.getAttribute('title') || a.getAttribute('aria-label') || a.innerText.split('\n')[0] || 'إعلان بلايستيشن';
            
            // Look for price inside the card
            const cardText = a.closest('article, div[aria-label="Listing"], li') || a;
            const priceMatch = (cardText.innerText || '').match(/([\d,]+)\s*(?:EGP|ج\.م|جنيه)/i);
            
            items.push({
              id: String(id),
              title: title.trim(),
              price: priceMatch ? priceMatch[1] + ' EGP' : 'غير محدد',
              location: 'مصر',
              url: fullUrl,
              description: ''
            });
          }
        }
      }

      return items;
    });

    console.log(`[Browser Scraper] تم استخراج ${ads.length} إعلان بنجاح من دوبيزل!`);
    return ads;
  } catch (err) {
    console.error('[Browser Scraper] استثناء أثناء فتح المتصفح:', err.message);
    return [];
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
