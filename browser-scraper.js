import puppeteer from 'puppeteer-core';
import { CONFIG } from './config.js';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

/**
 * Scrapes Dubizzle using real local Google Chrome browser
 * (headless: false off-screen) to completely bypass PerimeterX / Cloudflare.
 */
export async function scrapeWithBrowser() {
  console.log('🌐 جاري فتح دوبيزل عبر محرك Chrome المحلي (Stealth Mode)...');

  let browser = null;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1280,800'
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    await page.goto(CONFIG.TARGET_CATEGORY_URL, {
      waitUntil: 'networkidle2',
      timeout: 45000
    });

    // Wait 5 seconds for all listings to fully mount
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Extract all ads from the page
    const ads = await page.evaluate(() => {
      const items = [];
      const seen = new Set();

      const links = Array.from(document.querySelectorAll('a')).filter(a => a.href && a.href.includes('/ad/'));
      for (const a of links) {
        const href = a.href;
        const match = href.match(/\/ad\/(.*?)-ID(\d+)\.html/i) || href.match(/[-_](\d{6,})/);
        const id = match ? (match[2] || match[1]) : href;

        if (!seen.has(id) && href.includes('/ad/')) {
          seen.add(id);

          // Get title from URL slug or link text or title attribute
          let title = '';
          const slugMatch = href.match(/\/ad\/(.*?)-ID\d+\.html/i);
          if (slugMatch && slugMatch[1]) {
            try {
              title = decodeURIComponent(slugMatch[1]).replace(/-/g, ' ');
            } catch {
              title = slugMatch[1].replace(/-/g, ' ');
            }
          }

          if (!title || title.length < 3) {
            title = a.getAttribute('title') || a.getAttribute('aria-label') || (a.innerText || '').split('\n')[0] || 'إعلان بلايستيشن';
          }

          // Price and location from card container
          const container = a.closest('article, li, [aria-label="Listing"], div') || a;
          const containerText = container.innerText || '';
          
          const priceMatch = containerText.match(/([\d,]+)\s*(?:EGP|ج\.م|جنيه)/i) || 
                             containerText.match(/(?:EGP|ج\.م|جنيه)\s*([\d,]+)/i);
          const price = priceMatch ? priceMatch[1] + ' EGP' : 'غير محدد';

          items.push({
            id: String(id),
            title: title.trim(),
            price,
            location: 'مصر (دوبيزل)',
            url: href,
            description: containerText.slice(0, 300)
          });
        }
      }

      return items;
    });

    console.log(`[Browser Scraper] ✅ نجح استخراج ${ads.length} إعلان حقيقي من دوبيزل بدون أي حظر!`);
    return ads;
  } catch (err) {
    console.error('[Browser Scraper] خطأ:', err.message);
    return [];
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
