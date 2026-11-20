function sendToActiveTab(message) {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (!tabs[0]?.id) return;
    chrome.tabs.sendMessage(tabs[0].id, message, function () {
      void chrome.runtime.lastError;
    });
  });
}

async function refreshApiStatus() {
  const status = document.getElementById('apiStatus');
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getApiStatus' });
    if (!Array.isArray(response?.issues)) throw new Error('Status unavailable');
    status.textContent = response.issues.join('\n');
    status.hidden = response.issues.length === 0;
  } catch {
    status.textContent = '暂时无法读取翻译服务状态，请重新加载扩展后重试。';
    status.hidden = false;
  }
}

document.getElementById('enableSwitch').addEventListener('change', function () {
  this.parentElement.classList.add('user-interacted');
  chrome.storage.sync.set({ isEnabled: this.checked }, function () {
    sendToActiveTab({
      action: 'toggleTranslation',
      isEnabled: document.getElementById('enableSwitch').checked
    });
  });
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

chrome.storage.sync.get(['isEnabled', 'directTranslate'], function (data) {
  document.getElementById('enableSwitch').checked = data.isEnabled !== false;
  document.getElementById('directTranslateSwitch').checked = data.directTranslate || false;
});

chrome.storage.onChanged.addListener(function (changes) {
  if (['googleApiIssue', 'baiduApiIssue', 'googleApiKey', 'baiduAppId', 'baiduKey']
    .some(name => Object.hasOwn(changes, name))) {
    refreshApiStatus();
  }
});

refreshApiStatus();
