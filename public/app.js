'use strict';
const $ = id => document.getElementById(id);
const state = { restarting: false, running: false, lastCards: [], heartbeat: null, poll: null, toastTimer: null, startTime: null, rechecking: new Set(), initialized: false, favorites: [], settings: { scanMode: 'priority', horizonMode: 'fast', orderTypes: ['Market','Limit','Trigger'], useCaseFilterEnabled:false, useCaseGroups:[], marketFilterEnabled:false, marketGroups:[] } };
const fmt = (n, max = 8) => Number.isFinite(Number(n)) ? Number(n).toLocaleString('en-US', { maximumFractionDigits: max }) : '—';
const faNum = n => Number(n).toLocaleString('fa-IR');
const timeFmt = ts => ts ? new Date(ts).toLocaleTimeString('fa-IR', { hour:'2-digit', minute:'2-digit', second:'2-digit' }) : 'دریافت نشده';
const dateFmt = ts => ts ? new Date(ts).toLocaleString('fa-IR', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' }) : '—';
async function api(path, options = {}) {
  const response = await fetch(path, { cache: 'no-store', headers: { 'Content-Type': 'application/json' }, ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `خطای درخواست (${response.status})`);
  return body;
}

function readSettingsForm(orderTypes) {
  return {
    scanMode: $('scanMode').value,
    horizonMode: $('horizonMode').value,
    orderTypes,
    useCaseFilterEnabled: $('useCaseFilterEnabled').checked,
    useCaseGroups: [...document.querySelectorAll('input[name="useCaseGroup"]:checked')].map(el => el.value),
    marketFilterEnabled: $('marketFilterEnabled').checked,
    marketGroups: [...document.querySelectorAll('input[name="marketGroup"]:checked')].map(el => el.value)
  };
}
function setFilterControls(settings) {
  $('useCaseFilterEnabled').checked = Boolean(settings.useCaseFilterEnabled);
  $('marketFilterEnabled').checked = Boolean(settings.marketFilterEnabled);
  $('useCaseFilterOptions').classList.toggle('hidden', !$('useCaseFilterEnabled').checked);
  $('marketFilterOptions').classList.toggle('hidden', !$('marketFilterEnabled').checked);
  document.querySelectorAll('input[name="useCaseGroup"]').forEach(el => { if (document.activeElement !== el) el.checked = (settings.useCaseGroups || []).includes(el.value); });
  document.querySelectorAll('input[name="marketGroup"]').forEach(el => { if (document.activeElement !== el) el.checked = (settings.marketGroups || []).includes(el.value); });
}
function showToast(message) {
  const toast = $('toast'); toast.textContent = message; toast.classList.add('show');
  clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => toast.classList.remove('show'), 3600);
}
function setRunning(running) {
  state.running = running;
  $('startBtn').disabled = running;
  $('stopBtn').disabled = !running;
  $('searchAgainBtn').disabled = !running;
  $('capitalInput').disabled = running;
  $('leverageInput').disabled = running;
  $('scanMode').disabled = running;
  $('horizonMode').disabled = running;
  document.querySelectorAll('input[name="orderType"], input[name="useCaseGroup"], input[name="marketGroup"], #useCaseFilterEnabled, #marketFilterEnabled').forEach(el => el.disabled = running);
  $('connectionDot').className = `dot ${running ? 'online' : ''}`;
  $('connectionText').textContent = running ? 'پایش فعال' : 'متوقف / آماده';
}
function renderState(data) {
  setRunning(Boolean(data.running));
  state.favorites = Array.isArray(data.favorites) ? data.favorites : state.favorites;
  state.settings = data.settings || state.settings;
  if (document.activeElement?.id !== 'scanMode') $('scanMode').value = state.settings.scanMode || 'priority';
  if (document.activeElement?.id !== 'horizonMode') $('horizonMode').value = state.settings.horizonMode || 'fast';
  setFilterControls(state.settings);
  if (!state.initialized) { if (data.leverage) $('leverageInput').value = data.leverage; if (data.capital) $('capitalInput').value = data.capital; state.initialized = true; }
  document.querySelectorAll('input[name="orderType"]').forEach(el => { if (document.activeElement !== el) el.checked = (state.settings.orderTypes || ['Market','Limit','Trigger']).includes(el.value); });
  $('totalContracts').textContent = data.totalContracts ? faNum(data.totalContracts) : '—';
  $('heroContracts').textContent = data.totalContracts ? faNum(data.totalContracts) : '—';
  $('scannedContracts').textContent = faNum(data.scannedContracts || 0);
  $('qualifiedCount').textContent = faNum(data.qualifiedCount || 0);
  $('lastDataAt').textContent = data.lastDataAt ? timeFmt(data.lastDataAt) : 'دریافت نشده';
  $('dataFreshness').textContent = data.lastDataAt ? (data.stale ? 'داده قدیمی است؛ احتیاط' : 'داده تازه دریافت شده') : 'منتظر داده زنده';
  $('dataFreshness').style.color = data.stale ? 'var(--amber)' : 'var(--green)';
  $('roundLabel').textContent = data.round ? `دور ${faNum(data.round)}` : 'هنوز شروع نشده';
  $('statusTitle').textContent = data.running ? 'اسکن بازار در حال اجراست' : (data.statusText || 'آماده شروع اسکن');
  $('statusMessage').textContent = data.statusText || '—';
  $('currentSymbol').textContent = data.currentSymbol || '—';
  const pct = data.totalContracts ? Math.min(100, Math.round(data.scannedContracts / data.totalContracts * 100)) : 0;
  $('progressPercent').textContent = `${faNum(pct)}٪`;
  $('progressBar').style.width = `${pct}%`;
  const error = $('errorBanner');
  if (data.lastError) { error.textContent = `خطا در دریافت داده: ${data.lastError} — داده قدیمی به‌عنوان قیمت زنده استفاده نمی‌شود.`; error.classList.remove('hidden'); $('connectionDot').className = 'dot error'; $('connectionText').textContent = 'خطای اتصال'; }
  else { error.classList.add('hidden'); }
  renderCards(data.cards || []);
}
function renderCards(cards) {
  $('cardCount').textContent = `${faNum(cards.length)} / ۵`;
  const grid = $('signalGrid');
  if (!cards.length) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-orbit">⌁</div><h3>${state.running ? 'در حال جست‌وجوی فرصت‌های معتبر…' : 'هنوز سیگنالی دریافت نشده'}</h3><p>${state.running ? 'برنامه تمام قراردادهای قابل‌معامله را بررسی می‌کند. فقط فرصت‌هایی که از فیلترهای کیفیت عبور کنند نمایش داده می‌شوند.' : 'سرمایه هر معامله را بررسی کن و «شروع اسکن» را بزن. اگر شرایط بازار مناسب نباشد، کارت سیگنالی نمایش داده نمی‌شود.'}</p></div>`;
    return;
  }
  grid.innerHTML = cards.map(cardHtml).join('');
  grid.querySelectorAll('[data-favorite]').forEach(button => button.addEventListener('click', async e => {
    const symbol = e.currentTarget.dataset.favorite;
    const isFav = state.favorites.includes(symbol);
    try { const result = await api(isFav ? '/api/unfavorite' : '/api/favorite', { method:'POST', body: JSON.stringify({ symbol }) }); renderState(result); showToast(isFav ? 'ارز از Favorites حذف شد.' : 'ارز به Favorites اضافه شد؛ انتخاب ذخیره شد.'); }
    catch (err) { showToast(err.message); }
  }));
  grid.querySelectorAll('[data-pin]').forEach(input => input.addEventListener('change', async e => {
    const id = e.target.dataset.pin;
    try {
      const result = await api(e.target.checked ? '/api/pin' : '/api/unpin', { method:'POST', body: JSON.stringify({ id }) });
      renderState(result); showToast(e.target.checked ? 'سیگنال پین شد و برای بازیابی ذخیره شد.' : 'سیگنال از حالت پین خارج شد.');
    } catch (err) { e.target.checked = !e.target.checked; showToast(err.message); }
  }));
  grid.querySelectorAll('[data-recheck]').forEach(button => button.addEventListener('click', async e => {
    const id = e.currentTarget.dataset.recheck;
    if (state.rechecking.has(id)) return;
    state.rechecking.add(id);
    await refresh();
    try {
      const result = await api('/api/recheck-pin', { method:'POST', body: JSON.stringify({ id }) });
      renderState(result);
      const card = (result.cards || []).find(item => item.id === id);
      showToast(card ? `بررسی تازه انجام شد: ${card.status || 'وضعیت به‌روزرسانی شد'}` : 'بررسی تازه انجام شد.');
    } catch (err) { showToast(err.message); }
    finally { state.rechecking.delete(id); await refresh(); }
  }));
}
function cardHtml(s) {
  const isLong = s.side === 'LONG';
  const sideFa = isLong ? 'لانگ' : 'شورت';
  const statusText = s.status || 'در انتظار بررسی';
  const statusClass = /نامعتبر/.test(statusText) ? 'invalid' : /تضعیف|هشدار|نیازمند/.test(statusText) ? 'warning' : /دوباره مناسب/.test(statusText) ? 'revalidated' : 'valid';
  const warningClass = statusClass === 'invalid' ? 'signal-warning invalid' : 'signal-warning';
  const historyItems = Array.isArray(s.history) ? s.history.slice(-2).reverse() : [];
  const historyHtml = historyItems.length ? `<div class="change-history"><div class="history-title">آخرین تغییرات</div>${historyItems.map(item => {
    const oldLevels = item.oldLevels || {};
    const newLevels = item.newLevels || {};
    const changedLevels = ['entry','sl','tp1','tp2'].filter(k => Number.isFinite(Number(oldLevels[k])) && Number.isFinite(Number(newLevels[k])) && Math.abs(Number(oldLevels[k])-Number(newLevels[k])) > Math.max(1e-10, Math.abs(Number(oldLevels[k]))*0.0001));
    const labels = { entry:'ورود', sl:'SL', tp1:'TP1', tp2:'TP2' };
    const levelSummary = changedLevels.map(k => `${labels[k]}: ${fmt(oldLevels[k])} ← ${fmt(newLevels[k])}`).join(' · ');
    const scoreSummary = Number.isFinite(Number(item.oldScore)) && Number.isFinite(Number(item.newScore)) ? `امتیاز ${faNum(item.oldScore)} ← ${faNum(item.newScore)}` : '';
    return `<div class="history-item"><span>${timeFmt(item.at)} · ${escapeHtml(item.type || 'تغییر')}</span><small>${escapeHtml([scoreSummary, levelSummary, item.note || ''].filter(Boolean).join(' | '))}</small></div>`;
  }).join('')}</div>` : '';
  const ageSeconds = s.expiresAt ? Math.max(0, Math.ceil((s.expiresAt - Date.now()) / 1000)) : null;
  const timeframe = s.timeframe || {};
  const chip = (label, trend) => `<div class="tf-chip ${trend === s.side ? 'good' : trend === 'NEUTRAL' ? '' : 'bad'}">${label}<b>${trend === 'LONG' ? 'LONG' : trend === 'SHORT' ? 'SHORT' : '—'}</b></div>`;
  const staleWarn = s.status === 'نیازمند تأیید داده زنده' ? `<div class="signal-warning invalid">اطلاعات ذخیره‌شده است؛ تا دریافت داده زنده این سیگنال تأیید نشده است.</div>` : '';
  const delta = Number(s.scoreDelta);
  const scoreDeltaHtml = Number.isFinite(delta) && s.lastCheckedAt ? `<span class="score-change ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}">${delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : '± '}${faNum(delta)}</span>` : '';
  const isFavorite = state.favorites.includes(s.symbol);
  return `<article class="signal-card ${isLong?'long':'short'} ${s.pinned?'pinned':''} ${statusClass}">
    <div class="signal-card-head"><div class="symbol-line"><div class="symbol-name">${escapeHtml(s.displayName || s.symbol)}</div><div class="symbol-actions"><button type="button" class="favorite-btn ${isFavorite?'active':''}" data-favorite="${escapeHtml(s.symbol)}" aria-label="${isFavorite?'حذف از':'افزودن به'} Favorites" title="${isFavorite?'حذف از':'افزودن به'} Favorites">${isFavorite?'★':'☆'}</button><label class="pin-control pin-control-top" title="نگه‌داشتن سیگنال"><input type="checkbox" data-pin="${escapeHtml(s.id)}" ${s.pinned?'checked':''} aria-label="نگه‌داشتن سیگنال"></label>${s.pinned ? `<button type="button" class="btn btn-recheck" data-recheck="${escapeHtml(s.id)}" aria-label="بررسی فوری وضعیت" title="بررسی فوری وضعیت" ${state.rechecking.has(s.id) ? 'disabled' : ''}>${state.rechecking.has(s.id) ? '…' : '↻'}</button>` : ''}</div></div><div class="signal-meta"><span class="side-badge ${isLong?'long':'short'}">${sideFa} · ${s.side}</span><span class="score-badge">${faNum(s.score || 0)} / ۱۰۰ ${scoreDeltaHtml}</span></div><div class="signal-meta signal-issued"><span class="signal-time">صدور: ${timeFmt(s.timestamp || s.firstSeen)}</span></div>
    <div class="status-row"><span class="status-pill ${statusClass}">${escapeHtml(statusText)}</span><span class="check-time">بررسی: ${timeFmt(s.lastCheckedAt || s.lastUpdatedAt)}</span></div></div>
    <div class="signal-body"><div class="current-price-row"><span>قیمت فعلی در آخرین بررسی</span><strong>${fmt(s.currentPrice || s.priceAtSignal)}</strong></div><div class="order-type"><span>نوع سفارش پیشنهادی</span><strong>${escapeHtml(s.orderType || '—')}</strong></div>
      <div class="price-main"><span>قیمت ورود پیشنهادی</span><strong>${fmt(s.entry)}</strong></div><div class="levels"><div class="level sl"><span>حد ضرر · SL</span><strong>${fmt(s.sl)}</strong></div><div class="level tp"><span>هدف اول · TP1</span><strong>${fmt(s.tp1)}</strong></div><div class="level tp"><span>هدف دوم · TP2</span><strong>${fmt(s.tp2)}</strong></div><div class="level"><span>نسبت سود به زیان</span><strong>۱ : ${fmt(s.rr,2)}</strong></div></div>
      <div class="risk-box"><div><span>ریسک هدف</span><strong>${fmt(s.riskTarget,4)} USDT</strong></div><div><span>حجم تخمینی</span><strong>${fmt(s.quantity,8)}</strong></div></div>
      <div class="tf-row">${chip('۱ساعت',timeframe.h1)}${chip('۱۵دقیقه',timeframe.m15)}${chip('۵دقیقه',timeframe.m5)}</div>
      ${s.warning ? `<div class="${warningClass}">${escapeHtml(s.warning)}</div>` : ''}${staleWarn}
      <div class="signal-reasons">${(s.reasons || []).map(escapeHtml).join(' · ')}</div>${historyHtml}
    </div>
    <div class="signal-card-foot"><span class="expire-text">${s.pinned ? '' : `حذف در ${ageSeconds == null ? '—' : faNum(ageSeconds)+'ث'}`}</span></div>
  </article>`;
}
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
async function refresh() {
  try { renderState(await api('/api/state')); }
  catch (error) { $('connectionDot').className = 'dot error'; $('connectionText').textContent = 'سرور محلی در دسترس نیست'; $('statusMessage').textContent = 'فایل Start-Toobit-Scanner.bat را اجرا کن و دوباره صفحه را باز کن.'; }
}
async function startScan() {
  const capital = Number($('capitalInput').value);
  if (!Number.isFinite(capital) || capital <= 0) { showToast('سرمایه هر معامله باید بیشتر از صفر باشد.'); $('capitalInput').focus(); return; }
  $('startBtn').disabled = true;
  const leverage = Number($('leverageInput').value);
  if (!Number.isFinite(leverage) || leverage < 1) { showToast('اهرم محاسباتی باید حداقل ۱ باشد.'); $('leverageInput').focus(); $('startBtn').disabled = false; return; }
  const orderTypes = [...document.querySelectorAll('input[name="orderType"]:checked')].map(el => el.value);
  if (!orderTypes.length) { showToast('حداقل یک نوع سفارش را انتخاب کن.'); $('startBtn').disabled = false; return; }
  const settings = readSettingsForm(orderTypes);
  try { renderState(await api('/api/start', { method:'POST', body: JSON.stringify({ capital, leverage, settings }) })); showToast('اسکن آغاز شد. اولین دور ممکن است با توجه به تعداد قراردادها زمان ببرد.'); }
  catch (error) { showToast(error.message); $('startBtn').disabled = false; }
}
async function stopScan() {
  try { renderState(await api('/api/stop', { method:'POST', body:'{}' })); showToast('اسکن متوقف شد؛ سیگنال‌های پین‌شده حفظ می‌شوند.'); }
  catch (error) { showToast(error.message); }
}
$('startBtn').addEventListener('click', startScan);
async function saveSettings() {
  const orderTypes = [...document.querySelectorAll('input[name="orderType"]:checked')].map(el => el.value);
  if (!orderTypes.length) { showToast('حداقل یک نوع سفارش باید انتخاب شود.'); return; }
  try { const result = await api('/api/settings', { method:'POST', body: JSON.stringify({ settings: readSettingsForm(orderTypes) }) }); renderState(result); showToast('تنظیمات ذخیره شد.'); } catch (e) { showToast(e.message); }
}
$('scanMode').addEventListener('change', saveSettings);
$('useCaseFilterEnabled').addEventListener('change', () => { $('useCaseFilterOptions').classList.toggle('hidden', !$('useCaseFilterEnabled').checked); saveSettings(); });
$('marketFilterEnabled').addEventListener('change', () => { $('marketFilterOptions').classList.toggle('hidden', !$('marketFilterEnabled').checked); saveSettings(); });
document.querySelectorAll('input[name="useCaseGroup"], input[name="marketGroup"]').forEach(el => el.addEventListener('change', saveSettings));
$('horizonMode').addEventListener('change', saveSettings);
$('marketReviewBtn').addEventListener('click', async () => {
  const btn = $('marketReviewBtn'), panel = $('marketReview'); btn.disabled = true; btn.textContent = 'در حال بررسی بازار…'; panel.classList.remove('hidden'); panel.textContent = 'در حال دریافت اطلاعات زنده از Toobit…';
  try { const r = await api('/api/market-review'); const pct = n => `${n > 0 ? '+' : ''}${Number(n).toFixed(2)}٪`; const list = arr => arr.map(x => `<span class="market-chip">${escapeHtml(x.symbol)} <b>${pct(x.change)}</b></span>`).join('');
    $('btcChange').textContent = r.btcChange == null ? 'داده در دسترس نیست' : pct(r.btcChange);
    $('btcChange').style.color = r.btcChange > 0 ? 'var(--green)' : r.btcChange < 0 ? 'var(--red)' : 'var(--cyan)';
    $('btcStatus').textContent = r.btcChange == null ? 'نماد BTC در پاسخ بازار پیدا نشد' : `آخرین تغییر ۲۴ساعته · ${timeFmt(r.at)}`;
    $('marketVolume').textContent = Number(r.quoteVolume || 0).toLocaleString('en-US',{notation:'compact',maximumFractionDigits:2}) + ' USDT';
    $('marketMoodShort').textContent = r.up > r.down * 1.15 ? 'تمایل صعودی' : r.down > r.up * 1.15 ? 'تمایل نزولی' : 'ترکیبی';
    panel.innerHTML = `<strong>خلاصهٔ بازار (${faNum(r.count)} قرارداد)</strong><p>${escapeHtml(r.mood)}</p><div class="market-columns"><div><small>بیشترین رشد</small>${list(r.topUp)}</div><div><small>بیشترین افت</small>${list(r.topDown)}</div></div><small>زمان گزارش: ${timeFmt(r.at)} · تغییر ۲۴ساعته جهت قطعی آینده را نشان نمی‌دهد.</small>`;
  } catch(e) { panel.textContent = `گزارش آماده نشد: ${e.message}`; } finally { btn.disabled = false; btn.textContent = 'بررسی سریع بازار'; }
});
document.querySelectorAll('input[name="orderType"]').forEach(el => el.addEventListener('change', saveSettings));
$('stopBtn').addEventListener('click', stopScan);
$('searchAgainBtn').addEventListener('click', async () => {
  if ($('searchAgainBtn').disabled || state.restarting) return;
  state.restarting = true;
  $('searchAgainBtn').disabled = true;
  $('searchAgainBtn').textContent = 'در حال شروع…';
  try {
    await api('/api/stop', { method:'POST', body:'{}' });
    await startScan();
  } catch (error) {
    showToast('شروع مجدد اسکن ناموفق بود: ' + error.message);
  } finally {
    state.restarting = false;
    $('searchAgainBtn').textContent = '↻ جستجوی مجدد';
    await refresh();
  }
});
window.addEventListener('pagehide', () => { try { navigator.sendBeacon('/api/stop', new Blob(['{}'], { type:'application/json' })); } catch {} });
(async () => {
  await refresh();
  state.poll = setInterval(refresh, 2000);
  state.heartbeat = setInterval(() => { api('/api/heartbeat', { method:'POST', body:'{}' }).catch(() => {}); }, 8000);
})();


// Live clock: Gregorian and Solar Hijri dates in the header.
(function headerClock(){
  const el = document.getElementById('headerClock');
  if (!el) return;
  const update = () => {
    const now = new Date();
    const time = new Intl.DateTimeFormat('fa-IR', {hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(now);
    const greg = new Intl.DateTimeFormat('fa-IR-u-ca-gregory', {year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
    const jalali = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
    el.textContent = `${time} · ${greg} · ${jalali}`;
    el.title = 'ساعت زنده · تاریخ میلادی · تاریخ شمسی';
  };
  update(); setInterval(update, 1000);
})();
