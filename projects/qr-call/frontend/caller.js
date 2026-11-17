import { Device } from '@twilio/voice-sdk';
const root = document.querySelector('main[data-token]');
const token = root.dataset.token;
const status = document.getElementById('call-status');
const timer = document.getElementById('timer');
const callButton = document.getElementById('call-button');
const hangupButton = document.getElementById('hangup-button');
const errorBox = document.getElementById('call-error');
let currentDevice = null;
let currentCall = null;
let serverClockOffset = 0;
let latest = null;
let working = false;
let nextPoll;
function message(text, err = false) {
  status.textContent = text;
  errorBox.hidden = !err;
  errorBox.textContent = err ? text : '';
}
function countDown() {
  if (!latest || !latest.next_change) { timer.textContent = ''; return; }
  const remaining = Math.max(0, Math.floor((Date.parse(latest.next_change) - Date.now() - serverClockOffset) / 1000));
  const h = String(Math.floor(remaining / 3600)).padStart(2,'0');
  const m = String(Math.floor((remaining % 3600) / 60)).padStart(2,'0');
  const s = String(remaining % 60).padStart(2,'0');
  timer.textContent = latest.available ? `Calling window closes in ${h}:${m}:${s}` :
    `Next permission change in ${h}:${m}:${s} (${latest.timezone})`;
}
async function poll() {
  if (working || currentCall) return;
  try {
    const response = await fetch(`/api/c/${encodeURIComponent(token)}/state`,{cache:'no-store'});
    const data = await response.json();
    if (!response.ok) throw new Error('This code is not recognized.');
    latest = data;
    serverClockOffset = Date.parse(data.server_now) - Date.now();
    const labels = {
      'available':'Permission granted. You can request a call.',
      'revoked':'Access revoked. This paper cannot place calls.',
      'scheduled_closed':'Calling is closed outside the permitted hours.',
      'invalid':'This QR code is invalid.',
      'limit_reached':'This QR has reached its call allowance.',
      'busy':'A call is already in progress through this credential.',
      'unconfigured':'Recipient has not activated their number.',
      'not_licensed':'Recipient account is not activated.'
    };
    message(labels[data.status] || 'Calling is unavailable.');
    callButton.disabled = !data.available;
    countDown();
  } catch (err) { callButton.disabled = true; message('Unable to check permission. Retry shortly.',true); }
}
function finish() {
  if (currentDevice) { try { currentDevice.destroy(); } catch (_) { } }
  currentDevice = null; currentCall = null; working = false;
  hangupButton.hidden = true; callButton.hidden = false;
  callButton.disabled = true;
  poll();
}
callButton.addEventListener('click', async () => {
  if (working || currentCall) return;
  working = true; callButton.disabled = true;
  message('Checking access and preparing secure voice connection…');
  try {
    const response = await fetch(`/api/c/${encodeURIComponent(token)}/prepare`,{method:'POST',cache:'no-store'});
    const data = await response.json();
    if (!response.ok) {
      const detail = data.detail;
      throw new Error(typeof detail === 'object' ? `Call not permitted: ${detail.status}` : detail || 'Permission refused');
    }
    currentDevice = new Device(data.voice_token,{closeProtection:true});
    currentDevice.on('error', err => { message(`Voice connection error: ${err.message}`,true); finish(); });
    const call = await currentDevice.connect({params:{session:data.session}});
    currentCall = call;
    callButton.hidden = true; hangupButton.hidden = false;
    call.on('accept', () => message('Connected. Your number is not shared.'));
    call.on('disconnect', () => { message('The call has ended.'); finish(); });
    call.on('cancel', () => { message('Call canceled.'); finish(); });
    call.on('reject', () => { message('Call was declined or blocked.'); finish(); });
    call.on('error', err => { message(`Call failed: ${err.message}`,true); finish(); });
    message('Calling through the privacy gateway…');
    working = false;
  } catch (err) { message(`Unable to place call: ${err.message}`,true); finish(); }
});
hangupButton.addEventListener('click',() => {
  if (currentCall) currentCall.disconnect();
  finish();
});
setInterval(countDown, 1000);
nextPoll = setInterval(poll, 20000);
poll();
