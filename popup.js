'use strict';

// ─── DOM Elements ───
const el = {
  hostname: document.getElementById('hostname'),
  siteBadge: document.getElementById('siteBadge'),
  inspectBtn: document.getElementById('inspectBtn'),
  errorMessage: document.getElementById('errorMessage'),
  errorText: document.getElementById('errorText'),
  outputSection: document.getElementById('outputSection'),
  cookieOutput: document.getElementById('cookieOutput'),
  cookieCount: document.getElementById('cookieCount'),
  copyBtn: document.getElementById('copyBtn'),
  copyIcon: document.getElementById('copyIcon'),
  checkIcon: document.getElementById('checkIcon'),
  copyText: document.getElementById('copyText'),
  toast: document.getElementById('toast'),
  fbSection: document.getElementById('fbSection'),
  fbAdsTokenBtn: document.getElementById('fbAdsTokenBtn'),
  fbBmTokenBtn: document.getElementById('fbBmTokenBtn'),

  tokenOutputSection: document.getElementById('tokenOutputSection'),
  tokenOutput: document.getElementById('tokenOutput'),
  tokenLabel: document.getElementById('tokenLabel'),
  copyTokenBtn: document.getElementById('copyTokenBtn'),
  copyTokenIcon: document.getElementById('copyTokenIcon'),
  checkTokenIcon: document.getElementById('checkTokenIcon'),
  copyTokenText: document.getElementById('copyTokenText'),
};

// ─── State ───
let currentHostname = null;
let currentUrl = null;
let currentTabId = null;

// ─── Facebook fetch URL map ───
const FACEBOOK_FETCH_URLS = {
  ads: 'https://adsmanager.facebook.com/adsmanager/manage/campaigns/edit/standalone/',
  bm: 'https://business.facebook.com/latest/settings/business_users/',
  bm_fallback: 'https://business.facebook.com/business_locations/',
};

// ─── PART 3: Safe tab detection ───
async function getActiveTabSafe() {
  let tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs || !tabs.length) {
    tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  }
  const tab = tabs && tabs[0];
  if (!tab || !tab.id || !tab.url) {
    throw new Error('Cannot detect the active tab.');
  }
  return tab;
}

function parseHostnameSafe(url) {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.hostname;
  } catch {
    return null;
  }
}

// ─── PART 4: Site type detection ───
function detectSiteType(hostname) {
  if (!hostname) return 'unknown';
  const h = hostname.replace(/^www\./, '');
  if (h === 'facebook.com' || h.endsWith('.facebook.com')) return 'facebook';
  if (h === 'instagram.com' || h.endsWith('.instagram.com')) return 'instagram';
  if (h === 'tiktok.com' || h.endsWith('.tiktok.com')) return 'tiktok';
  if (h === 'youtube.com' || h.endsWith('.youtube.com')) return 'youtube';
  if (h === 'twitter.com' || h === 'x.com' || h.endsWith('.x.com')) return 'x';
  if (h === 'xiaohongshu.com' || h.endsWith('.xiaohongshu.com')) return 'xiaohongshu';
  return 'other';
}

function updateToolsVisibility(siteType) {
  el.fbSection.hidden = siteType !== 'facebook';

  // Show site badge for recognized platforms
  const badges = {
    facebook: 'Facebook',
    instagram: 'Instagram',
    tiktok: 'TikTok',
    youtube: 'YouTube',
    x: 'X / Twitter',
    xiaohongshu: 'Xiaohongshu',
  };

  if (badges[siteType]) {
    el.siteBadge.textContent = badges[siteType];
    el.siteBadge.className = 'site-badge badge-' + siteType;
    el.siteBadge.hidden = false;
  } else {
    el.siteBadge.hidden = true;
  }
}

// ─── PART 1: Login/checkpoint detection ───
// ONLY check finalUrl for actual redirects — do NOT scan HTML body
// because normal Facebook pages contain 'login', 'checkpoint' text in JS bundles
function isFacebookLoginOrCheckpoint(result) {
  const url = (result.finalUrl || '').toLowerCase();
  // Only flag if actually redirected to a login/checkpoint URL
  if (!result.redirected) return false;
  return (
    url.includes('/login') ||
    url.includes('/checkpoint') ||
    url.includes('/two_factor') ||
    url.includes('login.php') ||
    url.includes('checkpoint.php')
  );
}

