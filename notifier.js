import { CONFIG } from './config.js';

/**
 * Sends a notification to mobile via Telegram Bot and/or ntfy.sh
 * @param {Object} ad - Ad object
 * @param {Object} aiResult - AI verification result
 */
export async function sendNotification(ad, aiResult) {
  let sentAny = false;

  // 1. Send via Telegram Bot (if configured)
  if (CONFIG.TELEGRAM_BOT_TOKEN && CONFIG.TELEGRAM_CHAT_ID) {
    try {
      await sendTelegramAlert(ad, aiResult);
      sentAny = true;
    } catch (err) {
      console.error('[Notifier] خطأ في إرسال إشعار تليجرام:', err.message);
    }
  }

  // 2. Send via ntfy.sh (if configured)
  if (CONFIG.NTFY_TOPIC) {
    try {
      await sendNtfyAlert(ad, aiResult);
      sentAny = true;
    } catch (err) {
      console.error('[Notifier] خطأ في إرسال إشعار ntfy:', err.message);
    }
  }

  if (!sentAny) {
    console.log(`[Notifier] 🔔 إشعار محلي (لم يتم ضبط تليجرام أو ntfy بعد في ملف .env):`);
    console.log(`  - الجهاز: ${ad.title}`);
    console.log(`  - السعر: ${ad.price}`);
    console.log(`  - المكان: ${ad.location}`);
    console.log(`  - تقييم الذكاء الاصطناعي: ${aiResult.model} (${aiResult.reason})`);
    console.log(`  - الرابط: ${ad.url}\n`);
  }
}

/**
 * Sends rich formatted alert to Telegram
 */
async function sendTelegramAlert(ad, aiResult) {
  const message = 
`🎮 *تم العثور على بلايستيشن 5 جديد في دوبيزل!*

📌 *العنوان:* ${escapeMarkdown(ad.title)}
💰 *السعر:* \`${escapeMarkdown(ad.price)}\`
📍 *المكان:* ${escapeMarkdown(ad.location)}
🤖 *تحليل Gemini:* ${escapeMarkdown(aiResult.model)}
💡 *السبب:* _${escapeMarkdown(aiResult.reason)}_

🔗 [اضغط هنا لفتح الإعلان مباشرة في دوبيزل](${ad.url})`;

  const telegramUrl = `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage`;
  
  const payload = {
    chat_id: CONFIG.TELEGRAM_CHAT_ID,
    text: message,
    parse_mode: 'Markdown',
    disable_web_page_preview: false
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  const res = await fetch(telegramUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: controller.signal
  });
  clearTimeout(timeout);

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Telegram API responded with ${res.status}: ${errText}`);
  }

  console.log(`[Notifier] ✅ تم إرسال إشعار تليجرام بنجاح: "${ad.title}"`);
}

/**
 * Sends push notification via ntfy.sh (Free push alerts to Android/iOS)
 */
async function sendNtfyAlert(ad, aiResult) {
  const ntfyUrl = `https://ntfy.sh/${encodeURIComponent(CONFIG.NTFY_TOPIC)}`;
  
  const body = `السعر: ${ad.price} | المكان: ${ad.location}\nتحليل AI: ${aiResult.model}\n${aiResult.reason}`;

  const res = await fetch(ntfyUrl, {
    method: 'POST',
    headers: {
      'Title': `🎮 PS5 جديد على دوبيزل: ${ad.title}`,
      'Priority': 'urgent',
      'Tags': 'video_game,moneybag',
      'Click': ad.url,
      'Actions': `view, فتح الإعلان, ${ad.url}`
    },
    body: body
  });

  if (!res.ok) {
    throw new Error(`ntfy.sh responded with ${res.status}`);
  }

  console.log(`[Notifier] ✅ تم إرسال إشعار ntfy بنجاح: "${ad.title}"`);
}

/**
 * Escapes characters reserved by Telegram Markdown V1
 */
function escapeMarkdown(text) {
  if (!text) return '';
  return String(text)
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/`/g, '\\`')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}
