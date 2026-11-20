const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

function createBackgroundContext() {
  const context = {
    AbortController,
    atob,
    btoa,
    clearTimeout,
    console,
    fetch,
    importScripts() {},
    setTimeout,
    TranslationApiKeys: {
      load: async function () {
        return {};
      },
      resolve: function (stored, fallback) {
        return { ...(fallback || {}), ...(stored || {}) };
      }
    },
    chrome: {
      runtime: {
        lastError: null,
        onMessage: { addListener() {} }
      },
      storage: {
        local: { get() {}, set() {} },
        sync: { get() {} }
      },
      tabs: { sendMessage() {} }
    }
  };
  vm.createContext(context);
  vm.runInContext(readProjectFile('src/background.js'), context);
  return context;
}

test('manifest uses least-privilege HTTPS access', function () {
  const manifest = JSON.parse(readProjectFile('manifest.json'));
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.deepEqual(manifest.content_scripts[0].matches, ['http://*/*', 'https://*/*']);
  assert.ok(manifest.host_permissions.every(function (permission) {
    return permission.startsWith('https://');
  }));
});

test('API key parser supports the executable key.js shape', function () {
  delete globalThis.TranslationApiKeys;
  delete require.cache[require.resolve('../src/api-keys.js')];
  require('../src/api-keys.js');
  const keys = globalThis.TranslationApiKeys.parse(`
    globalThis.TRANSLATION_API_KEYS = {
      googleApiKey: 'google-test',
      baiduAppId: 'baidu-app-test',
      baiduKey: 'baidu-key-test'
    };
  `);
  assert.deepEqual(keys, {
    googleApiKey: 'google-test',
    baiduAppId: 'baidu-app-test',
    baiduKey: 'baidu-key-test'
  });
});

test('external text is decoded and escaped before HTML rendering', function () {
  const context = createBackgroundContext();
  const escaped = vm.runInContext("safeExternalText('&lt;img src=x onerror=alert(1)&gt;')", context);
  assert.equal(escaped, '&lt;img src=x onerror=alert(1)&gt;');
});

test('audio cache encoding is compact and reversible', function () {
  const context = createBackgroundContext();
  const roundTrip = vm.runInContext(`
    base64ToByteArray(byteArrayToBase64([0, 1, 2, 127, 255])).join(',')
  `, context);
  assert.equal(roundTrip, '0,1,2,127,255');
});

test('word cache trimming keeps the newest forty entries', function () {
  const context = createBackgroundContext();
  const remaining = vm.runInContext(`
    (() => {
      const cache = {};
      for (let index = 0; index < 45; index += 1) {
        cache['word' + index] = { timestamp: index };
      }
      trimWordCache(cache);
      return Object.keys(cache).join(',');
    })()
  `, context);
  assert.equal(remaining, Array.from({ length: 40 }, function (_, index) {
    return 'word' + (index + 5);
  }).join(','));
});

test('content script guards user events and stale responses', function () {
  const source = readProjectFile('src/content.js');
  assert.match(source, /if \(!e\.isTrusted\) return;/);
  assert.match(source, /if \(isExtensionInteraction\(e\)\) return;/);
  assert.match(source, /request\.requestId !== activeTranslationRequestId/);
  assert.match(source, /MAX_TRANSLATION_LENGTH = 5000/);
  assert.match(source, /ALLOWED_TRANSLATION_TAGS/);
});

