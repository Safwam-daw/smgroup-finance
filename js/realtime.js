/**
 * realtime.js — SM-Group v5.2
 * إشعارات فورية عبر Supabase Realtime
 */

const Realtime = (() => {
  const SUPABASE_URL = DB_CONFIG.url;
  const SUPABASE_KEY = DB_CONFIG.key;
  let _channel = null;
  let _onTxn   = null;
  let _onAcc   = null;

  function start(onTxn, onAcc) {
    _onTxn = onTxn;
    _onAcc = onAcc;
    const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    _channel = sb.channel('smgroup-live')
      .on('postgres_changes',
        { event:'INSERT', schema:'public', table:'transactions' },
        payload => {
          const t = payload.new;
          const user = Auth.getUser()?.user;
          // لا تُظهر الإشعار للموظف الذي أجرى العملية
          if (t.by === user) return;
          const labels = { dep:'إيداع', wit:'سحب', trf:'تحويل', fee:'عمولة' };
          const sym    = t.cur==='usd'?'$':'€';
          UI.toast(`🔔 ${labels[t.type]||t.type}: ${sym}${parseFloat(t.amt).toFixed(2)} — بواسطة ${t.by}`, 'success');
          if (_onTxn) _onTxn(t);
        }
      )
      .on('postgres_changes',
        { event:'*', schema:'public', table:'accounts' },
        payload => {
          if (_onAcc) _onAcc(payload.new || payload.old);
        }
      )
      .subscribe(status => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Real-time متصل');
        }
      });
  }

  function stop() {
    if (_channel) { _channel.unsubscribe(); _channel = null; }
  }

  return { start, stop };
})();
