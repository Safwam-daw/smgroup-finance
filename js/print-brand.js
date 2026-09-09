/**
 * print-brand.js — SM-Group v1.0
 * الشعار/الختم/التوقيع المستخدمة في كل المستندات المطبوعة
 * (كشوفات الحساب، بوابة العميل، التقارير، الحسابات المؤرشفة)
 *
 * ⚠️ يجب تحميله بعد js/db-config.js وقبل استخدام أي دالة هنا.
 */

const PrintBrand = (() => {

  let _cache = null; // { logo_data, stamp_data, signature_data }

  function _sb() {
    return supabase.createClient(DB_CONFIG.url, DB_CONFIG.key, {
      global: {
        headers: {
          'x-app-role': DB_CONFIG.appRole
        }
      }
    });
  }

  async function getAssets() {
    if (_cache) return _cache;
    try {
      const { data } = await _sb().from('print_assets').select('*').maybeSingle();
      _cache = data || {};
    } catch (e) { _cache = {}; }
    return _cache;
  }

  async function saveAssets(fields) {
    const sb = _sb();
    const { data: ex } = await sb.from('print_assets').select('id').maybeSingle();
    let error;
    const payload = { ...fields, updated_at: new Date().toISOString() };
    if (ex) {
      ({ error } = await sb.from('print_assets').update(payload).eq('id', ex.id));
    } else {
      ({ error } = await sb.from('print_assets').insert(payload));
    }
    if (!error) _cache = null; // إجبار إعادة الجلب بالمرة القادمة
    else console.error('PrintBrand.saveAssets:', error);
    // نُرجع كائناً كاملاً (لا true/false فقط) ليتمكن كل زر حفظ من
    // عرض رسالة الخطأ الحقيقية القادمة من Supabase عند الفشل، بدل
    // "خطأ" عامة لا تكشف السبب الفعلي
    return { ok: !error, error: error ? (error.message || String(error)) : null };
  }

  function invalidate() { _cache = null; }

  // ── الشعار (أعلى المستند) ────────────────────────────────
  // يُدرج <img> داخل عنصر بالمعرّف المُعطى إن وُجد شعار مرفوع،
  // وإلا يترك محتوى العنصر كما هو (النص الحالي/الاسم النصي).
  async function injectLogo(elId, maxHeight = 64) {
    const a  = await getAssets();
    const el = document.getElementById(elId);
    if (el && a.logo_data) {
      el.innerHTML = `<img src="${a.logo_data}" alt="logo"
        style="max-height:${maxHeight}px;max-width:240px;object-fit:contain;display:block;margin:0 auto 8px;">`;
    }
  }

  // نفس الفكرة لكن تُرجع HTML بدل الإدراج المباشر — لبناء نوافذ
  // طباعة منفصلة (مثل نافذة طباعة السجل المؤرشف في reports.html)
  async function logoHTML(maxHeight = 64) {
    const a = await getAssets();
    if (!a.logo_data) return '';
    return `<img src="${a.logo_data}" alt="logo"
      style="max-height:${maxHeight}px;max-width:240px;object-fit:contain;display:block;margin:0 auto 8px;">`;
  }

  // ── الختم والتوقيع (أسفل المستند) ────────────────────────
  // بلا أي خلفية أو إطار حول الصورة نفسها — الصورة الشفافة تُعرض
  // مباشرة فوق خلفية الورقة البيضاء لتبدو كأنها وُقّعت/خُتمت يدوياً.
  function _signatureBlock(a) {
    if (!a.stamp_data && !a.signature_data) return '';
    return `
      <div style="display:flex;justify-content:space-between;align-items:flex-end;
                  margin-top:36px;gap:24px;">
        <div style="text-align:center;min-width:130px;flex:1;">
          ${a.signature_data
            ? `<img src="${a.signature_data}" alt="signature" style="max-height:56px;max-width:170px;object-fit:contain;">`
            : `<div style="height:56px;"></div>`}
          <div style="border-top:1px solid #999;margin-top:4px;padding-top:3px;font-size:0.68rem;color:#666;">التوقيع</div>
        </div>
        <div style="text-align:center;min-width:130px;flex:1;">
          ${a.stamp_data
            ? `<img src="${a.stamp_data}" alt="stamp" style="max-height:80px;max-width:120px;object-fit:contain;">`
            : `<div style="height:80px;"></div>`}
          <div style="border-top:1px solid #999;margin-top:4px;padding-top:3px;font-size:0.68rem;color:#666;">الختم الرسمي</div>
        </div>
      </div>`;
  }

  async function signatureBlockHTML() {
    const a = await getAssets();
    return _signatureBlock(a);
  }

  // يُدرج كتلة التوقيع/الختم داخل عنصر بالمعرّف المُعطى (لو موجود)
  async function injectSignatureBlock(elId) {
    const el = document.getElementById(elId);
    if (!el) return;
    const html = await signatureBlockHTML();
    if (html) el.innerHTML = html;
  }

  // ── رسالة مطابقة الأرصدة ──────────────────────────────────
  // قالب لكل لغة مدعومة (ar/en/tr) بدل نص عربي ثابت واحد.
  // {balances_block} عنصر نائب ديناميكي: سطر واحد لكل عملة مفعّلة
  // حالياً (يُبنى في fillReconciliationBalances أدناه)، بدل
  // {balance_usd}/{balance_eur} الثابتين سابقاً — يبقيان مدعومين
  // أيضاً لأي قالب مخصص قديم حفظه المستخدم يستخدمهما تحديداً.
  const DEFAULT_RECONCILIATION_MSG = {
    ar:
`*📊 كشف مطابقة أرصدة*
*{company_name}*

🏦 الحساب: {account_name}
🔖 الكود: {account_code}
🕐 التاريخ: {date}

━━━━━━━━━━━━━━━

{balances_block}

━━━━━━━━━━━━━━━

يُرجى مراجعة الأرصدة أعلاه والرد بالتأكيد.
شاكرين لكم حسن تعاونكم 🙏`,
    en:
`*📊 Balance Reconciliation Statement*
*{company_name}*

🏦 Account: {account_name}
🔖 Code: {account_code}
🕐 Date: {date}

━━━━━━━━━━━━━━━

{balances_block}

━━━━━━━━━━━━━━━

Please review the balances above and reply to confirm.
Thank you for your cooperation 🙏`,
    tr:
`*📊 Bakiye Mutabakat Ekstresi*
*{company_name}*

🏦 Hesap: {account_name}
🔖 Kod: {account_code}
🕐 Tarih: {date}

━━━━━━━━━━━━━━━

{balances_block}

━━━━━━━━━━━━━━━

Lütfen yukarıdaki bakiyeleri kontrol edip onaylayınız.
İş birliğiniz için teşekkür ederiz 🙏`
  };

  // اسم العملة المعروض في السطر (نفس منطق fmtBal القديم: موجب = "لكم"،
  // سالب = "لنا") مترجم حسب اللغة الحالية.
  const _BAL_WORDS = {
    ar: { owe_them: 'لكم', owe_us: 'لنا' },
    en: { owe_them: 'you owe', owe_us: 'owed to you' },
    tr: { owe_them: 'borcunuz', owe_us: 'alacağınız' }
  };

  function _fmtBalWord(n, lang, formatAmount) {
    const words = _BAL_WORDS[lang] || _BAL_WORDS.ar;
    const fmt = formatAmount || (v => v.toFixed(2));
    if (n === 0) return fmt(0);
    return n < 0 ? `${words.owe_us} ${fmt(Math.abs(n))}` : `${words.owe_them} ${fmt(n)}`;
  }

  // الذهب/الفضة تُخزَّن بالجرام (وليس بقيمة نقدية) — يُعرض بالكيلوغرام
  // تلقائياً إذا بلغت الكمية 1000 جرام فأكثر (1000 جرام = 1 كيلو)
  function _fmtGramsAmount(v) {
    return v >= 1000 ? (v/1000).toFixed(2) + ' kg' : v.toFixed(2) + ' g';
  }

  // يبني سطر أرصدة ديناميكي لكل عملة مفعّلة حالياً (بدل usd/eur فقط)
  // balances: [{ code, symbol, value }]
  function buildBalancesBlock(balances, lang) {
    const emoji = { usd: '💵', eur: '💶', try: '💴', gbp: '💷', gold: '🥇', silver: '🥈' };
    // رموز البورصة المتعارفة للمعادن — تختلف عن code الداخلي (GOLD/SILVER)
    // المستخدم فقط لربط عمود bal_gold/bal_silver في قاعدة البيانات
    const TRADE_SYMBOL = { gold: 'XAU', silver: 'XAG' };
    return balances.map(b => {
      const codeLower = b.code.toLowerCase();
      const icon = emoji[codeLower] || '💰';
      if (TRADE_SYMBOL[codeLower]) {
        return `${icon} ${TRADE_SYMBOL[codeLower]}: ${_fmtBalWord(b.value, lang, _fmtGramsAmount)}`;
      }
      return `${icon} ${b.code.toUpperCase()}: ${_fmtBalWord(b.value, lang)}${b.symbol}`;
    }).join('\n\n');
  }

  async function getReconciliationTemplate(lang) {
    const a = await getAssets();
    if (a.reconciliation_msg) return a.reconciliation_msg; // تخصيص المستخدم يبقى كما هو بغض النظر عن اللغة
    return DEFAULT_RECONCILIATION_MSG[lang] || DEFAULT_RECONCILIATION_MSG.ar;
  }

  async function saveReconciliationTemplate(text) {
    return saveAssets({ reconciliation_msg: text });
  }

  // يستبدل العناصر النائبة {name} بالقيم الفعلية في القالب
  function fillTemplate(template, values) {
    return template.replace(/\{(\w+)\}/g, (m, key) =>
      Object.prototype.hasOwnProperty.call(values, key) ? values[key] : m
    );
  }

  return {
    getAssets, saveAssets, invalidate,
    injectLogo, logoHTML,
    signatureBlockHTML, injectSignatureBlock,
    DEFAULT_RECONCILIATION_MSG, getReconciliationTemplate, saveReconciliationTemplate, fillTemplate,
    buildBalancesBlock
  };
})();
