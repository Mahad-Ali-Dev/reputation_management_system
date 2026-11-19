import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-static";

/**
 * GET /widget.js?key=<publicKey>
 *
 * Returns a self-contained chatbot widget JS bundle. Customers embed:
 *   <script src="https://chat.repulabs.com/widget.js?key=PUBLIC_KEY" async></script>
 *
 * The widget:
 *   - Bootstraps a visitor JWT via /api/ai/widget/bootstrap
 *   - Renders a floating chat bubble + panel using the org's WidgetConfig
 *     appearance (brand color / header / greeting / position) — falls back to the
 *     prior hard-coded look when the bootstrap omits a field (older deploys).
 *   - Calls /api/ai/chatbot/converse on each message send
 *   - When the bootstrap (or a converse turn) signals SMS handoff
 *     (config.captureMode === 'capture' / handoff.offerSmsHandoff), shows a
 *     "leave your number and we'll text you" capture that POSTs to
 *     /api/inbox/widget-handoff → startSmsHandoff.
 *
 * No external deps. Vanilla JS. ADDITIVE: defaults preserve the existing widget.
 */
export function GET(req: NextRequest) {
  const url = new URL(req.url);
  const apiBase = `${url.protocol}//${url.host}`;

  const js = `(function(){
  'use strict';
  var script = document.currentScript;
  var key = (script && (new URL(script.src).searchParams.get('key'))) || null;
  if (!key) { console.warn('[Repulabs] widget.js loaded without ?key=...'); return; }

  var API = ${JSON.stringify(apiBase)};
  var STATE = {
    token: null, visitorId: null, conversationId: null, messages: [], open: false,
    cfg: {}, captureMode: 'ai', offerSmsHandoff: false, captureShown: false
  };

  // ---- Appearance (overridable from bootstrap config; defaults = legacy look) ----
  var THEME = {
    brand: '#4f46e5', brandDark: '#4338ca', header: 'Chat with us', position: 'bottom-right'
  };

  function applyTheme(cfg) {
    if (!cfg) return;
    if (cfg.brandColor) { THEME.brand = cfg.brandColor; THEME.brandDark = cfg.brandColor; }
    if (cfg.headerText) THEME.header = cfg.headerText;
    if (cfg.position) THEME.position = cfg.position;
    // Re-render styles if the bubble was already built with defaults.
    if (document.getElementById('rl-style')) injectStyles();
  }

  function injectStyles() {
    // Re-injectable: remove any prior stylesheet so a theme update (post-bootstrap)
    // re-renders the bubble/panel with the org's brand color.
    var existing = document.getElementById('rl-style');
    if (existing) existing.remove();
    var side = THEME.position === 'bottom-left' ? 'left' : 'right';
    var css = ''
      + '.rl-bubble{position:fixed;bottom:24px;' + side + ':24px;width:60px;height:60px;border-radius:50%;'
      + 'background:' + THEME.brand + ';color:#fff;border:none;cursor:pointer;'
      + 'box-shadow:inset 0 1px 0 rgba(255,255,255,0.35),0 12px 28px -8px rgba(0,0,0,0.35);'
      + 'display:flex;align-items:center;justify-content:center;z-index:2147483647;'
      + 'transition:transform .2s ease,box-shadow .2s ease}'
      + '.rl-bubble:hover{transform:scale(1.06)}'
      + '.rl-bubble svg{width:26px;height:26px}'
      + '.rl-panel{position:fixed;bottom:100px;' + side + ':24px;width:380px;max-width:calc(100vw - 32px);'
      + 'height:560px;max-height:calc(100vh - 130px);background:rgba(255,255,255,0.86);'
      + '-webkit-backdrop-filter:blur(30px) saturate(180%);backdrop-filter:blur(30px) saturate(180%);'
      + 'border:1px solid rgba(255,255,255,0.9);border-radius:26px;'
      + 'box-shadow:0 0 0 .5px rgba(0,0,0,0.08),0 30px 70px -20px rgba(0,0,0,0.35);display:flex;flex-direction:column;overflow:hidden;'
      + "font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Roboto,sans-serif;z-index:2147483647;"
      + 'color:#1d1d1f;transform-origin:bottom ' + side + ';animation:rl-in .22s cubic-bezier(.2,.8,.2,1)}'
      + '@keyframes rl-in{from{opacity:0;transform:translateY(10px) scale(.96)}}'
      + '.rl-head{display:flex;align-items:center;gap:10px;padding:16px 16px 14px;border-bottom:1px solid rgba(60,60,67,0.1)}'
      + '.rl-avatar{width:36px;height:36px;border-radius:50%;background:' + THEME.brand + ';color:#fff;flex-shrink:0;'
      + 'display:flex;align-items:center;justify-content:center}'
      + '.rl-avatar svg{width:18px;height:18px}'
      + '.rl-title{flex:1;min-width:0}'
      + '.rl-title b{display:block;font-size:15px;font-weight:600;letter-spacing:-0.01em}'
      + '.rl-title span{display:flex;align-items:center;gap:5px;font-size:12px;color:#6e6e73}'
      + '.rl-title span:before{content:"";width:7px;height:7px;border-radius:50%;background:#34c759}'
      + '.rl-close{width:30px;height:30px;border-radius:50%;background:rgba(120,120,128,0.12);border:none;color:#6e6e73;'
      + 'cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0}'
      + '.rl-close:hover{background:rgba(120,120,128,0.2);color:#1d1d1f}'
      + '.rl-close svg{width:14px;height:14px}'
      + '.rl-body{flex:1;overflow-y:auto;padding:16px 14px;display:flex;flex-direction:column;gap:6px}'
      + '.rl-msg{padding:9px 14px;border-radius:20px;max-width:80%;font-size:15px;line-height:1.4;'
      + 'white-space:pre-wrap;word-wrap:break-word}'
      + '.rl-msg-bot{background:rgba(120,120,128,0.12);color:#1d1d1f;align-self:flex-start;border-bottom-left-radius:6px}'
      + '.rl-msg-user{background:' + THEME.brand + ';color:#fff;align-self:flex-end;border-bottom-right-radius:6px}'
      + '.rl-msg-note{align-self:center;max-width:90%;background:none;color:#86868b;font-size:12.5px;text-align:center}'
      + '.rl-foot{padding:10px 12px 14px}'
      + '.rl-compose{display:flex;align-items:center;gap:6px;padding:4px 4px 4px 14px;border:1px solid rgba(60,60,67,0.16);'
      + 'border-radius:999px;background:#fff}'
      + '.rl-compose:focus-within{border-color:' + THEME.brand + '}'
      + '.rl-input{flex:1;min-width:0;border:none;background:transparent;padding:8px 0;font-size:15px;outline:none;color:#1d1d1f;font-family:inherit}'
      + '.rl-send{width:34px;height:34px;border-radius:50%;background:' + THEME.brand + ';color:#fff;border:none;cursor:pointer;'
      + 'display:flex;align-items:center;justify-content:center;flex-shrink:0}'
      + '.rl-send svg{width:16px;height:16px}'
      + '.rl-send:disabled{opacity:.35;cursor:default}'
      + '.rl-brand{margin-top:8px;text-align:center;font-size:11px;color:#86868b}'
      + '.rl-loading{align-self:flex-start;display:flex;gap:4px;padding:12px 14px;border-radius:20px;border-bottom-left-radius:6px;background:rgba(120,120,128,0.12)}'
      + '.rl-loading i{width:7px;height:7px;border-radius:50%;background:#86868b;animation:rl-dot 1.2s infinite ease-in-out}'
      + '.rl-loading i:nth-child(2){animation-delay:.15s}.rl-loading i:nth-child(3){animation-delay:.3s}'
      + '@keyframes rl-dot{0%,80%,100%{opacity:.3}40%{opacity:1}}'
      + '.rl-capture{margin:6px 0 4px;padding:14px;border-radius:18px;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,0.06)}'
      + '.rl-capture p{margin:0 0 10px;font-size:14px;color:#1d1d1f;line-height:1.4}'
      + '.rl-capture-row{display:flex;gap:6px}'
      + '.rl-capture input{flex:1;min-width:0;border:1px solid transparent;border-radius:12px;padding:9px 12px;font-size:15px;outline:none;'
      + 'background:rgba(120,120,128,0.08);font-family:inherit}'
      + '.rl-capture input:focus{border-color:' + THEME.brand + ';background:#fff}'
      + '.rl-capture button{background:' + THEME.brand + ';color:#fff;border:none;padding:9px 14px;border-radius:999px;cursor:pointer;font-weight:600;font-size:14px;font-family:inherit}'
      + '.rl-capture small{display:block;margin-top:8px;color:#86868b;font-size:11px;line-height:1.35}';
    var style = document.createElement('style');
    style.id = 'rl-style';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ---- Bootstrap ----
  function bootstrap() {
    return fetch(API + '/api/ai/widget/bootstrap?key=' + encodeURIComponent(key), { credentials: 'omit' })
      .then(function(r){ return r.json(); })
      .then(function(data){
        if (data.token) {
          STATE.token = data.token;
          STATE.visitorId = data.visitorId;
          STATE.cfg = data.config || {};
          applyTheme(STATE.cfg);
          if (STATE.cfg.captureMode) STATE.captureMode = STATE.cfg.captureMode;
          if (STATE.cfg.offerSmsHandoff) STATE.offerSmsHandoff = true;
          var greeting = STATE.cfg.greeting || 'Hi! How can I help you today?';
          STATE.messages.push({ role: 'bot', text: greeting });
        } else {
          console.warn('[Repulabs] bootstrap failed:', data.error);
          STATE.messages.push({ role: 'note', text: data.error === 'origin_not_allowed'
            ? 'This chat isn\\u2019t enabled for this website yet.'
            : 'Chat is unavailable right now. Please try again later.' });
        }
      })
      .catch(function(e){
        console.warn('[Repulabs] bootstrap error', e);
        STATE.messages.push({ role: 'note', text: 'Chat is unavailable right now. Please try again later.' });
      });
  }

  // Bootstrap can finish after the visitor already opened the panel (slow
  // network / cold server): redraw so the greeting appears instead of an
  // empty chat.
  function afterBootstrap() {
    if (STATE.open) renderMessages();
  }

  // ---- UI ----
  var bubble, panel, body, input, sendBtn;
  var READY = null;

  function buildUi() {
    injectStyles();
    bubble = document.createElement('button');
    bubble.className = 'rl-bubble';
    bubble.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>';
    bubble.setAttribute('aria-label', 'Open chat');
    bubble.onclick = togglePanel;
    document.body.appendChild(bubble);
  }

  function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function togglePanel() {
    if (STATE.open) {
      panel && panel.remove();
      STATE.open = false;
      return;
    }
    STATE.open = true;
    panel = document.createElement('div');
    panel.className = 'rl-panel';
    panel.innerHTML =
      '<div class="rl-head"><span class="rl-avatar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.94 14.06 4 20M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/></svg></span>'
      + '<div class="rl-title"><b>' + escapeHtml(THEME.header) + '</b><span>Usually replies instantly</span></div>'
      + '<button class="rl-close" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>'
      + '<div class="rl-body"></div>'
      + '<div class="rl-foot"><div class="rl-compose"><input class="rl-input" placeholder="Message\\u2026" aria-label="Message" />'
      + '<button class="rl-send" aria-label="Send"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button></div>'
      + '<div class="rl-brand">Powered by Repulabs</div></div>';
    document.body.appendChild(panel);
    body = panel.querySelector('.rl-body');
    input = panel.querySelector('.rl-input');
    sendBtn = panel.querySelector('.rl-send');
    panel.querySelector('.rl-close').onclick = togglePanel;
    sendBtn.onclick = sendMessage;
    input.onkeydown = function(e){ if (e.key === 'Enter') sendMessage(); };
    renderMessages();
    // If the org is after-hours / handoff mode, offer the capture immediately.
    if (STATE.captureMode === 'capture') maybeShowCapture();
    input.focus();
  }

  function renderMessages() {
    if (!body) return;
    body.innerHTML = '';
    STATE.messages.forEach(function(m){
      var el = document.createElement('div');
      el.className = 'rl-msg rl-msg-' + m.role;
      el.textContent = m.text;
      body.appendChild(el);
    });
    body.scrollTop = body.scrollHeight;
  }

  // ---- SMS handoff capture ----
  function maybeShowCapture() {
    if (STATE.captureShown || !STATE.offerSmsHandoff || !body) return;
    STATE.captureShown = true;
    var box = document.createElement('div');
    box.className = 'rl-capture';
    box.innerHTML =
      '<p>Leave your number and we\\u2019ll text you back.</p>'
      + '<div class="rl-capture-row"><input type="tel" placeholder="(555) 123-4567" aria-label="Phone number" />'
      + '<button type="button">Text me</button></div>'
      + '<small>By submitting you agree to receive SMS at this number. Msg &amp; data rates may apply. Reply STOP to opt out.</small>';
    var phoneInput = box.querySelector('input');
    var submitBtn = box.querySelector('button');
    submitBtn.onclick = function(){
      var phone = (phoneInput.value || '').trim();
      if (!phone) return;
      submitBtn.disabled = true;
      submitBtn.textContent = '\\u2026';
      fetch(API + '/api/inbox/widget-handoff', {
        method: 'POST', credentials: 'omit',
        headers: { 'authorization': 'Bearer ' + STATE.token, 'content-type': 'application/json' },
        body: JSON.stringify({ phone: phone, conversationId: STATE.conversationId })
      })
        .then(function(r){ return r.json().then(function(j){ return { ok: r.ok, body: j }; }); })
        .then(function(res){
          box.remove();
          STATE.messages.push({ role: 'bot', text: (res.body && res.body.message) || 'Thanks! We\\u2019ll be in touch.' });
          renderMessages();
        })
        .catch(function(){
          submitBtn.disabled = false;
          submitBtn.textContent = 'Text me';
        });
    };
    body.appendChild(box);
    body.scrollTop = body.scrollHeight;
  }

  function sendMessage() {
    var text = (input.value || '').trim();
    if (!text) return;
    // Still connecting (slow network / cold server): send as soon as ready
    // instead of silently dropping the visitor's message.
    if (!STATE.token) {
      if (READY) READY.then(function(){ if (STATE.token) sendMessage(); });
      return;
    }
    STATE.messages.push({ role: 'user', text: text });
    renderMessages();
    input.value = '';
    sendBtn.disabled = true;

    var loading = document.createElement('div');
    loading.className = 'rl-loading';
    loading.setAttribute('aria-label', 'Thinking');
    loading.innerHTML = '<i></i><i></i><i></i>';
    body.appendChild(loading);
    body.scrollTop = body.scrollHeight;

    fetch(API + '/api/ai/chatbot/converse', {
      method: 'POST',
      credentials: 'omit',
      headers: {
        'authorization': 'Bearer ' + STATE.token,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ message: text, conversationId: STATE.conversationId }),
    })
      .then(function(r){ return r.json().then(function(j){ return { ok: r.ok, body: j }; }); })
      .then(function(res){
        loading.remove();
        sendBtn.disabled = false;
        if (res.ok && res.body.answer) {
          STATE.conversationId = res.body.conversationId;
          STATE.messages.push({ role: 'bot', text: res.body.answer });
          // Honour an escalation/handoff signal from the turn (additive field).
          var h = res.body.handoff;
          if (h && h.offerSmsHandoff) { STATE.offerSmsHandoff = true; STATE.captureMode = 'capture'; }
          renderMessages();
          if (STATE.captureMode === 'capture') maybeShowCapture();
          return;
        } else if (res.body.message) {
          STATE.messages.push({ role: 'bot', text: res.body.message });
        } else {
          STATE.messages.push({ role: 'bot', text: 'Sorry, something went wrong.' });
        }
        renderMessages();
      })
      .catch(function(e){
        loading.remove();
        sendBtn.disabled = false;
        STATE.messages.push({ role: 'bot', text: 'Connection error. Please try again.' });
        renderMessages();
      });
  }

  // Init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ buildUi(); READY = bootstrap().then(afterBootstrap); });
  } else {
    buildUi();
    READY = bootstrap().then(afterBootstrap);
  }
})();`;

  return new NextResponse(js, {
    headers: {
      "content-type": "application/javascript",
      "cache-control": "public, max-age=300",
    },
  });
}
