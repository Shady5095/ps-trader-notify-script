import { CONFIG } from './config.js';
import { verifyWithGemini } from './gemini.js';

console.log('====================================================');
console.log('🧪 اختبار الاتصال بـ Google Gemini AI والتحقق الذكي');
console.log('====================================================');

if (!CONFIG.GEMINI_API_KEY) {
  console.error('❌ تنبيه: لم يتم كتابة GEMINI_API_KEY في ملف .env');
  console.log('يرجى الحصول على مفتاح مجاني من: https://aistudio.google.com/app/apikey');
  process.exit(1);
}

const testCases = [
  {
    name: 'حالة 1: جهاز كونسول حقيقي (يجب قبوله ✅)',
    ad: {
      title: 'بلايستيشن 5 سليم ديجيتال بالكرتونة والضمان كسر زيرو',
      price: '27,000 EGP',
      location: 'مدينة نصر، القاهرة',
      description: 'جهاز ps5 slim digital استعمال اسبوعين مع دراعه الاصلي وكل كابلاته والكرتونة.'
    }
  },
  {
    name: 'حالة 2: أسطوانة ألعاب فقط (يجب رفضه ❌)',
    ad: {
      title: 'اسطوانة فيفا 24 بلايستيشن 5 ps5 fc24',
      price: '1,800 EGP',
      location: 'المعادي، القاهرة',
      description: 'شريط فيفا ٢٤ بحالة ممتازة بدون خدوش لجهاز ps5'
    }
  },
  {
    name: 'حالة 3: ذراع تحكم فقط بدون جهاز (يجب رفضه ❌)',
    ad: {
      title: 'دراع بلايستيشن 5 اصلي كسر زيرو لون ابيض Dualsense',
      price: '3,200 EGP',
      location: 'الدقي، الجيزة',
      description: 'يد تحكم ps5 controller اصلية بدون اي عيوب دراع فقط'
    }
  },
  {
    name: 'حالة 4: جهاز PS4 وليس PS5 (يجب رفضه ❌)',
    ad: {
      title: 'بلايستيشن 4 برو 1 تيرا معدل او للبدل ب ps5 ودفع الفرق',
      price: '12,000 EGP',
      location: 'الاسكندرية',
      description: 'جهاز ps4 pro مهكر مع العاب'
    }
  }
];

async function runTests() {
  for (const tc of testCases) {
    console.log(`\n----------------------------------------------------`);
    console.log(`📌 ${tc.name}`);
    console.log(`   العنوان: "${tc.ad.title}"`);
    console.log(`   السعر: ${tc.ad.price}`);
    
    const result = await verifyWithGemini(tc.ad);
    
    console.log(`   📊 النتيجة: ${result.is_ps5_console ? '✅ مقبول كجهاز كونسول PS5' : '❌ مستبعد (ليس كونسول)'}`);
    console.log(`   🏷️  الموديل: ${result.model}`);
    console.log(`   💡 السبب: ${result.reason}`);
  }

  console.log('\n====================================================');
  console.log('🎉 اكتمل اختبار Gemini AI بنجاح!');
  console.log('====================================================\n');
}

runTests();
