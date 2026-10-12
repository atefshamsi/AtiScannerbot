'use strict';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmt = n => Number.isFinite(Number(n)) ? Number(n).toLocaleString('en-US', {maximumFractionDigits:8}) : '—';
const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
function start({port, token, allowedUserId = '', botMode = false}) {
  const api = (method, body = {}) => fetch('https://api.telegram.org/bot' + token + '/' + method, {
    method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body), signal:AbortSignal.timeout(25000)
  }).then(async r => { const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.description || ('Telegram API ' + r.status)); return d.result; });
  const local = async (route, body) => {
    const r = await fetch('http://127.0.0.1:' + port + route, {method:body?'POST':'GET',headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000)});
    const d = await r.json(); if (!r.ok) throw new Error(d.error || ('Scanner API ' + r.status)); return d;
  };
  const keyboard = {keyboard:[[{text:'▶️ شروع اسکن'},{text:'⏹ توقف اسکن'}],[{text:'📊 وضعیت'},{text:'📡 سیگنال‌ها'}],[{text:'⭐ علاقه‌مندی‌ها'},{text:'⚙️ راهنما'}]],resize_keyboard:true};
  const reply = (id, text) => api('sendMessage',{chat_id:id,text,parse_mode:'HTML',disable_web_page_preview:true,reply_markup:keyboard});
  const allowed = m => !allowedUserId || String(m.from?.id) === String(allowedUserId);
  let notifyChatId = null;
  const lastSent = new Map();
  async function notifyChanges() {
    if (!notifyChatId) return;
    try {
      const s = await local('/api/state');
      for (const c of (s.cards || [])) {
        const signature = JSON.stringify([c.status,c.score,c.entry,c.sl,c.tp1,c.tp2,c.warning,c.pinned]);
        const previous = lastSent.get(c.id);
        if (previous === undefined) {
          if (c.pinned || c.timestamp || c.firstSeen) await reply(notifyChatId, '🆕 <b>سیگنال جدید</b>\n' + esc(c.symbol) + ' · ' + c.side + '\nامتیاز: ' + fmt(c.score) + '/100\nEntry: ' + fmt(c.entry) + '\nSL: ' + fmt(c.sl) + '\nTP1: ' + fmt(c.tp1) + '\nTP2: ' + fmt(c.tp2) + (c.warning ? '\n⚠️ ' + esc(c.warning) : '') + '\nبرای جزئیات /signals را بزن.');
        } else if (previous !== signature) {
          await reply(notifyChatId, '🔔 <b>به‌روزرسانی سیگنال</b>\n' + esc(c.symbol) + ' · ' + c.side + '\nوضعیت: ' + esc(c.status || '—') + '\nامتیاز: ' + fmt(c.score) + '/100\nEntry: ' + fmt(c.entry) + '\nSL: ' + fmt(c.sl) + '\nTP1: ' + fmt(c.tp1) + '\nTP2: ' + fmt(c.tp2) + (c.warning ? '\n⚠️ ' + esc(c.warning) : ''));
        }
        lastSent.set(c.id, signature);
      }
      for (const id of [...lastSent.keys()]) if (!(s.cards || []).some(c => c.id === id)) lastSent.delete(id);
    } catch (e) { console.error('Telegram notifications failed:', e.message); }
  }
  async function handle(m) {
    const id=m.chat.id, raw=String(m.text||'').trim(), p=raw.split(/\s+/), cmd=p[0].toLowerCase().split('@')[0], a=p.slice(1);
    if (!raw) return;
    if (cmd==='/id') return reply(id,'شناسه کاربری شما: <code>'+m.from.id+'</code>\nاین عدد را در متغیر محرمانه TELEGRAM_ALLOWED_USER_ID ثبت کن و سرویس را دوباره راه‌اندازی کن.');
    if (!allowedUserId && !['/start','/help'].includes(cmd) && raw!=='⚙️ راهنما') return reply(id,'برای امنیت، ابتدا /id را بزن و شناسه خودت را در متغیر محرمانه TELEGRAM_ALLOWED_USER_ID در میزبانی ثبت کن. سپس سرویس را Restart کن.');
    if (!allowed(m)) return reply(id,'این ربات محدود شده است. برای راهنمای شناسه /id را بزن.');
    if (allowedUserId) notifyChatId = id;
    if (cmd==='/start'||cmd==='/help'||raw==='⚙️ راهنما') return reply(id,
      '🤖 <b>اسکنر Ati · Toobit Futures</b>\nفقط تحلیل و هشدار؛ هیچ سفارشی ثبت نمی‌کند.\n\n'+
      '<code>/startscan</code> شروع اسکن\n<code>/stop</code> توقف\n<code>/status</code> وضعیت\n<code>/signals</code> سیگنال‌ها\n<code>/capital 100</code> سرمایه USDT\n<code>/leverage 10</code> اهرم محاسباتی\n<code>/scan priority|favorites|all</code> حالت اسکن\n<code>/orders Market,Limit,Trigger</code> فیلتر نوع سفارش\n<code>/horizon fast|normal</code> افق بررسی\n<code>/favorite BTC-USDT</code> افزودن علاقه‌مندی\n<code>/unfavorite BTC-USDT</code> حذف علاقه‌مندی\n<code>/favorites</code> فهرست علاقه‌مندی‌ها\n<code>/pin BTC-USDT LONG</code> پین سیگنال موجود\n<code>/unpin BTC-USDT LONG</code> برداشتن پین\n<code>/recheck BTC-USDT LONG</code> بررسی فوری\n<code>/id</code> شناسه تلگرام');
    if (cmd==='/startscan'||raw==='▶️ شروع اسکن') {
      const s=await local('/api/state'); const r=await local('/api/start',{capital:s.capital||100,leverage:s.leverage||10,settings:s.settings});
      return reply(id,'اسکن فعال شد.\nسرمایه: '+fmt(r.capital)+' USDT\nاهرم محاسباتی: '+fmt(r.leverage)+'x');
    }
    if (cmd==='/stop'||raw==='⏹ توقف اسکن') { await local('/api/stop',{}); return reply(id,'اسکن متوقف شد؛ سیگنال‌های پین‌شده حفظ می‌شوند.'); }
    if (cmd==='/status'||raw==='📊 وضعیت') {
      const s=await local('/api/state');
      return reply(id,'📊 <b>وضعیت اسکنر</b>\nوضعیت: '+(s.running?'فعال':'متوقف')+'\n'+esc(s.statusText||'—')+'\nپیشرفت: '+fmt(s.scannedContracts||0)+' / '+fmt(s.totalContracts||0)+'\nسیگنال‌های واجد شرایط: '+fmt(s.qualifiedCount||0)+'\nپین‌شده: '+fmt(s.pinCount||0)+'\nسرمایه: '+fmt(s.capital)+' USDT\nآخرین داده: '+(s.lastDataAt?new Date(s.lastDataAt).toISOString():'—')+(s.lastError?'\nخطا: '+esc(s.lastError):''));
    }
    if (cmd==='/signals'||raw==='📡 سیگنال‌ها') {
      const s=await local('/api/state'); if (!s.cards?.length) return reply(id,'فعلاً سیگنالی از فیلترهای کیفیت عبور نکرده است. /status را بررسی کن.');
      for (const c of s.cards) await reply(id,'📍 <b>'+esc(c.symbol)+' · '+c.side+'</b> '+(c.pinned?'📌':'')+'\nوضعیت: '+esc(c.status||'—')+'\nامتیاز: '+fmt(c.score)+'/100\nقیمت: '+fmt(c.currentPrice||c.priceAtSignal)+'\nEntry: '+fmt(c.entry)+'\nSL: '+fmt(c.sl)+'\nTP1: '+fmt(c.tp1)+'\nTP2: '+fmt(c.tp2)+'\nRR: 1:'+fmt(c.rr)+'\nنوع سفارش: '+esc(c.orderType)+'\nریسک هدف: '+fmt(c.riskTarget)+' USDT\nتایم‌فریم‌ها: 1h '+esc(c.timeframe?.h1||'—')+' · 15m '+esc(c.timeframe?.m15||'—')+' · 5m '+esc(c.timeframe?.m5||'—')+(c.warning?'\n⚠️ '+esc(c.warning):'')+'\n'+(c.pinned?'/recheck '+c.symbol+' '+c.side:'/pin '+c.symbol+' '+c.side));
      return;
    }
    if (cmd==='/capital') {
      const v=Number(a[0]); if (!(v>0)||!Number.isFinite(v)) return reply(id,'مثال: <code>/capital 100</code>');
      const s=await local('/api/state'); await local('/api/start',{capital:v,leverage:s.leverage||10,settings:s.settings});
      return reply(id,'سرمایه هر معامله روی '+fmt(v)+' USDT تنظیم شد و اسکن فعال است.');
    }
    if (cmd==='/leverage') {
      const v=Number(a[0]); if (!(v>=1&&v<=200)||!Number.isFinite(v)) return reply(id,'اهرم محاسباتی باید بین ۱ تا ۲۰۰ باشد. مثال /leverage 10');
      const s=await local('/api/state'); await local('/api/start',{capital:s.capital||100,leverage:v,settings:s.settings});
      return reply(id,'اهرم محاسباتی روی '+fmt(v)+'x تنظیم شد؛ اهرم حساب صرافی تغییر نمی‌کند.');
    }
    if (cmd==='/scan') {
      if (!['priority','favorites','all'].includes(a[0])) return reply(id,'استفاده: /scan priority یا /scan favorites یا /scan all');
      const s=await local('/api/state'); await local('/api/settings',{settings:{...s.settings,scanMode:a[0]}});
      return reply(id,'حالت اسکن ذخیره شد: '+a[0]);
    }
    if (cmd==='/orders') {
      const valid=['Market','Limit','Trigger'], types=(a.join('').split(',')).map(x=>x.trim()).filter(x=>valid.includes(x));
      if (!types.length) return reply(id,'استفاده: /orders Market,Limit,Trigger');
      const s=await local('/api/state'); await local('/api/settings',{settings:{...s.settings,orderTypes:types}});
      return reply(id,'انواع سفارش مجاز: '+types.join(', '));
    }
    if (cmd==='/horizon') {
      if (!['fast','normal'].includes(a[0])) return reply(id,'استفاده: /horizon fast یا /horizon normal');
      const s=await local('/api/state'); await local('/api/settings',{settings:{...s.settings,horizonMode:a[0]}});
      return reply(id,'افق بررسی ذخیره شد: '+a[0]);
    }
    if (cmd==='/favorite'||cmd==='/unfavorite') {
      const symbol=String(a[0]||'').toUpperCase(); if (!symbol) return reply(id,'نماد را وارد کن؛ مثال /favorite BTC-USDT');
      await local(cmd==='/favorite'?'/api/favorite':'/api/unfavorite',{symbol});
      return reply(id,symbol+(cmd==='/favorite'?' به علاقه‌مندی‌ها اضافه شد.':' از علاقه‌مندی‌ها حذف شد.'));
    }
    if (cmd==='/favorites'||raw==='⭐ علاقه‌مندی‌ها') {
      const s=await local('/api/state'); return reply(id,s.favorites?.length?'⭐ <b>علاقه‌مندی‌ها</b>\n'+s.favorites.map(esc).join('\n'):'هنوز ارزی ذخیره نشده است.');
    }
    if (cmd==='/pin'||cmd==='/unpin'||cmd==='/recheck') {
      const symbol=String(a[0]||'').toUpperCase(), side=String(a[1]||'').toUpperCase(), key=symbol+':'+side;
      if (!symbol||!['LONG','SHORT'].includes(side)) return reply(id,'مثال: /'+cmd.slice(1)+' BTC-USDT LONG');
      if (cmd==='/pin') {
        const s=await local('/api/state'); if (!(s.cards||[]).some(c=>c.id===key)) return reply(id,'این سیگنال در کارت‌های فعلی نیست؛ /signals را بزن.');
        await local('/api/pin',{id:key}); return reply(id,'سیگنال پین شد: '+key);
      }
      if (cmd==='/unpin') { await local('/api/unpin',{id:key}); return reply(id,'درخواست برداشتن پین انجام شد: '+key); }
      await local('/api/recheck-pin',{id:key}); const s=await local('/api/state'), c=(s.cards||[]).find(x=>x.id===key);
      return reply(id,c?'بررسی تازه: '+key+'\nوضعیت: '+esc(c.status||'—')+'\nقیمت: '+fmt(c.currentPrice)+(c.warning?'\n⚠️ '+esc(c.warning):''):'بررسی انجام شد؛ کارت پیدا نشد.');
    }
    return reply(id,'دستور شناخته نشد؛ /help را بزن.');
  }
  let offset=0, delay=1000;
  async function loop() {
    while (true) {
      try {
        const updates=await api('getUpdates',{offset,timeout:20,allowed_updates:['message']}); delay=1000;
        for (const u of updates) { offset=Math.max(offset,u.update_id+1); if (u.message) try { await handle(u.message); } catch(e) { console.error('Telegram command failed:',e.message); try { await reply(u.message.chat.id,'خطا: '+esc(e.message||'عملیات ناموفق')); } catch {} } }
        await notifyChanges();
      } catch(e) { console.error('Telegram polling failed:',e.message); await sleep(delay); delay=Math.min(15000,Math.round(delay*1.8)); }
    }
  }
  api('deleteWebhook',{drop_pending_updates:false}).catch(e=>console.error('Telegram webhook setup:',e.message));
  console.log('Telegram bot polling started.');
  loop();
}
module.exports={start};
