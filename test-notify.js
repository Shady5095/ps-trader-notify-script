import { CONFIG } from './config.js';
import { sendNotification } from './notifier.js';

console.log('====================================================');
console.log('📱 اختبار إرسال إشعار تجريبي للموبايل');
console.log('====================================================');

const sampleAd = {
  id: 'test_123456',
  title: 'PlayStation 5 Slim 1TB Disc Edition - إعلان تجريبي',
  price: '28,500 EGP',
  location: 'مصر الجديدة، القاهرة',
  url: 'https://www.dubizzle.com.eg/en/',
  description: 'جهاز تجريبي لاختبار وصول الإشعار لهاتفك بنجاح.'
};

const sampleAiResult = {
  is_ps5_console: true,
  model: 'PS5 Slim Disc Edition',
  confidence: 'high',
  reason: 'تم التأكد عبر Gemini AI بنجاح - هذا إشعار تجريبي'
};

async function testAlert() {
  if (!CONFIG.TELEGRAM_BOT_TOKEN && !CONFIG.NTFY_TOPIC) {
    console.warn('⚠️ لم يتم ضبط TELEGRAM_BOT_TOKEN أو NTFY_TOPIC في ملف .env');
    console.log('يرجى فتح ملف .env وإضافة بيانات التليجرام أو موضوع ntfy.');
  }

  console.log('🚀 جاري إرسال الإشعار الآن...');
  await sendNotification(sampleAd, sampleAiResult);
  console.log('====================================================\n');
}

testAlert();
