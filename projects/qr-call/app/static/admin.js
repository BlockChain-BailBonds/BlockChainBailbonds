'use strict';
const $ = (id) => document.getElementById(id);
const csrf = document.querySelector('meta[name="csrf-token"]').content;
let editingId = null;
let codes = [];

function notice(message, isError = false) {
  const el = $('notice');
  el.hidden = false;
  el.classList.toggle('error', isError);
  el.textContent = message;
}
async function api(path, options = {}) {
  const opts = {credentials: 'same-origin', ...options};
  if (opts.method && opts.method !== 'GET') {
    opts.headers = {'Content-Type': 'application/json', 'X-CSRF-Token': csrf, ...(opts.headers || {})};
  }
  const res = await fetch(path, opts);
  if (res.status === 401) { location.href = '/login'; throw new Error('Session expired'); }
  const value = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof value.detail === 'string' ? value.detail : JSON.stringify(value.detail || value));
  return value;
}
function formatDate(value) { return value ? new Date(value).toLocaleString() : 'No expiry'; }
function browserDate(value) {
  if (!value) return '';
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function toIso(id) { const value = $(id).value; return value ? new Date(value).toISOString() : null; }
function schedulePayload() {
  const windows = $('use-window').checked ? [{days: [...$('weekdays').querySelectorAll('input:checked')].map(x => Number(x.value)),start: $('window-start').value,end: $('window-end').value}] : [];
  return {label: $('label').value.trim(), timezone: $('tz').value.trim(),start_at:toIso('start-at'),end_at:toIso('end-at'),windows,
          max_calls:$('max-calls').value ? Number($('max-calls').value) : null};
}
function buildCard(code) {
  const wrapper = document.createElement('article'); wrapper.className = 'access-card';
  const title = document.createElement('h3'); title.textContent = code.label; wrapper.append(title);
  const state = document.createElement('span'); state.className = 'status-pill ' + (code.enabled ? 'green' : 'red'); state.textContent = code.enabled ? 'ACTIVE' : 'VOID'; wrapper.append(state);
  const image = document.createElement('img'); image.className = 'qr-image'; image.alt = 'Private QR code for ' + code.label;
  image.src = '/api/codes/' + encodeURIComponent(code.id) + '/qr.png'; wrapper.append(image);
  const desc = document.createElement('p'); desc.className = 'small muted';
  desc.textContent = `${code.windows.length ? 'Scheduled' : 'Any time'} · ${code.timezone} · ${code.end_at ? 'Ends ' + formatDate(code.end_at) : 'No expiry'}`; wrapper.append(desc);
  const url = document.createElement('input'); url.type = 'text'; url.readOnly = true; url.value = code.url; url.ariaLabel = 'Private QR URL'; wrapper.append(url);
  const actions = document.createElement('div'); actions.className = 'card-actions';
  const copy = document.createElement('button'); copy.className = 'ghost'; copy.textContent = 'Copy link'; copy.onclick = async () => {
    try { await navigator.clipboard.writeText(code.url); notice('Private link copied. Share only with the intended recipient.'); }
    catch (e) { url.select(); notice('Clipboard permission unavailable. Select and copy the highlighted link.', true); }
  }; actions.append(copy);
  const print = document.createElement('button'); print.className = 'ghost'; print.textContent = 'Print'; print.onclick = () => {
    const popup = window.open('', '_blank');
    if (!popup) { notice('Allow popups to print this card.', true); return; }
    popup.opener = null;
    // Build print card using DOM APIs, never HTML interpolation of user-controlled labels.
    const img = popup.document.createElement('img'); img.src = new URL(image.src, location.origin).href;
    img.style.width = '290px'; img.style.height = '290px';
    const heading = popup.document.createElement('h2'); heading.textContent = 'Private contact access';
    const tag = popup.document.createElement('p'); tag.textContent = 'Scan to request a private voice call. Access may be revoked or time-limited.';
    popup.document.body.append(heading, img, tag);
    img.onload = () => { popup.focus(); popup.print(); };
  }; actions.append(print);
  if (code.enabled) {
    const edit = document.createElement('button'); edit.className = 'ghost'; edit.textContent = 'Edit hours'; edit.onclick = () => editCode(code); actions.append(edit);
    const revoke = document.createElement('button'); revoke.className = 'danger-outline'; revoke.textContent = 'Revoke';
    revoke.onclick = async () => {
      if (!confirm(`Permanently void every copy of the QR code for "${code.label}"? A new code must be issued to restore access.`)) return;
      try { await api(`/api/codes/${encodeURIComponent(code.id)}/revoke`, {method:'POST'}); notice('Access revoked. All copies of this QR are now void for new calls.'); await loadCodes(); }
      catch (err) { notice(err.message, true); }
    }; actions.append(revoke);
  }
  wrapper.append(actions); return wrapper;
}
async function loadCodes() {
  try { codes = (await api('/api/codes')).codes; const parent = $('cards'); parent.replaceChildren();
    if (!codes.length) { const msg = document.createElement('p'); msg.className = 'muted'; msg.textContent = 'No QR permissions created yet.'; parent.append(msg); }
    codes.forEach(code => parent.append(buildCard(code)));
  } catch (err) { notice(err.message, true); }
}
async function loadPhone() {
  try { const p = await api('/api/owner'); $('phone-status').textContent = p.activated ? 'SMS VERIFIED' : 'LOCKED';
    $('verified-workspace').hidden = !p.activated;
    $('phone-status').className = 'status-pill ' + (p.activated ? 'green' : 'red');
    $('phone-mask').textContent = p.configured ? `Saved number: ${p.masked}` : 'Enter your phone to receive an SMS code before any QR command can run.';
  } catch (err) { notice(err.message, true); }
}
async function loadEvents() {
  try { const events = (await api('/api/events')).events; const body = $('events'); body.replaceChildren();
    if (!events.length) { const row = body.insertRow(); row.insertCell().colSpan = 4; row.cells[0].textContent = 'No calls yet'; }
    for (const event of events) { const row = body.insertRow(); for (const value of [event.code_label,formatDate(event.created_at),event.status,event.dial_status||'—']) row.insertCell().textContent = value; }
  } catch (err) { notice(err.message, true); }
}
function editCode(code) {
  editingId = code.id; $('label').value = code.label; $('tz').value = code.timezone;
  $('start-at').value = browserDate(code.start_at); $('end-at').value = browserDate(code.end_at);
  $('max-calls').value = code.max_calls ?? ''; $('use-window').checked = code.windows.length > 0;
  $('schedule-options').hidden = !$('use-window').checked;
  const window = code.windows[0];
  if (window) { $('window-start').value = window.start; $('window-end').value = window.end;
    $('weekdays').querySelectorAll('input').forEach(checkbox => checkbox.checked = window.days.includes(Number(checkbox.value))); }
  $('save-code').textContent = 'Save updated hours'; $('cancel-edit').hidden = false;
  $('code-form').scrollIntoView({behavior:'smooth',block:'center'});
}
function resetEdit() { editingId = null; $('code-form').reset(); $('schedule-options').hidden = true; $('save-code').textContent = 'Generate QR code'; $('cancel-edit').hidden = true; }
$('use-window').addEventListener('change', () => $('schedule-options').hidden = !$('use-window').checked);
$('code-form').addEventListener('submit', async e => {
  e.preventDefault();
  try { const payload = schedulePayload(); const isEdit = Boolean(editingId);
    if (payload.windows.length && !payload.windows[0].days.length) throw new Error('Choose at least one permitted weekday.');
    if (payload.start_at && payload.end_at && payload.start_at >= payload.end_at) throw new Error('Expiry must occur after start.');
    await api(isEdit ? `/api/codes/${editingId}` : '/api/codes', {method:isEdit?'PUT':'POST',body:JSON.stringify(payload)});
    notice(isEdit ? 'Hours updated. The printed QR remains valid.' : 'New unique QR issued. Print or copy it below.'); resetEdit(); await loadCodes();
  } catch (err) { notice(err.message, true); }
});
$('phone-form').addEventListener('submit', async e => {
  e.preventDefault();
  try { const result = await api('/api/owner/verify/start',{method:'POST',body:JSON.stringify({phone:$('owner-phone').value.trim(),channel:$('verify-channel').value})}); $('confirm-phone').hidden = false; notice(`Verification ${result.channel === 'sms' ? 'text' : 'call'} sent to ${result.masked}. Enter the code to authorize routing.`); }
  catch (err) { notice(err.message, true); }
});
$('cancel-edit').onclick = resetEdit;
$('refresh-codes').onclick = loadCodes; $('refresh-events').onclick = loadEvents;
$('logout').onclick = async () => { const form = $('logout-form');
  const res = await fetch('/logout',{method:'POST',headers:{'X-CSRF-Token':csrf}});
  if(res.ok) location.href = '/login'; else notice('Could not sign out.',true);
};
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
if (tz) $('tz').value = tz;
loadPhone().then(() => { if (!$('verified-workspace').hidden) Promise.all([loadCodes(),loadEvents()]); });

$('confirm-phone').addEventListener('submit', async e => {
  e.preventDefault();
  try { await api('/api/owner/verify/check',{method:'POST',body:JSON.stringify({code:$('verification-code').value.trim()})});
    $('owner-phone').value=''; $('verification-code').value=''; $('confirm-phone').hidden = true;
    notice('SMS ownership confirmed. QR Call is now unlocked for this session.'); await loadPhone(); await Promise.all([loadCodes(), loadEvents()]); }
  catch (err) { notice(err.message,true); }
});