// ─── Token extraction ───
function extractFbToken(html) {
  const patterns = [
    // window.__accessToken="EAABsbCS1iNgBO..."  (Ads Manager actual format)
    /__accessToken\s*=\s*"(EAA[A-Za-z0-9]+)"/,
    /__accessToken\s*=\s*'(EAA[A-Za-z0-9]+)'/,
    // JSON format: "accessToken":"EAA..."
    /"accessToken"\s*:\s*"(EAA[A-Za-z0-9]+)"/,
    /"access_token"\s*:\s*"(EAA[A-Za-z0-9]+)"/,
    // URL param format
    /access_token=(EAA[A-Za-z0-9]+)/,
    /"token"\s*:\s*"(EAA[A-Za-z0-9]+)"/,
    // Generic fallback: any EAA token (20+ chars)
    /EAA[A-Za-z0-9]{20,}/,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return m[1] || m[0];
  }
  return null;
}

// ─── Init ───
document.addEventListener('DOMContentLoaded', init);

async function init() {
  el.inspectBtn.addEventListener('click', handleInspect);
  el.copyBtn.addEventListener('click', () => handleCopy(el.cookieOutput, el.copyIcon, el.checkIcon, el.copyText));
  el.fbAdsTokenBtn.addEventListener('click', () => handleFbToken('ads'));
  el.fbBmTokenBtn.addEventListener('click', () => handleFbToken('bm'));

  el.copyTokenBtn.addEventListener('click', () => handleCopy(el.tokenOutput, el.copyTokenIcon, el.checkTokenIcon, el.copyTokenText));

  try {
    const tab = await getActiveTabSafe();
    currentTabId = tab.id;
    currentUrl = tab.url;
    currentHostname = parseHostnameSafe(tab.url);

    if (!currentHostname) {
      el.hostname.textContent = '\u2014';
      el.inspectBtn.disabled = true;
      showError('Không thể kiểm tra trang này. Hãy mở một tab website bình thường rồi thử lại.');
      return;
    }

    el.hostname.textContent = currentHostname;
    const siteType = detectSiteType(currentHostname);
    updateToolsVisibility(siteType);
  } catch (err) {
    el.hostname.textContent = '\u2014';
    el.inspectBtn.disabled = true;
    showError(err.message || 'Không thể phát hiện tab hiện tại.');
  }
}

// ─── UI Helpers ───
function showError(msg) {
  el.errorText.textContent = msg;
  el.errorMessage.hidden = false;
}
function hideError() { el.errorMessage.hidden = true; }

function setButtonLoading(btn, on) {
  btn.classList.toggle('loading', on);
  btn.disabled = on;
}

function showToast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  setTimeout(() => el.toast.classList.remove('show'), 2000);
}

// ─── PART 5: Cookie Inspection ───
async function handleInspect() {
  if (!currentHostname) return showError('Không phát hiện được trang web.');
  hideError();
  setButtonLoading(el.inspectBtn, true);

  try {
    const baseHostname = currentHostname.replace(/^www\./, '');
    const queries = [
      { url: currentUrl },
      { domain: currentHostname },
      { domain: '.' + baseHostname },
      { domain: baseHostname },
    ];

    const allCookies = [];
    for (const q of queries) {
      try {
        const c = await chrome.cookies.getAll(q);
        if (c && c.length) allCookies.push(...c);
      } catch { /* skip failed query */ }
    }

    // Deduplicate by name|domain|path
    const seen = new Map();
    for (const c of allCookies) {
      const key = `${c.name}|${c.domain}|${c.path}`;
      if (!seen.has(key)) seen.set(key, c);
    }
    const unique = Array.from(seen.values());

    if (unique.length === 0) {
      el.cookieCount.textContent = 'Không tìm thấy cookies';
      el.cookieOutput.value = '';
      el.cookieOutput.placeholder = 'Không tìm thấy cookies cho trang này.';
      el.outputSection.hidden = false;
      return;
    }

    // For output string: deduplicate by name, prefer most specific domain
    const byName = new Map();
    for (const c of unique) {
      if (!byName.has(c.name) || c.domain.length > byName.get(c.name).domain.length) {
        byName.set(c.name, c);
      }
    }
    const outputCookies = Array.from(byName.values());
    const str = outputCookies.map(c => `${c.name}=${c.value}`).join('; ');

    el.cookieCount.textContent = `${unique.length} cookie${unique.length !== 1 ? 's' : ''} (${outputCookies.length} unique names)`;
    el.cookieOutput.value = str;
    el.outputSection.hidden = false;
  } catch (err) {
    showError('Lỗi lấy cookies: ' + err.message);
  } finally {
    setButtonLoading(el.inspectBtn, false);
  }
}

