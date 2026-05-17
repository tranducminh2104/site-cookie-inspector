'use strict';

const el = {
  hostname: document.getElementById('hostname'),
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
  // Facebook elements
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

let currentHostname = null;
let currentUrl = null;
let currentTabId = null;

const RESTRICTED = [
  /^chrome:\/\//i, /^chrome-extension:\/\//i, /^about:/i,
  /^edge:\/\//i, /^brave:\/\//i, /^devtools:\/\//i,
  /^view-source:/i, /^data:/i, /^blob:/i, /^file:\/\//i,
];

// Facebook domains that trigger token tools
const FB_DOMAINS = [
  'facebook.com',
  'www.facebook.com',
  'business.facebook.com',
  'adsmanager.facebook.com',
  'web.facebook.com',
];

function isFacebookDomain(hostname) {
  return FB_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
}

document.addEventListener('DOMContentLoaded', init);

async function init() {
  el.inspectBtn.addEventListener('click', handleInspect);
  el.copyBtn.addEventListener('click', () => handleCopy(el.cookieOutput, el.copyIcon, el.checkIcon, el.copyText));
  el.fbAdsTokenBtn.addEventListener('click', () => handleFbToken('ads'));
  el.fbBmTokenBtn.addEventListener('click', () => handleFbToken('bm'));
  el.copyTokenBtn.addEventListener('click', () => handleCopy(el.tokenOutput, el.copyTokenIcon, el.checkTokenIcon, el.copyTokenText));

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) {
      el.hostname.textContent = '\u2014';
      return disableInspect('Cannot detect the active tab.');
    }
    if (RESTRICTED.some(r => r.test(tab.url))) {
      el.hostname.textContent = 'Restricted page';
      return disableInspect('Not available on this page.');
    }
    const url = new URL(tab.url);
    currentHostname = url.hostname;
    currentUrl = tab.url;
    currentTabId = tab.id;
    if (!currentHostname) {
      el.hostname.textContent = '\u2014';
      return disableInspect('Unable to determine hostname.');
    }
    el.hostname.textContent = currentHostname;

    // Show Facebook tools if on Facebook domain
    if (isFacebookDomain(currentHostname)) {
      el.fbSection.hidden = false;
    }
  } catch (err) {
    el.hostname.textContent = '\u2014';
    disableInspect('Failed to detect the active tab.');
  }
}

function disableInspect(msg) {
  el.inspectBtn.disabled = true;
  showError(msg);
}
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

// ─── Cookie Inspection ───
async function handleInspect() {
  if (!currentHostname) return showError('No active site detected.');
  hideError();
  setButtonLoading(el.inspectBtn, true);

  try {
    let cookies = await chrome.cookies.getAll({ url: currentUrl });

    if (!cookies || cookies.length === 0) {
      cookies = await chrome.cookies.getAll({ domain: currentHostname });
    }

    if ((!cookies || cookies.length === 0) && currentHostname.startsWith('www.')) {
      const parent = currentHostname.replace(/^www\./, '');
      cookies = await chrome.cookies.getAll({ domain: parent });
    }

    if (!cookies || cookies.length === 0) {
      el.cookieCount.textContent = 'No cookies found';
      el.cookieOutput.value = '';
      el.cookieOutput.placeholder = 'No cookies found for this site.';
      el.outputSection.hidden = false;
      return;
    }

    const seen = new Map();
    for (const c of cookies) {
      if (!seen.has(c.name)) seen.set(c.name, c);
    }
    const unique = Array.from(seen.values());
    const str = unique.map(c => `${c.name}=${c.value}`).join('; ');

    el.cookieCount.textContent = `${unique.length} cookie${unique.length !== 1 ? 's' : ''} found`;
    el.cookieOutput.value = str;
    el.outputSection.hidden = false;
  } catch (err) {
    showError('Failed to retrieve cookies: ' + err.message);
  } finally {
    setButtonLoading(el.inspectBtn, false);
  }
}

// ─── Facebook Token Extraction ───
async function handleFbToken(type) {
  hideError();
  const btn = type === 'bm' ? el.fbBmTokenBtn : el.fbAdsTokenBtn;
  setButtonLoading(el.fbAdsTokenBtn, true);
  setButtonLoading(el.fbBmTokenBtn, true);

  try {
    const fetchUrl = type === 'bm'
      ? 'https://business.facebook.com/latest/settings/business_users/'
      : 'https://adsmanager.facebook.com/adsmanager/manage/campaigns/edit/standalone/';

    // Send message to background service worker
    // Background runs in extension context → no CORS restrictions
    const response = await chrome.runtime.sendMessage({
      action: 'fetchFacebookPage',
      url: fetchUrl,
    });

    if (!response || !response.ok) {
      const errMsg = response?.error || 'Unknown error';
      showError('Request failed: ' + errMsg);
      return;
    }

    const html = response.result.body;
    const token = extractFbToken(html);

    if (token) {
      el.tokenLabel.textContent = type === 'bm' ? 'BM Token' : 'Ads Token';
      el.tokenOutput.value = token;
      el.tokenOutputSection.hidden = false;
      showToast('Token extracted');
    } else {
      el.tokenLabel.textContent = 'No token found';
      el.tokenOutput.value = '';
      el.tokenOutput.placeholder = 'Could not find access token in response.';
      el.tokenOutputSection.hidden = false;
      showError('Token not found. Make sure you are logged into Facebook.');
    }
  } catch (err) {
    showError('Token extraction failed: ' + err.message);
  } finally {
    setButtonLoading(el.fbAdsTokenBtn, false);
    setButtonLoading(el.fbBmTokenBtn, false);
  }
}

function extractFbToken(html) {
  // Try multiple patterns Facebook uses to embed access tokens
  const patterns = [
    /"accessToken"\s*:\s*"(EAA[A-Za-z0-9]+)"/,
    /"access_token"\s*:\s*"(EAA[A-Za-z0-9]+)"/,
    /access_token=(EAA[A-Za-z0-9]+)/,
    /"token"\s*:\s*"(EAA[A-Za-z0-9]+)"/,
    /EAAG[A-Za-z0-9]{20,}/,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      // Return captured group if exists, otherwise full match
      return match[1] || match[0];
    }
  }
  return null;
}

// ─── Copy Handler ───
async function handleCopy(textarea, copyIcon, checkIcon, copyText) {
  const text = textarea.value;
  if (!text) return showToast('Nothing to copy');
  try {
    await navigator.clipboard.writeText(text);
    copyIcon.classList.add('hidden');
    checkIcon.classList.remove('hidden');
    copyText.textContent = 'Copied';
    copyText.parentElement.classList.add('copied');
    showToast('Copied to clipboard');
    setTimeout(() => {
      copyIcon.classList.remove('hidden');
      checkIcon.classList.add('hidden');
      copyText.textContent = 'Copy';
      copyText.parentElement.classList.remove('copied');
    }, 2000);
  } catch {
    textarea.select();
    showToast('Press Ctrl+C to copy');
  }
}
