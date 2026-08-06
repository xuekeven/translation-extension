(function (global) {
  const EMPTY_KEYS = Object.freeze({
    googleApiKey: '',
    baiduAppId: '',
    baiduKey: ''
  });

  let cachedKeysPromise;

  function readConst(source, name) {
    const pattern = new RegExp('(?:\\/\\/\\s*)?const\\s+' + name + '\\s*=\\s*([\'\"])([^\'\"]+)\\1', 'i');
    const match = source.match(pattern);
    return match ? match[2].trim() : '';
  }

  function readProperty(source, name) {
    const pattern = new RegExp(name + '\\s*:\\s*([\'\"])([^\'\"]+)\\1', 'i');
    const match = source.match(pattern);
    return match ? match[2].trim() : '';
  }

  function readSection(source, name) {
    const pattern = new RegExp(
      '(?:^|\\n)\\s*\\/\\/\\s*' + name + '\\s+key\\s*;?\\s*([\\s\\S]*?)(?=\\n\\s*\\/\\/\\s*(?:google|baidu)\\s+key\\s*;?|$)',
      'i'
    );
    const match = source.match(pattern);
    return match ? match[1] : '';
  }

  function parse(source) {
    const googleSection = readSection(source, 'google');
    const baiduSection = readSection(source, 'baidu');

    return {
      googleApiKey: readProperty(source, 'googleApiKey') || readConst(source, 'googleApiKey') || readConst(googleSection, 'key'),
      baiduAppId: readProperty(source, 'baiduAppId') || readConst(source, 'baiduAppId') || readConst(baiduSection, 'appid'),
      baiduKey: readProperty(source, 'baiduKey') || readConst(source, 'baiduKey') || readConst(baiduSection, 'key')
    };
  }

  function load() {
    if (!cachedKeysPromise) {
      if (global.TRANSLATION_API_KEYS) {
        cachedKeysPromise = Promise.resolve(resolve(null, global.TRANSLATION_API_KEYS));
        return cachedKeysPromise;
      }

      cachedKeysPromise = fetch(chrome.runtime.getURL('key.js'), { cache: 'no-store' })
        .then(function (response) {
          if (!response.ok) {
            throw new Error('HTTP ' + response.status);
          }
          return response.text();
        })
        .then(parse)
        .catch(function (error) {
          console.warn('无法读取本地 key.js，将使用插件设置中的密钥。', error);
          return EMPTY_KEYS;
        });
    }

    return cachedKeysPromise;
  }

  function resolve(storedKeys, embeddedKeys) {
    const stored = storedKeys || EMPTY_KEYS;
    const embedded = embeddedKeys || EMPTY_KEYS;

    return {
      googleApiKey: String(stored.googleApiKey || embedded.googleApiKey || '').trim(),
      baiduAppId: String(stored.baiduAppId || embedded.baiduAppId || '').trim(),
      baiduKey: String(stored.baiduKey || embedded.baiduKey || '').trim()
    };
  }

  global.TranslationApiKeys = Object.freeze({ load, parse, resolve });
})(globalThis);
