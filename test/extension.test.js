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
