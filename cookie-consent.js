// cookie-consent.js – uruchamia GA/Pixel dopiero po zgodzie
(function() {
  const STORAGE_KEY = 'cookie-consent-v2';

  function getSaved() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch(e){ return null; }
  }
  
  function save(cons) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ consents: cons, ts: Date.now(), v: '2.0' }));
    // Loguj zgodę do backendu (RODO compliance)
    fetch('/.netlify/functions/log-consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consents: cons, version: '2.0' })
    }).catch(err => console.warn('Consent logging failed:', err));
  }

  function activateScriptTag(tag) {
    // Stworzymy prawdziwy <script> i podmienimy placeholder
    const real = document.createElement('script');
    // skopiuj atrybuty poza naszymi meta-atr.
    for (const {name, value} of Array.from(tag.attributes)) {
      if (name === 'type' || name === 'data-category') continue;
      // POPRAWKA: Obsługa data-src dla skryptów zewnętrznych
      if (name === 'data-src') {
        real.src = value;
        continue;
      }
      real.setAttribute(name, value);
    }
    // Jeśli nie ma data-src, sprawdź zwykły src
    if (tag.src && !tag.getAttribute('data-src')) {
      real.src = tag.src; // external
    } else if (!tag.getAttribute('data-src')) {
      real.text = tag.text || tag.textContent || '';
    }
    // Podmień w DOM
    tag.parentNode.insertBefore(real, tag);
    tag.remove();
  }

  function applyConsents(cons) {
    // Aktywuj skrypty wg kategorii
    const tags = document.querySelectorAll('script[type="text/plain"][data-category]');
    tags.forEach(tag => {
      const cat = tag.getAttribute('data-category');
      if (cat === 'analytics' && cons.analytics) activateScriptTag(tag);
      if (cat === 'marketing' && cons.marketing) activateScriptTag(tag);
      if (cat === 'functional' && cons.functional) activateScriptTag(tag);
    });

    // Consent Mode v2 (jeśli używamy gtag)
    window.dataLayer = window.dataLayer || [];
    function gtag(){ dataLayer.push(arguments); }
    const analytics = cons.analytics ? 'granted' : 'denied';
    const marketing = cons.marketing ? 'granted' : 'denied';
    gtag('consent', 'update', {
      ad_storage: marketing,
      ad_user_data: marketing,
      ad_personalization: marketing,
      analytics_storage: analytics,
      functionality_storage: cons.functional ? 'granted' : 'denied',
      personalization_storage: cons.functional ? 'granted' : 'denied',
      security_storage: 'granted' // zawsze granted dla bezpieczeństwa
    });
  }

  function ensureConsentDefaults() {
    // Domyślnie blokujemy: nic nie odpalamy
    window.dataLayer = window.dataLayer || [];
    function gtag(){ dataLayer.push(arguments); }
    gtag('consent', 'default', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
      functionality_storage: 'denied',
      personalization_storage: 'denied',
      security_storage: 'granted',
      wait_for_update: 500 // czekaj 500ms na update zgód
    });
  }

  function showBanner() {
    // Prosty, lekki baner – możesz zastąpić swoim, jeśli już masz
    const wrap = document.createElement('div');
    wrap.className = 'cookie-consent-modal';
    wrap.innerHTML = `
      <div class="cookie-modal-overlay" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9998;"></div>
      <div class="cookie-modal-content" style="position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:9999;background:#fff;padding:16px 18px;border-radius:12px;max-width:720px;width:calc(100% - 24px);box-shadow:0 8px 30px rgba(0,0,0,.15);font-family:inherit;">
        <h3 style="margin:0 0 8px;font-size:18px;">Ustawienia plików cookie</h3>
        <p style="margin:0 0 10px;font-size:14px;line-height:1.4;">
          Używamy niezbędnych plików cookie, a <u>opcjonalnie po Twojej zgodzie</u> – analitycznych i marketingowych.
        </p>
        <div class="cookie-categories" style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px;font-size:14px;">
          <label><input type="checkbox" checked disabled> Niezbędne</label>
          <label><input id="consent-analytics" type="checkbox"> Analityczne</label>
          <label><input id="consent-marketing" type="checkbox"> Marketingowe</label>
        </div>
        <div class="cookie-buttons" style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn-reject-all" style="padding:8px 12px;border-radius:8px;border:1px solid #ccc;background:#fff;cursor:pointer;">Odrzuć</button>
          <button class="btn-accept-selected" style="padding:8px 12px;border-radius:8px;border:1px solid #444;background:#f7f7f7;cursor:pointer;">Zapisz wybór</button>
          <button class="btn-accept-all" style="padding:8px 12px;border-radius:8px;border:0;background:#ff7a00;color:#fff;cursor:pointer;">Akceptuj wszystkie</button>
          <a href="/Polityka Prywatności.html" style="margin-left:auto;font-size:13px;color:#555;text-decoration:underline;">Polityka prywatności</a>
        </div>
      </div>`;
    document.body.appendChild(wrap);

    const btnReject = wrap.querySelector('.btn-reject-all');
    const btnSave   = wrap.querySelector('.btn-accept-selected');
    const btnAll    = wrap.querySelector('.btn-accept-all');

    btnReject.addEventListener('click', () => {
      const cons = { necessary: true, analytics: false, marketing: false, functional: false };
      save(cons); applyConsents(cons); wrap.remove();
    });
    btnSave.addEventListener('click', () => {
      const cons = {
        necessary: true,
        analytics: wrap.querySelector('#consent-analytics').checked,
        marketing: wrap.querySelector('#consent-marketing').checked,
        functional: false
      };
      save(cons); applyConsents(cons); wrap.remove();
    });
    btnAll.addEventListener('click', () => {
      const cons = { necessary: true, analytics: true, marketing: true, functional: false };
      save(cons); applyConsents(cons); wrap.remove();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    ensureConsentDefaults();
    const saved = getSaved();
    if (saved && saved.consents) {
      applyConsents(saved.consents);
    } else {
      // Pokaż banner po 2 sekundach dla lepszego UX
      setTimeout(() => showBanner(), 2000);
    }
  });
})();