test('content stylesheet is scoped to the extension root', function () {
  const source = readProjectFile('src/styles/content.css');
  assert.match(source, /@scope \(#__selection_translation_extension_root__\)/);
});

function createContentContext() {
  const listeners = [];
  const messageListeners = [];
  const requests = [];
  const elements = new Map();
  const root = {
    isConnected: true,
    querySelector: selector => elements.get(selector) || null,
    contains: target => target === root || Array.from(elements.values()).includes(target)
  };
  const selection = {
    toString: () => 'hello',
    getRangeAt: () => ({ getBoundingClientRect: () => ({ bottom: 100 }) })
  };
  const context = {
    console,
    document: {
      createElement: () => root,
      body: { appendChild() {} },
      addEventListener(type, handler, capture = false) {
        listeners.push({ type, handler, capture });
      }
    },
    window: { getSelection: () => selection },
    chrome: {
      runtime: {
        onMessage: { addListener: handler => messageListeners.push(handler) },
        sendMessage(request) {
          requests.push(request);
          return Promise.resolve({ ok: true });
        }
      },
      storage: { sync: { get() {} } }
    }
  };
  vm.createContext(context);
  vm.runInContext(readProjectFile('src/content.js'), context);
  context.createTranslatePopup = function () {
    const popup = {
      contains: target => target === popup,
      remove: () => elements.delete('.translate-popup')
    };
    elements.set('.translate-popup', popup);
    return popup;
  };
  context.updateTranslatePopup = function () {
    throw new Error('A dismissed request must not render a result');
  };
  return {
    context,
    elements,
    requests,
    dispatch(type, details = {}, captureOnly = false) {
      const event = { isTrusted: true, target: {}, stopPropagation() {}, ...details };
      listeners.filter(listener => listener.type === type && (!captureOnly || listener.capture))
        .forEach(listener => listener.handler(event));
    },
    deliver(request) {
      messageListeners.forEach(handler => handler(request, {}, () => {}));
    }
  };
}

test('outside pointerdown dismisses pending translations even when page stops bubbling', async function () {
  const page = createContentContext();
  let rejectRequest;
  page.context.chrome.runtime.sendMessage = request => {
    page.requests.push(request);
    return new Promise((resolve, reject) => { rejectRequest = reject; });
  };
  page.context.translateText('hello', 100, 100);
  const requestId = page.requests[0].requestId;
  page.dispatch('pointerdown', {}, true);
  assert.equal(page.elements.has('.translate-popup'), false);
  page.deliver({ action: 'updateTranslation', requestId, translation: 'late', complete: false });
  page.deliver({ action: 'updateTranslation', requestId, translation: 'late', complete: true });
  rejectRequest(new Error('Background disconnected'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.elements.has('.translate-popup'), false);
});

test('the click following direct selection does not dismiss the new popup', function () {
  const page = createContentContext();
  page.deliver({ action: 'toggleDirectTranslate', directTranslate: true });
  page.dispatch('pointerdown');
  page.dispatch('mouseup', { x: 100 });
  page.dispatch('click');
  assert.equal(page.requests.length, 1);
  assert.equal(page.elements.has('.translate-popup'), true);
});

test('popup interactions preserve it and Escape clears popup and dragging state', function () {
  const page = createContentContext();
  page.context.translateText('hello', 100, 100);
  const popup = page.elements.get('.translate-popup');
  page.dispatch('pointerdown', { target: popup });
  assert.equal(page.elements.get('.translate-popup'), popup);
  vm.runInContext('isDragging = true; dragTarget = {};', page.context);
  page.dispatch('keydown', { key: 'Escape' }, true);
  assert.equal(page.elements.has('.translate-popup'), false);
  assert.equal(vm.runInContext('isDragging', page.context), false);
  assert.equal(vm.runInContext('dragTarget', page.context), null);
});

test('API status reports missing configuration without returning credentials', async function () {
  const context = createBackgroundContext();
  context.getConfiguredApiKeys = async () => ({ googleApiKey: 'private-test-key' });
  context.chrome.storage.local.get = (names, callback) => callback({});
  const status = await context.getApiStatus();
  assert.equal(status.issues.length, 1);
  assert.match(status.issues[0], /百度.*配置不完整/);
  assert.ok(!JSON.stringify(status).includes('private-test-key'));
});

test('Google authentication errors appear in status and clear after a successful translation', async function () {
  const context = createBackgroundContext();
  const stored = {};
  context.chrome.storage.local.set = async values => Object.assign(stored, values);
  context.chrome.storage.local.get = (names, callback) => callback(stored);
  context.getConfiguredApiKeys = async () => ({ googleApiKey: 'secret', baiduAppId: 'app', baiduKey: 'secret' });
  context.fetch = async () => ({ ok: false, status: 403, json: async () => ({}) });
  await assert.rejects(context.translateWithGoogle('hello world', 'secret'), /Google HTTP 403/);
  assert.match((await context.getApiStatus()).issues[0], /Google.*权限异常/);
  context.fetch = async () => ({ ok: true, json: async () => ({ data: { translations: [{ translatedText: '你好' }] } }) });
  assert.equal(await context.translateWithGoogle('hello world', 'secret'), '你好');
  assert.equal((await context.getApiStatus()).issues.length, 0);
});

test('Baidu API errors are recorded even with an HTTP success response', async function () {
  const context = createBackgroundContext();
  const stored = {};
  context.chrome.storage.local.set = async values => Object.assign(stored, values);
  context.fetch = async () => ({ ok: true, json: async () => ({ error_code: '54001', error_msg: 'Invalid signature' }) });
  await assert.rejects(context.translateWithBaidu('hello world', 'app', 'secret'), /Baidu translation failed/);
  assert.match(stored.baiduApiIssue, /认证或权限异常/);
  context.fetch = async () => ({ ok: true, json: async () => ({ trans_result: [{ dst: '你好' }] }) });
  await context.translateWithBaidu('hello world', 'app', 'secret');
  assert.equal(stored.baiduApiIssue, '');
});

test('popup hides healthy API status and displays only issue messages', async function () {
  const elements = new Map(['enableSwitch', 'directTranslateSwitch', 'apiStatus'].map(id => [id, {
    addEventListener() {}, hidden: true, textContent: ''
  }]));
  const context = {
    document: { getElementById: id => elements.get(id) },
    chrome: {
      runtime: { sendMessage: async () => ({ issues: [] }) },
      storage: { sync: { get: (names, callback) => callback({}) }, onChanged: { addListener() {} } }
    }
  };
  vm.createContext(context);
  vm.runInContext(readProjectFile('src/popup/popup.js'), context);
  await context.refreshApiStatus();
  assert.equal(elements.get('apiStatus').hidden, true);
  context.chrome.runtime.sendMessage = async () => ({ issues: ['Google 翻译密钥异常'] });
  await context.refreshApiStatus();
  assert.equal(elements.get('apiStatus').hidden, false);
  assert.equal(elements.get('apiStatus').textContent, 'Google 翻译密钥异常');
  assert.doesNotMatch(readProjectFile('src/popup/popup.html'), /secret-input|saveButton|key\.js/);
});
