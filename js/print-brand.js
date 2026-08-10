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
    return supabase.createClient(DB_CONFIG.url, DB_CONFIG.key);
  }

  async function getAssets() {
    if (_cache) return _cache;
    try {
      const { data } = await _sb().from('print_assets').select('*').single();
      _cache = data || {};
    } catch (e) { _cache = {}; }
    return _cache;
  }

  async function saveAssets(fields) {
    const sb = _sb();
    const { data: ex } = await sb.from('print_assets').select('id').single();
    let error;
    const payload = { ...fields, updated_at: new Date().toISOString() };
    if (ex) {
      ({ error } = await sb.from('print_assets').update(payload).eq('id', ex.id));
    } else {
      ({ error } = await sb.from('print_assets').insert(payload));
    }
    if (!error) _cache = null; // إجبار إعادة الجلب بالمرة القادمة
    return !error;
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
const DEFAULT_RECONCILIATION_MSG =
`*📊 كشف مطابقة أرصدة*
*{company_name}*

🏦 الحساب: {account_name}
🔖 الكود: {account_code}
🕐 التاريخ: {date}

━━━━━━━━━━━━━━━

💵 دولار (USD): _____________

💶 يورو (EUR): _____________

━━━━━━━━━━━━━━━

يُرجى مراجعة الأرصدة أعلاه والرد بالتأكيد.
شاكرين لكم حسن تعاونكم 🙏`;

  async function getReconciliationTemplate() {
    const a = await getAssets();
    return a.reconciliation_msg || DEFAULT_RECONCILIATION_MSG;
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
    DEFAULT_RECONCILIATION_MSG, getReconciliationTemplate, saveReconciliationTemplate, fillTemplate
  };
})();
