import { CONFIG } from './config.js';

/**
 * Analyzes an ad using Google Gemini AI to verify if it is an authentic PlayStation 5 console
 * and not just a game disc, controller, PS4, or repair/rental service.
 * 
 * @param {Object} ad - { title, price, description, location }
 * @returns {Promise<{is_ps5_console: boolean, model: string, confidence: string, reason: string}>}
 */
export async function verifyWithGemini(ad) {
  if (!CONFIG.GEMINI_API_KEY) {
    console.warn('[Gemini AI] تحذير: لم يتم تعيين GEMINI_API_KEY في ملف .env. سيتم افتراض صحة الإعلان مبدئياً.');
    return {
      is_ps5_console: true,
      model: 'PS5 (غير مفحوص - ينقص API Key)',
      confidence: 'medium',
      reason: 'لم يتم تفعيل فحص الذكاء الاصطناعي لعدم وجود مفتاح API'
    };
  }

  const prompt = `
أنت خبير تقني متخصص في مراجعة وتدقيق إعلانات أجهزة الألعاب المستعملة والجديدة (PlayStation 5) في السوق المصري (دوبيزل / OLX).
مهمتك الصارمة هي تحديد ما إذا كان الإعلان التالي يبيع **جهاز كونسول بلايستيشن 5 حقيقي (PS5 Console)** أم لا.

بيانات الإعلان المراد فحصه:
- عنوان الإعلان: "${ad.title}"
- السعر المعروض: "${ad.price}"
- الموقع: "${ad.location}"
- الوصف الإضافي: "${ad.description || 'لا يوجد وصف تفصيلي'}"

شروط التصنيف والفلترة الصارمة:
1. يجب أن يكون المعروض هو **جهاز البلايستيشن 5 نفسه (Console)** (سواء كان PS5 العادي Fat، أو PS5 Slim، أو PS5 Pro، بنسخة الأقراص Disc أو الرقمي Digital).
2. إذا كان الإعلان يتضمن الجهاز مع ملحقات (مثل دراعين أو أسطوانات مدمجة كباقة Bundle)، فهذا **مقبول (true)** لأن الجهاز متضمن.
3. يجب استبعاد الإعلان رفضاً قاطعاً (is_ps5_console = false) في الحالات التالية:
   - إذا كان المعروض **فقط أسطوانة لعبة** (CD / Game Disc مثل فيفا أو سبايدرمان).
   - إذا كان المعروض **فقط دراع / ذراع تحكم** (DualSense Controller) بدون الجهاز.
   - إذا كان المعروض **إكسسوارات فقط** (سماعة، قاعدة تبريد، كفر، شاحن، نظارة VR).
   - إذا كان المعروض **جهاز بلايستيشن 4 (PS4)** حتى لو ذكر في العنوان "بدل بـ PS5" أو كلمات مشابهة لجلب المشاهدات.
   - إذا كان الإعلان عبارة عن **طلب شراء** (مطلوب شراء جهاز).
   - إذا كان الإعلان **خدمة إيجار** أو **مركز صيانة** أو **بيع حسابات ألعاب**.

أجب بصيغة JSON فقط وبدون أي نصوص إضافية أو markdown خارج الـ JSON:
{
  "is_ps5_console": true أو false,
  "model": "نوع الجهاز بالتحديد مثل: PS5 Slim Disc أو PS5 Fat Digital أو PS5 Pro أو غير محدد",
  "confidence": "high" أو "medium" أو "low",
  "reason": "سبب واضح ومختصر باللغة العربية يشرح سبب القبول أو الرفض"
}
`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
    
    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json'
      }
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Gemini AI] خطأ في الاستجابة (${response.status}):`, errText);
      // Fallback heuristics if API limit reached
      return fallbackTextCheck(ad);
    }

    const data = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      return fallbackTextCheck(ad);
    }

    // Clean JSON response
    const cleanedJson = candidateText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanedJson);

    return {
      is_ps5_console: Boolean(parsed.is_ps5_console),
      model: parsed.model || 'PS5',
      confidence: parsed.confidence || 'high',
      reason: parsed.reason || 'تم التحقق بنجاح عبر Gemini AI'
    };
  } catch (err) {
    console.error('[Gemini AI] استثناء أثناء الفحص:', err.message);
    return fallbackTextCheck(ad);
  }
}

/**
 * Smart heuristic rule fallback in case Gemini API is unreachable or out of quota
 */
function fallbackTextCheck(ad) {
  const combinedText = `${ad.title} ${ad.description}`.toLowerCase();

  // Negative indicators
  const negativeKeywords = [
    'دراع فقط', 'ذراع فقط', 'controller only', 'شريط', 'اسطوانة', 'أسطوانة',
    'cd', 'disc only', 'اسطوانه', 'حساب', 'العاب فقط', 'ألعاب فقط', 'مطلوب',
    'صيانة', 'ايجار', 'إيجار', 'بلايستيشن 4', 'ps4', 'playstation 4'
  ];

  for (const neg of negativeKeywords) {
    if (combinedText.includes(neg) && !combinedText.includes('مع الجهاز') && !combinedText.includes('مع كونسول')) {
      return {
        is_ps5_console: false,
        model: 'غير مطابق',
        confidence: 'medium',
        reason: `تم استبعاد الإعلان بالقواعد الاحتياطية لاحتوائه على: ${neg}`
      };
    }
  }

  return {
    is_ps5_console: true,
    model: 'PS5 (فحص احتياطي)',
    confidence: 'low',
    reason: 'تم اعتماده كإعلان محتمل بواسطة القواعد النصية الاحتياطية'
  };
}
