'use strict';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action !== 'fetchFacebookPage') return;

  fetchFacebookPage(message.url)
    .then(result => sendResponse({ ok: true, result }))
    .catch(error => sendResponse({ ok: false, error: error.message }));

  return true;
});

async function fetchFacebookPage(url) {
  const allowedOrigins = [
    'https://adsmanager.facebook.com',
    'https://business.facebook.com',
  ];

  const parsed = new URL(url);

  if (!allowedOrigins.includes(parsed.origin)) {
    throw new Error('Blocked URL origin: ' + parsed.origin);
  }

  const resp = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  const body = await resp.text();

  return {
    status: resp.status,
    finalUrl: resp.url,
    contentType: resp.headers.get('content-type') || '',
    redirected: resp.redirected,
    bodyLength: body.length,
    body,
  };
}
