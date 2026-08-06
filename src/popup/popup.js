const ICON_EYE = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
  <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/>
  <circle cx="12" cy="12" r="3"/>
</svg>`;

const ICON_EYE_OFF = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
  <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
  <line x1="1" y1="1" x2="23" y2="23"/>
</svg>`;

const API_KEY_NAMES = ['googleApiKey', 'baiduAppId', 'baiduKey'];

function sendToActiveTab(message) {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (!tabs[0]?.id) return;
    chrome.tabs.sendMessage(tabs[0].id, message, function () {
      void chrome.runtime.lastError;
    });
  });
}

function showSaveMessage(text, variant) {
  const el = document.getElementById('saveMessage');
  el.textContent = text;
  el.className = 'save-message' + (variant ? ' save-message--' + variant : '');
  if (text) {
    setTimeout(() => {
      el.textContent = '';
      el.className = 'save-message';
    }, 3000);
  }
}

document.getElementById('saveButton').addEventListener('click', function () {
  const googleApiKey = document.getElementById('googleApiKey').value.trim();
  const baiduAppId = document.getElementById('baiduAppId').value.trim();
  const baiduKey = document.getElementById('baiduKey').value.trim();

  chrome.storage.local.set(
    {
      googleApiKey: googleApiKey,
      baiduAppId: baiduAppId,
      baiduKey: baiduKey
    },
    function () {
      if (chrome.runtime.lastError) {
        showSaveMessage('密钥保存失败：' + chrome.runtime.lastError.message, 'error');
        return;
      }
      chrome.storage.sync.remove(API_KEY_NAMES);

      if (googleApiKey && (!baiduAppId || !baiduKey)) {
        showSaveMessage('已保存 Google API Key；百度 App ID 或 Key 未完整填写。', 'warning');
      } else if (!googleApiKey && baiduAppId && baiduKey) {
        showSaveMessage('已保存百度翻译；Google API Key 未填写。', 'warning');
      } else if (googleApiKey && baiduAppId && baiduKey) {
        showSaveMessage('密钥已保存，可以开始翻译短语和句子。', 'success');
      } else if (googleApiKey || (baiduAppId && baiduKey)) {
        showSaveMessage('密钥已保存。', 'success');
      } else {
        showSaveMessage('请至少填写 Google API Key，或百度的 App ID 与 Key。', 'error');
      }
    }
  );
});

function setSecretMasked(input, masked) {
  if (masked) {
    input.classList.add('input--masked');
  } else {
    input.classList.remove('input--masked');
  }
}

Promise.all([
  new Promise(function (resolve) {
    chrome.storage.local.get(API_KEY_NAMES, resolve);
  }),
  new Promise(function (resolve) {
    chrome.storage.sync.get(API_KEY_NAMES, resolve);
  }),
  TranslationApiKeys.load()
]).then(function ([localKeys, legacySyncedKeys, embeddedKeys]) {
  const storedKeys = TranslationApiKeys.resolve(localKeys, legacySyncedKeys);
  const keys = TranslationApiKeys.resolve(storedKeys, embeddedKeys);

  ['googleApiKey', 'baiduAppId', 'baiduKey'].forEach(function (id) {
    const input = document.getElementById(id);
    input.value = keys[id];
    setSecretMasked(input, true);
  });
});

document.getElementById('enableSwitch').addEventListener('change', function () {
  this.parentElement.classList.add('user-interacted');

  chrome.storage.sync.set({ isEnabled: this.checked }, function () {
    sendToActiveTab({
      action: 'toggleTranslation',
      isEnabled: document.getElementById('enableSwitch').checked
    });
  });
});

chrome.storage.sync.get(['isEnabled'], function (data) {
  const enableSwitch = document.getElementById('enableSwitch');
  enableSwitch.checked = data.isEnabled !== undefined ? data.isEnabled : true;
});

document.getElementById('directTranslateSwitch').addEventListener('change', function () {
  this.parentElement.classList.add('user-interacted');

  chrome.storage.sync.set({ directTranslate: this.checked }, function () {
    sendToActiveTab({
      action: 'toggleDirectTranslate',
      directTranslate: document.getElementById('directTranslateSwitch').checked
    });
  });
});

chrome.storage.sync.get(['directTranslate'], function (data) {
  document.getElementById('directTranslateSwitch').checked = data.directTranslate || false;
});

document.querySelectorAll('.toggle-visibility').forEach(function (button) {
  button.addEventListener('click', function () {
    const targetId = this.getAttribute('data-target');
    const input = document.getElementById(targetId);
    const currentlyMasked = input.classList.contains('input--masked');

    if (currentlyMasked) {
      setSecretMasked(input, false);
      this.innerHTML = ICON_EYE_OFF;
      this.classList.add('is-visible');
      this.setAttribute('aria-pressed', 'true');
    } else {
      setSecretMasked(input, true);
      this.innerHTML = ICON_EYE;
      this.classList.remove('is-visible');
      this.setAttribute('aria-pressed', 'false');
    }
  });
});