// ─── Facebook Token Fetch ───
async function handleFbToken(type) {
  hideError();
  setButtonLoading(el.fbAdsTokenBtn, true);
  setButtonLoading(el.fbBmTokenBtn, true);

  try {
    // For BM: try primary URL first, then fallback to business_locations
    const urlsToTry = type === 'bm'
      ? [FACEBOOK_FETCH_URLS.bm, FACEBOOK_FETCH_URLS.bm_fallback]
      : [FACEBOOK_FETCH_URLS[type]];

    let token = null;
    let lastResult = null;

    for (const fetchUrl of urlsToTry) {
      if (!fetchUrl) continue;

      console.log('[DHB] Trying:', fetchUrl);

      const response = await chrome.runtime.sendMessage({
        action: 'fetchFacebookPage',
        url: fetchUrl,
      });

      if (!response || !response.ok) {
        console.log('[DHB] Request failed:', response?.error);
        continue;
      }

      lastResult = response.result;
      const html = lastResult.body || '';

      // Debug log
      console.log('[DHB Cookie Inspector]', {
        type,
        url: fetchUrl,
        status: lastResult.status,
        finalUrl: lastResult.finalUrl,
        redirected: lastResult.redirected,
        bodyLength: lastResult.bodyLength,
      });

      // Skip if bad HTTP status
      if (lastResult.status < 200 || lastResult.status >= 300) continue;

      // Skip if redirected to login
      if (isFacebookLoginOrCheckpoint(lastResult)) continue;

      // Skip if body too short
      if (lastResult.bodyLength < 500) continue;

      // Try to extract token
      token = extractFbToken(html);
      if (token) break; // found it!
    }

    // ─── Show result ───
    if (token) {
      el.tokenLabel.textContent = type === 'bm' ? 'BM Token' : 'Ads Token';
      el.tokenOutput.value = token;
      el.tokenOutputSection.hidden = false;
      showToast('Đã lấy token thành công');
    } else if (lastResult && isFacebookLoginOrCheckpoint(lastResult)) {
      showError('Facebook đã chuyển hướng đến trang đăng nhập. Hãy mở Facebook/Ads Manager, hoàn tất đăng nhập hoặc 2FA, rồi thử lại.');
    } else if (lastResult && lastResult.bodyLength < 500) {
      showError('Trang Facebook trả về phản hồi quá ngắn.');
    } else {
      el.tokenLabel.textContent = 'Không tìm thấy token';
      el.tokenOutput.value = '';
      el.tokenOutput.placeholder = 'Không tìm thấy access token trong phản hồi.';
      el.tokenOutputSection.hidden = false;
      showError('Đã tải trang thành công nhưng không tìm thấy dữ liệu. Hãy mở Ads Manager trong trình duyệt, hoàn tất đăng nhập/2FA, rồi thử lại.');
    }
  } catch (err) {
    showError('Lỗi lấy token: ' + err.message);
  } finally {
    setButtonLoading(el.fbAdsTokenBtn, false);
    setButtonLoading(el.fbBmTokenBtn, false);
  }
}

// ─── Copy Handler ───
async function handleCopy(textarea, copyIcon, checkIcon, copyText) {
  const text = textarea.value;
  if (!text) return showToast('Không có gì để sao chép');
  try {
    await navigator.clipboard.writeText(text);
    copyIcon.classList.add('hidden');
    checkIcon.classList.remove('hidden');
    copyText.textContent = 'Đã chép';
    copyText.parentElement.classList.add('copied');
    showToast('Đã sao chép');
    setTimeout(() => {
      copyIcon.classList.remove('hidden');
      checkIcon.classList.add('hidden');
      copyText.textContent = 'Sao chép';
      copyText.parentElement.classList.remove('copied');
    }, 2000);
  } catch {
    textarea.select();
    showToast('Nhấn Ctrl+C để sao chép');
  }
}
