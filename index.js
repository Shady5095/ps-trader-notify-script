import http from 'node:http';
import { CONFIG } from './config.js';
import { fetchDubizzleVideoGames } from './scraper.js';
import { verifyWithGemini } from './gemini.js';
import { sendNotification } from './notifier.js';
import { loadSeenAds, isAdSeen, markAdAsSeen } from './storage.js';

let isRunning = false;
let runCount = 0;
let lastScanTime = 'لم يبدأ بعد';
let totalAdsFoundCount = 0;
let verifiedPs5FoundCount = 0;

/**
 * Lightweight HTTP status server for Cloud platforms (Render, Koyeb, etc.)
 * Keeps the cloud instance awake and allows checking radar status via browser
 */
function startHealthCheckServer() {
  const port = process.env.PORT || 3000;
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8">
        <title>رادار PS5 مصر - دوبيزل</title>
        <style>
          body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { background: #1e293b; padding: 2rem; border-radius: 1rem; box-shadow: 0 10px 25px rgba(0,0,0,0.5); text-align: center; max-width: 450px; border: 1px solid #334155; }
          .status { color: #22c55e; font-size: 1.25rem; font-weight: bold; margin-bottom: 1rem; }
          .stat-box { background: #0f172a; padding: 0.75rem; border-radius: 0.5rem; margin: 0.5rem 0; text-align: right; }
          .badge { background: #3b82f6; color: white; padding: 0.2rem 0.5rem; border-radius: 0.25rem; font-size: 0.85rem; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>🎮 رادار PS5 دوبيزل مصر</h1>
          <div class="status">🟢 الاسكربت يعمل بنجاح في السحابة 24/7</div>
          <div class="stat-box">⏱️ <b>فترة التحديث:</b> كل ${CONFIG.CHECK_INTERVAL_MINUTES} دقائق</div>
          <div class="stat-box">🔄 <b>عدد دورات الفحص:</b> #${runCount}</div>
          <div class="stat-box">🕒 <b>آخر دورة فحص:</b> ${lastScanTime}</div>
          <div class="stat-box">🤖 <b>حالة Gemini AI:</b> <span class="badge">${CONFIG.GEMINI_MODEL}</span></div>
          <div class="stat-box">📱 <b>إشعارات تليجرام:</b> ${CONFIG.TELEGRAM_BOT_TOKEN ? '✅ متصل' : '⚠️ غير محدد'}</div>
        </div>
      </body>
      </html>
    `);
  });

  server.listen(port, () => {
    console.log(`[Cloud Server] خادم الويب السحابي يعمل على البورت: ${port}`);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function printBanner() {
  console.log('================================================================');
  console.log('🎮 رادار دوبيزل مصر لأجهزة PlayStation 5 (الوضع الهادئ السحابي)');
  console.log('================================================================');
  console.log(`⏱️  فترة التحديث: كل ${CONFIG.CHECK_INTERVAL_MINUTES} دقائق`);
  console.log(`🎯 المستهدف: قسم ألعاب الفيديو (Video Games & Consoles) الأحدث`);
  console.log(`🔑 حالة Gemini AI: ${CONFIG.GEMINI_API_KEY ? '✅ متصل (' + CONFIG.GEMINI_MODEL + ')' : '⚠️ غير محدد في .env'}`);
  console.log(`📱 إشعارات تليجرام: ${CONFIG.TELEGRAM_BOT_TOKEN ? '✅ مفعلة' : '⚠️ غير محددة'}`);
  console.log('================================================================\n');
}

/**
 * Executes a single stealth search cycle on Video Games category
 */
async function performScanCycle() {
  if (isRunning) {
    console.log('[Scheduler] دورة فحص سابقة لا تزال تعمل، سيتم تأجيل الدورة الحالية.');
    return;
  }

  isRunning = true;
  runCount++;
  const cycleStartTime = new Date();
  lastScanTime = cycleStartTime.toLocaleTimeString('ar-EG');
  console.log(`\n------------------------------------------------------------`);
  console.log(`🚀 بدء دورة الفحص رقم #${runCount} [${lastScanTime}]`);
  console.log(`------------------------------------------------------------`);

  const seenAds = loadSeenAds();
  const isFirstRun = seenAds.size === 0;

  if (isFirstRun) {
    console.log(`[Radar] ℹ️ التشغيل الأول للمشروع: سيتم فهرسة الإعلانات الحالية كقاعدة بيانات`);
    if (!CONFIG.ALERT_ON_INITIAL_RUN) {
      console.log(`[Radar] لن يتم إرسال إشعارات للإعلانات القديمة. الإشعارات ستبدأ فور نزول أي إعلان جديد.`);
    }
  }

  let newAdsCount = 0;
  let validPs5Count = 0;

  console.log(`🔍 جلب أحدث إعلانات قسم ألعاب الفيديو من دوبيزل...`);
  const ads = await fetchDubizzleVideoGames();
  totalAdsFoundCount += ads.length;

  for (const ad of ads) {
    if (!isAdSeen(ad.id)) {
      newAdsCount++;
      // Immediately record ad as seen so concurrent searches don't duplicate
      markAdAsSeen(ad.id);

      console.log(`\n🆕 تم العثور على إعلان جديد في قسم ألعاب الفيديو:`);
      console.log(`   📌 العنوان: ${ad.title}`);
      console.log(`   💰 السعر: ${ad.price}`);
      console.log(`   📍 الموقع: ${ad.location}`);

      // If it's the very first run and user disabled alerting for existing ads
      if (isFirstRun && !CONFIG.ALERT_ON_INITIAL_RUN) {
        console.log(`   💾 تم تسجيله في القاعدة بدون إرسال إشعار (التشغيل الأولي).`);
        continue;
      }

      // Verify with Gemini AI
      console.log(`   🤖 جاري إرسال الإعلان لـ Gemini AI لتحديد إذا كان كونسول PS5 حقيقي أم لا...`);
      const aiResult = await verifyWithGemini(ad);

      if (aiResult.is_ps5_console) {
        validPs5Count++;
        verifiedPs5FoundCount++;
        console.log(`   🎮 وجدنا جهاز PS5 حقيقي! [${aiResult.model}]`);
        console.log(`   💡 تقييم AI: ${aiResult.reason}`);
        console.log(`   📲 جاري إرسال إشعار فوري إلى تليجرام...`);
        await sendNotification(ad, aiResult);
      } else {
        console.log(`   ❌ استبعاد: ${aiResult.reason}`);
      }
    }
  }

  const durationSec = Math.round((Date.now() - cycleStartTime.getTime()) / 1000);
  console.log(`\n🏁 انتهاء دورة الفحص #${runCount} في ${durationSec} ثانية.`);
  console.log(`📊 الإحصائيات:`);
  console.log(`   - إعلانات PS5 المكتشفة في هذه الدورة: ${ads.length}`);
  console.log(`   - إعلانات جديدة لم ترها من قبل: ${newAdsCount}`);
  console.log(`   - أجهزة PS5 معتمدة وتم إشعارها: ${validPs5Count}`);
  console.log(`⏳ الفحص القادم بعد ${CONFIG.CHECK_INTERVAL_MINUTES} دقائق...`);

  isRunning = false;
}

async function main() {
  printBanner();
  startHealthCheckServer();

  // Run immediately on launch
  await performScanCycle();

  // Schedule to run every N minutes
  const intervalMs = CONFIG.CHECK_INTERVAL_MINUTES * 60 * 1000;
  setInterval(async () => {
    try {
      await performScanCycle();
    } catch (err) {
      console.error('[Scheduler] خطأ غير متوقع أثناء دورة الفحص:', err);
      isRunning = false;
    }
  }, intervalMs);
}

// Handle termination signals
process.on('SIGINT', () => {
  console.log('\n\n👋 تم إيقاف الاسكربت بنجاح.');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n👋 تم إيقاف الاسكربت بنجاح.');
  process.exit(0);
});

main().catch(err => {
  console.error('[Fatal Error] فشل بدء الاسكربت:', err);
});
