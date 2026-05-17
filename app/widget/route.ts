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
 *   - Renders a floating chat bubble + panel
 *   - Calls /api/ai/chatbot/converse on each message send
 *
 * No external deps. Vanilla JS, ~5KB minified. CSP-friendly (no inline scripts after this one).
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
  var STATE = { token: null, visitorId: null, conversationId: null, messages: [], open: false };

  // ---- Styles ----
  var css = \`
    .rl-bubble{position:fixed;bottom:24px;right:24px;width:56px;height:56px;border-radius:50%;
      background:#4f46e5;color:#fff;border:none;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,0.16);
      font-size:24px;line-height:1;display:flex;align-items:center;justify-content:center;z-index:2147483647}
    .rl-bubble:hover{background:#4338ca}
    .rl-panel{position:fixed;bottom:96px;right:24px;width:360px;max-width:calc(100vw - 32px);
      height:480px;max-height:calc(100vh - 120px);background:#fff;border-radius:12px;
      box-shadow:0 12px 40px rgba(0,0,0,0.2);display:flex;flex-direction:column;overflow:hidden;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;z-index:2147483647}
    .rl-head{background:#4f46e5;color:#fff;padding:14px 16px;display:flex;justify-content:space-between;
      align-items:center;font-weight:600}
    .rl-close{background:none;border:none;color:#fff;font-size:20px;cursor:pointer;line-height:1}
    .rl-body{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;background:#f8fafc}
    .rl-msg{padding:8px 12px;border-radius:12px;max-width:80%;font-size:14px;line-height:1.4;
      white-space:pre-wrap;word-wrap:break-word}
    .rl-msg-bot{background:#fff;color:#0f172a;align-self:flex-start;border:1px solid #e2e8f0}
    .rl-msg-user{background:#4f46e5;color:#fff;align-self:flex-end}
    .rl-foot{padding:10px;display:flex;gap:6px;border-top:1px solid #e2e8f0;background:#fff}
    .rl-input{flex:1;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;font-size:14px;outline:none}
    .rl-input:focus{border-color:#4f46e5}
    .rl-send{background:#4f46e5;color:#fff;border:none;padding:8px 14px;border-radius:8px;cursor:pointer;font-weight:600}
    .rl-send:disabled{opacity:.5;cursor:not-allowed}
    .rl-loading{align-self:flex-start;color:#94a3b8;font-size:13px;padding:8px 12px;font-style:italic}
  \`;
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ---- Bootstrap ----
  function bootstrap() {
    return fetch(API + '/api/ai/widget/bootstrap?key=' + encodeURIComponent(key), { credentials: 'omit' })
      .then(function(r){ return r.json(); })
      .then(function(data){
        if (data.token) {
          STATE.token = data.token;
          STATE.visitorId = data.visitorId;
          if (data.config && data.config.greeting) {
            STATE.messages.push({ role: 'bot', text: data.config.greeting });
          }
        } else {
          console.warn('[Repulabs] bootstrap failed:', data.error);
        }
      })
      .catch(function(e){ console.warn('[Repulabs] bootstrap error', e); });
  }

  // ---- UI ----
  var bubble, panel, body, input, sendBtn;

  function buildUi() {
    bubble = document.createElement('button');
    bubble.className = 'rl-bubble';
    bubble.innerHTML = '💬';
    bubble.setAttribute('aria-label', 'Open chat');
    bubble.onclick = togglePanel;
    document.body.appendChild(bubble);
  }

  function togglePanel() {
    if (STATE.open) {
      panel && panel.remove();
      STATE.open = false;
      return;
    }
    STATE.open = true;
    panel = document.createElement('div');
    panel.className = 'rl-panel';
    panel.innerHTML = \`
      <div class="rl-head">
        <span>Chat with us</span>
        <button class="rl-close" aria-label="Close">×</button>
      </div>
      <div class="rl-body"></div>
      <div class="rl-foot">
        <input class="rl-input" placeholder="Type a message…" />
        <button class="rl-send">Send</button>
      </div>
    \`;
    document.body.appendChild(panel);
    body = panel.querySelector('.rl-body');
    input = panel.querySelector('.rl-input');
    sendBtn = panel.querySelector('.rl-send');
    panel.querySelector('.rl-close').onclick = togglePanel;
    sendBtn.onclick = sendMessage;
    input.onkeydown = function(e){ if (e.key === 'Enter') sendMessage(); };
    renderMessages();
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

  function sendMessage() {
    var text = (input.value || '').trim();
    if (!text || !STATE.token) return;
    STATE.messages.push({ role: 'user', text: text });
    renderMessages();
    input.value = '';
    sendBtn.disabled = true;

    var loading = document.createElement('div');
    loading.className = 'rl-loading';
    loading.textContent = 'Thinking…';
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
    document.addEventListener('DOMContentLoaded', function(){ buildUi(); bootstrap(); });
  } else {
    buildUi();
    bootstrap();
  }
})();`;

  return new NextResponse(js, {
    headers: {
      "content-type": "application/javascript",
      "cache-control": "public, max-age=300",
    },
  });
}
