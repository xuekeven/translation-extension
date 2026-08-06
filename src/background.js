try {
  importScripts('../key.js');
} catch (error) {
  console.warn('无法直接加载本地 key.js，将尝试按文本读取。', error);
}
importScripts('api-keys.js');

const API_KEY_NAMES = ['googleApiKey', 'baiduAppId', 'baiduKey'];
const MAX_TRANSLATION_LENGTH = 5000;
const FETCH_TIMEOUT_MS = 12000;
const CACHE_TEMPLATE_VERSION = 4;
const MAX_CACHED_WORDS = 40;
const MAX_CACHED_AUDIO_BYTES = 64 * 1024;
const MAX_AUDIO_RESPONSE_BYTES = 2 * 1024 * 1024;

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function decodeHtmlEntities(value) {
  const namedEntities = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    quot: '"'
  };

  return String(value == null ? '' : value).replace(
    /&(#(?:x[0-9a-f]+|\d+)|amp|apos|gt|lt|quot);/gi,
    function (entity, name) {
      if (name[0] !== '#') return namedEntities[name.toLowerCase()] || entity;
      const isHex = name[1].toLowerCase() === 'x';
      const codePoint = Number.parseInt(name.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return entity;
      return String.fromCodePoint(codePoint);
    }
  );
}

function safeExternalText(value) {
  return escapeHtml(decodeHtmlEntities(value));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(function () {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function sendTabMessage(tabId, message) {
  return new Promise(function (resolve) {
    chrome.tabs.sendMessage(tabId, message, function () {
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

async function getConfiguredApiKeys() {
  const [localKeys, legacySyncedKeys, embeddedKeys] = await Promise.all([
    new Promise(function (resolve) {
      chrome.storage.local.get(API_KEY_NAMES, resolve);
    }),
    new Promise(function (resolve) {
      chrome.storage.sync.get(API_KEY_NAMES, resolve);
    }),
    TranslationApiKeys.load()
  ]);
  const storedKeys = TranslationApiKeys.resolve(localKeys, legacySyncedKeys);
  return TranslationApiKeys.resolve(storedKeys, embeddedKeys);
}

function trimWordCache(cache) {
  const words = Object.keys(cache);
  if (words.length <= MAX_CACHED_WORDS) return;
  words
    .sort(function (left, right) {
      return (cache[left]?.timestamp || 0) - (cache[right]?.timestamp || 0);
    })
    .slice(0, words.length - MAX_CACHED_WORDS)
    .forEach(function (word) {
      delete cache[word];
    });
}

function byteArrayToBase64(audioData) {
  let binary = '';
  const chunkSize = 8192;
  for (let offset = 0; offset < audioData.length; offset += chunkSize) {
    binary += String.fromCharCode(...audioData.slice(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToByteArray(value) {
  const binary = atob(value);
  return Array.from(binary, function (character) {
    return character.charCodeAt(0);
  });
}

var MD5 = function (string) {
  
  function RotateLeft(lValue, iShiftBits) {
      return (lValue<<iShiftBits) | (lValue>>>(32-iShiftBits));
  }

  function AddUnsigned(lX,lY) {
      var lX4,lY4,lX8,lY8,lResult;
      lX8 = (lX & 0x80000000);
      lY8 = (lY & 0x80000000);
      lX4 = (lX & 0x40000000);
      lY4 = (lY & 0x40000000);
      lResult = (lX & 0x3FFFFFFF)+(lY & 0x3FFFFFFF);
      if (lX4 & lY4) {
          return (lResult ^ 0x80000000 ^ lX8 ^ lY8);
      }
      if (lX4 | lY4) {
          if (lResult & 0x40000000) {
              return (lResult ^ 0xC0000000 ^ lX8 ^ lY8);
          } else {
              return (lResult ^ 0x40000000 ^ lX8 ^ lY8);
          }
      } else {
          return (lResult ^ lX8 ^ lY8);
      }
  }

  function F(x,y,z) { return (x & y) | ((~x) & z); }
  function G(x,y,z) { return (x & z) | (y & (~z)); }
  function H(x,y,z) { return (x ^ y ^ z); }
  function I(x,y,z) { return (y ^ (x | (~z))); }

  function FF(a,b,c,d,x,s,ac) {
      a = AddUnsigned(a, AddUnsigned(AddUnsigned(F(b, c, d), x), ac));
      return AddUnsigned(RotateLeft(a, s), b);
  };

  function GG(a,b,c,d,x,s,ac) {
      a = AddUnsigned(a, AddUnsigned(AddUnsigned(G(b, c, d), x), ac));
      return AddUnsigned(RotateLeft(a, s), b);
  };

  function HH(a,b,c,d,x,s,ac) {
      a = AddUnsigned(a, AddUnsigned(AddUnsigned(H(b, c, d), x), ac));
      return AddUnsigned(RotateLeft(a, s), b);
  };

  function II(a,b,c,d,x,s,ac) {
      a = AddUnsigned(a, AddUnsigned(AddUnsigned(I(b, c, d), x), ac));
      return AddUnsigned(RotateLeft(a, s), b);
  };

  function ConvertToWordArray(string) {
      var lWordCount;
      var lMessageLength = string.length;
      var lNumberOfWords_temp1=lMessageLength + 8;
      var lNumberOfWords_temp2=(lNumberOfWords_temp1-(lNumberOfWords_temp1 % 64))/64;
      var lNumberOfWords = (lNumberOfWords_temp2+1)*16;
      var lWordArray=Array(lNumberOfWords-1);
      var lBytePosition = 0;
      var lByteCount = 0;
      while ( lByteCount < lMessageLength ) {
          lWordCount = (lByteCount-(lByteCount % 4))/4;
          lBytePosition = (lByteCount % 4)*8;
          lWordArray[lWordCount] = (lWordArray[lWordCount] | (string.charCodeAt(lByteCount)<<lBytePosition));
          lByteCount++;
      }
      lWordCount = (lByteCount-(lByteCount % 4))/4;
      lBytePosition = (lByteCount % 4)*8;
      lWordArray[lWordCount] = lWordArray[lWordCount] | (0x80<<lBytePosition);
      lWordArray[lNumberOfWords-2] = lMessageLength<<3;
      lWordArray[lNumberOfWords-1] = lMessageLength>>>29;
      return lWordArray;
  };

  function WordToHex(lValue) {
      var WordToHexValue="",WordToHexValue_temp="",lByte,lCount;
      for (lCount = 0;lCount<=3;lCount++) {
          lByte = (lValue>>>(lCount*8)) & 255;
          WordToHexValue_temp = "0" + lByte.toString(16);
          WordToHexValue = WordToHexValue + WordToHexValue_temp.substr(WordToHexValue_temp.length-2,2);
      }
      return WordToHexValue;
  };

  function Utf8Encode(string) {
      string = string.replace(/\r\n/g,"\n");
      var utftext = "";

      for (var n = 0; n < string.length; n++) {

          var c = string.charCodeAt(n);

          if (c < 128) {
              utftext += String.fromCharCode(c);
          }
          else if((c > 127) && (c < 2048)) {
              utftext += String.fromCharCode((c >> 6) | 192);
              utftext += String.fromCharCode((c & 63) | 128);
          }
          else {
              utftext += String.fromCharCode((c >> 12) | 224);
              utftext += String.fromCharCode(((c >> 6) & 63) | 128);
              utftext += String.fromCharCode((c & 63) | 128);
          }

      }

      return utftext;
  };

  var x=Array();
  var k,AA,BB,CC,DD,a,b,c,d;
  var S11=7, S12=12, S13=17, S14=22;
  var S21=5, S22=9 , S23=14, S24=20;
  var S31=4, S32=11, S33=16, S34=23;
  var S41=6, S42=10, S43=15, S44=21;

  string = Utf8Encode(string);

  x = ConvertToWordArray(string);

  a = 0x67452301; b = 0xEFCDAB89; c = 0x98BADCFE; d = 0x10325476;

  for (k=0;k<x.length;k+=16) {
      AA=a; BB=b; CC=c; DD=d;
      a=FF(a,b,c,d,x[k+0], S11,0xD76AA478);
      d=FF(d,a,b,c,x[k+1], S12,0xE8C7B756);
      c=FF(c,d,a,b,x[k+2], S13,0x242070DB);
      b=FF(b,c,d,a,x[k+3], S14,0xC1BDCEEE);
      a=FF(a,b,c,d,x[k+4], S11,0xF57C0FAF);
      d=FF(d,a,b,c,x[k+5], S12,0x4787C62A);
      c=FF(c,d,a,b,x[k+6], S13,0xA8304613);
      b=FF(b,c,d,a,x[k+7], S14,0xFD469501);
      a=FF(a,b,c,d,x[k+8], S11,0x698098D8);
      d=FF(d,a,b,c,x[k+9], S12,0x8B44F7AF);
      c=FF(c,d,a,b,x[k+10],S13,0xFFFF5BB1);
      b=FF(b,c,d,a,x[k+11],S14,0x895CD7BE);
      a=FF(a,b,c,d,x[k+12],S11,0x6B901122);
      d=FF(d,a,b,c,x[k+13],S12,0xFD987193);
      c=FF(c,d,a,b,x[k+14],S13,0xA679438E);
      b=FF(b,c,d,a,x[k+15],S14,0x49B40821);
      a=GG(a,b,c,d,x[k+1], S21,0xF61E2562);
      d=GG(d,a,b,c,x[k+6], S22,0xC040B340);
      c=GG(c,d,a,b,x[k+11],S23,0x265E5A51);
      b=GG(b,c,d,a,x[k+0], S24,0xE9B6C7AA);
      a=GG(a,b,c,d,x[k+5], S21,0xD62F105D);
      d=GG(d,a,b,c,x[k+10],S22,0x2441453);
      c=GG(c,d,a,b,x[k+15],S23,0xD8A1E681);
      b=GG(b,c,d,a,x[k+4], S24,0xE7D3FBC8);
      a=GG(a,b,c,d,x[k+9], S21,0x21E1CDE6);
      d=GG(d,a,b,c,x[k+14],S22,0xC33707D6);
      c=GG(c,d,a,b,x[k+3], S23,0xF4D50D87);
      b=GG(b,c,d,a,x[k+8], S24,0x455A14ED);
      a=GG(a,b,c,d,x[k+13],S21,0xA9E3E905);
      d=GG(d,a,b,c,x[k+2], S22,0xFCEFA3F8);
      c=GG(c,d,a,b,x[k+7], S23,0x676F02D9);
      b=GG(b,c,d,a,x[k+12],S24,0x8D2A4C8A);
      a=HH(a,b,c,d,x[k+5], S31,0xFFFA3942);
      d=HH(d,a,b,c,x[k+8], S32,0x8771F681);
      c=HH(c,d,a,b,x[k+11],S33,0x6D9D6122);
      b=HH(b,c,d,a,x[k+14],S34,0xFDE5380C);
      a=HH(a,b,c,d,x[k+1], S31,0xA4BEEA44);
      d=HH(d,a,b,c,x[k+4], S32,0x4BDECFA9);
      c=HH(c,d,a,b,x[k+7], S33,0xF6BB4B60);
      b=HH(b,c,d,a,x[k+10],S34,0xBEBFBC70);
      a=HH(a,b,c,d,x[k+13],S31,0x289B7EC6);
      d=HH(d,a,b,c,x[k+0], S32,0xEAA127FA);
      c=HH(c,d,a,b,x[k+3], S33,0xD4EF3085);
      b=HH(b,c,d,a,x[k+6], S34,0x4881D05);
      a=HH(a,b,c,d,x[k+9], S31,0xD9D4D039);
      d=HH(d,a,b,c,x[k+12],S32,0xE6DB99E5);
      c=HH(c,d,a,b,x[k+15],S33,0x1FA27CF8);
      b=HH(b,c,d,a,x[k+2], S34,0xC4AC5665);
      a=II(a,b,c,d,x[k+0], S41,0xF4292244);
      d=II(d,a,b,c,x[k+7], S42,0x432AFF97);
      c=II(c,d,a,b,x[k+14],S43,0xAB9423A7);
      b=II(b,c,d,a,x[k+5], S44,0xFC93A039);
      a=II(a,b,c,d,x[k+12],S41,0x655B59C3);
      d=II(d,a,b,c,x[k+3], S42,0x8F0CCC92);
      c=II(c,d,a,b,x[k+10],S43,0xFFEFF47D);
      b=II(b,c,d,a,x[k+1], S44,0x85845DD1);
      a=II(a,b,c,d,x[k+8], S41,0x6FA87E4F);
      d=II(d,a,b,c,x[k+15],S42,0xFE2CE6E0);
      c=II(c,d,a,b,x[k+6], S43,0xA3014314);
      b=II(b,c,d,a,x[k+13],S44,0x4E0811A1);
      a=II(a,b,c,d,x[k+4], S41,0xF7537E82);
      d=II(d,a,b,c,x[k+11],S42,0xBD3AF235);
      c=II(c,d,a,b,x[k+2], S43,0x2AD7D2BB);
      b=II(b,c,d,a,x[k+9], S44,0xEB86D391);
      a=AddUnsigned(a,AA);
      b=AddUnsigned(b,BB);
      c=AddUnsigned(c,CC);
      d=AddUnsigned(d,DD);
  }

  var temp = WordToHex(a)+WordToHex(b)+WordToHex(c)+WordToHex(d);

  return temp.toLowerCase();
}


chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "translate") {
    const tabId = sender.tab?.id;
    const text = typeof request.text === 'string' ? request.text.trim() : '';
    const requestId = Number.isSafeInteger(request.requestId) ? request.requestId : 0;
    if (!tabId || !requestId || !text || text.length > MAX_TRANSLATION_LENGTH) {
      sendResponse({ ok: false });
      return false;
    }

    const task = isEnglishWord(text)
      ? fetchWordDefinition(text, tabId, requestId)
      : translateText(text, tabId, requestId);
    task.then(function () {
      sendResponse({ ok: true });
    }).catch(function (error) {
      console.error('Unhandled translation error:', error);
      sendResponse({ ok: false });
    });
    return true;
  } else if (request.action === "playAudio") {
    const tabId = sender.tab?.id;
    const word = typeof request.word === 'string' ? request.word.trim() : '';
    const type = String(request.type);
    if (!tabId || !isEnglishWord(word) || !['1', '2'].includes(type)) {
      sendResponse({ ok: false });
      return false;
    }

    playAudioInBackground(word, type, tabId).then(function () {
      sendResponse({ ok: true });
    }).catch(function (error) {
      console.error('Unhandled audio error:', error);
      sendResponse({ ok: false });
    });
    return true;
  }
  return false;
});

function isEnglishWord(text) {
  return /^[a-zA-Z]+$/.test(text);
}

function stripYoudaoSpam(str) {
  if (str == null) return '';
  const text = String(str).trim();
  if (!text) return '';
  if (/we\s+are\s+pirates|stolen\s+from\s+youdao|these\s+data\s+are\s+stolen/i.test(text)) {
    return '';
  }
  return safeExternalText(text);
}

function getTrLine(tr) {
  const segs = tr?.tr?.[0]?.l?.i;
  if (!Array.isArray(segs) || segs.length === 0) return '';
  return segs.map(seg => {
    if (typeof seg === 'string') return stripYoudaoSpam(seg);
    return stripYoudaoSpam(seg?.i || '');
  }).filter(Boolean).join(' ');
}

function getTrLines(tr) {
  const entries = Array.isArray(tr?.tr) ? tr.tr : [];
  const lines = entries.map(item => {
    const segs = item?.l?.i;
    if (!Array.isArray(segs) || segs.length === 0) return '';
    return segs.map(seg => {
      if (typeof seg === 'string') return stripYoudaoSpam(seg);
      return stripYoudaoSpam(seg?.i || '');
    }).filter(Boolean).join(' ');
  }).filter(Boolean);
  if (lines.length > 0) return lines;
  const fallback = getTrLine(tr);
  return fallback ? [fallback] : [];
}

// 添加缓存相关函数
async function getCachedWord(word) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['wordCache'], function(result) {
      const cache = result.wordCache || {};
      const cachedItem = cache[word];
      
      if (cachedItem) {
        // 检查缓存是否过期（例如24小时）
        const isExpired = Date.now() - cachedItem.timestamp > 24 * 60 * 60 * 1000;
        const isOldTemplate = (cachedItem.templateVersion || 0) < CACHE_TEMPLATE_VERSION;
        if (isExpired) {
          delete cache[word];
          chrome.storage.local.set({ wordCache: cache });
          resolve(null);
        } else if (isOldTemplate) {
          // 新版 UI 上不复用旧模板缓存，避免白字/旧结构导致显示异常
          delete cache[word];
          chrome.storage.local.set({ wordCache: cache });
          resolve(null);
        } else {
          resolve(cachedItem);
        }
      } else {
        resolve(null);
      }
    });
  });
}

async function cacheWord(word, data) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['wordCache'], function(result) {
      const cache = result.wordCache || {};
      // 添加时间戳，用于后续可能的缓存过期处理
      cache[word] = {
        data: {
          definition: data,
          audio: {}
        },
        templateVersion: CACHE_TEMPLATE_VERSION,
        timestamp: Date.now()
      };
      trimWordCache(cache);
      chrome.storage.local.set({ wordCache: cache }, function () {
        if (chrome.runtime.lastError) {
          console.warn('保存单词缓存失败：', chrome.runtime.lastError.message);
        }
        resolve();
      });
    });
  });
}

// 获取用户的音标显示偏好
async function getPhoneticPreference() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['phoneticPreference'], function(result) {
      // 默认使用美音
      resolve(result.phoneticPreference === 'uk' ? 'uk' : 'us');
    });
  });
}

async function fetchWordDefinition(word, tabId, requestId) {
  try {
    // 先检查缓存
    const cachedResult = await getCachedWord(word);
    if (cachedResult && cachedResult.data && cachedResult.data.definition) {
      console.log('Using cached result for:', word);
      await sendTabMessage(tabId, {
        action: "updateTranslation", 
        translation: cachedResult.data.definition, 
        complete: true,
        word: word,
        requestId: requestId
      });
      return;
    }

    const url = `https://dict.youdao.com/jsonapi_s?doctype=json&q=${encodeURIComponent(word)}`;
    const response = await fetchWithTimeout(url, {
      headers: {
        'Accept': 'application/json'
      }
    });
    if (!response.ok) {
      throw new Error(`Youdao HTTP ${response.status}`);
    }
    const data = await response.json();
    
    // 获取用户偏好的音标显示方式
    const phoneticPreference = await getPhoneticPreference();
    
    // 生成翻译结果 HTML（对齐 target-word 风格）
    let result = `
      <section class="word-hero">
        <div class="word-hero__top">
          <h1 class="word-hero__title">${word}</h1>
        </div>
        <div class="word-hero__meta">
    `;

    if (data.ec?.word?.[0]) {
      const wordInfo = data.ec.word[0];

      const flagSwitcher = `
        <button type="button" class="flagSwitcher word-flag" data-current="${phoneticPreference}">${phoneticPreference === 'uk' ? '🇬🇧' : '🇺🇸'}</button>
      `;
      const ukButton = `
        <button type="button" class="playButton phoneticButton ${phoneticPreference === 'us' ? 'is-hidden' : ''}" data-word="${word}" data-type="1" data-phonetic="uk">/${safeExternalText(wordInfo.ukphone || 'n/a')}/</button>
      `;

      const usButton = `
        <button type="button" class="playButton phoneticButton ${phoneticPreference === 'uk' ? 'is-hidden' : ''}" data-word="${word}" data-type="2" data-phonetic="us">/${safeExternalText(wordInfo.usphone || 'n/a')}/</button>
      `;

      result += flagSwitcher + ukButton + usButton;
    }

    result += `
          <button type="button" class="moreButton" data-word="${word}">查看更多</button>
        </div>
      </section>
      <section class="word-sections">
    `;

    if (data.ec?.word?.[0]?.trs?.length > 0) {
      const trs = data.ec.word[0].trs.flatMap((tr) => {
        return getTrLines(tr).map(line => {
          const match = line.match(/^([a-z]{1,12}[.．])\s*(.*)$/i);
          if (match && match[2]) {
            return `
              <div class="word-line">
                <span class="word-pos">${match[1]}</span>
                <span class="word-def">${match[2]}</span>
              </div>
            `;
          }
          return `<div class="word-line"><span class="word-def">${line}</span></div>`;
        });
      }).filter(Boolean);
      if (trs.length > 0) {
        result += `
          <div class="word-card">
            <div class="word-card__title">释义</div>
            ${trs.join('')}
          </div>
        `;
      }
    }

    if (data.ec?.word?.[0]?.wfs?.length > 0) {
      const wfs = data.ec.word[0].wfs.map(wf => {
        const name = stripYoudaoSpam(wf?.wf?.name || '');
        const value = stripYoudaoSpam(wf?.wf?.value || '');
        if (!name && !value) return '';
        return `
          <div class="word-line">
            <span class="word-pos">${name}</span>
            <span class="word-def">${value}</span>
          </div>
        `;
      }).filter(Boolean);
      if (wfs.length > 0) {
        result += `
          <div class="word-card">
            <div class="word-card__title">词形变化</div>
            ${wfs.join('')}
          </div>
        `;
      }
    }

    if (data.rel_word?.rels && Array.isArray(data.rel_word.rels) && data.rel_word.rels.length > 0) {
      const relLines = data.rel_word.rels.flatMap(rel => {
        const pos = stripYoudaoSpam(rel?.rel?.pos || '');
        const words = Array.isArray(rel?.rel?.words) ? rel.rel.words : [];
        return words.map(w => {
          const wword = stripYoudaoSpam(w?.word || '');
          const tran = stripYoudaoSpam(w?.tran || '');
          if (!wword && !tran) return '';
          return `
            <div class="word-line">
              ${pos ? `<span class="word-pos">${pos}</span>` : ''}
              <span class="word-def">${wword}${tran ? ` ${tran}` : ''}</span>
            </div>
          `;
        });
      }).filter(Boolean);
      if (relLines.length > 0) {
        result += `
          <div class="word-card">
            <div class="word-card__title">同根词</div>
            ${relLines.join('')}
          </div>
        `;
      }
    }

    if (data.syno?.synos && Array.isArray(data.syno.synos) && data.syno.synos.length > 0) {
      const synoLines = data.syno.synos.map(syno => {
        const pos = stripYoudaoSpam(syno?.syno?.pos || '');
        const words = (syno?.syno?.ws || []).map(w => stripYoudaoSpam(w?.w || '')).filter(Boolean);
        const tran = stripYoudaoSpam(syno?.syno?.tran || '');
        if (!words.length && !tran) return '';
        return `
          <div class="word-line">
            ${pos ? `<span class="word-pos">${pos}</span>` : ''}
            <span class="word-def">${words.join('，')}${tran ? `；${tran}` : ''}</span>
          </div>
        `;
      }).filter(Boolean);
      if (synoLines.length > 0) {
        result += `
          <div class="word-card">
            <div class="word-card__title">同义词</div>
            ${synoLines.join('')}
          </div>
        `;
      }
    }

    if (data.blng_sents_part?.['sentence-pair']?.length > 0) {
      const examples = data.blng_sents_part['sentence-pair'].map(pair => {
        const en = stripYoudaoSpam(pair.sentence);
        const cn = stripYoudaoSpam(pair['sentence-translation']);
        if (!en && !cn) return '';
        return `
          <div class="word-line">
            <div class="word-example-en">${en}</div>
            <div class="word-example-cn">${cn}</div>
          </div>
        `;
      }).filter(Boolean);
      if (examples.length > 0) {
        result += `
          <div class="word-card">
            <div class="word-card__title">例句</div>
            ${examples.join('')}
          </div>
        `;
      }
    }

    if (data.phrs?.phrs?.length > 0) {
      const phrases = data.phrs.phrs.map(phr => {
        const hw = stripYoudaoSpam(phr?.phr?.headword?.l?.i || '');
        const tr = stripYoudaoSpam(phr?.phr?.trs?.[0]?.tr?.l?.i || '');
        if (!hw && !tr) return '';
        return `
          <span class="phrase-chip">
            ${hw ? `<span class="phrase-chip__hw">${hw}</span>` : ''}
            ${tr ? `<span class="phrase-chip__tr">${tr}</span>` : ''}
          </span>
        `;
      }).filter(Boolean);
      if (phrases.length > 0) {
        result += `
          <div class="word-card">
            <div class="word-card__title">常见搭配</div>
            <div class="phrase-chip-wrap">${phrases.join('')}</div>
          </div>
        `;
      }
    }

    result += `
      </section>
    `;

    // 缓存结
    await cacheWord(word, result);

    await sendTabMessage(tabId, {
      action: "updateTranslation", 
      translation: result, 
      complete: true,
      word: word,
      requestId: requestId
    });
  } catch (error) {
    console.error('API error:', error);
    // 如果获取单词定义失败，则使用百度和Google翻译单词
    const extra = '<p class="sentence-note">有道词典解析失败，以下展示百度与 Google 翻译结果。</p>';
    await translateText(word, tabId, requestId, extra);
  }
}

function getEngineDisplayResult(result, engineName) {
  if (result.status === 'fulfilled') {
    return safeExternalText(result.value);
  }
  console.error(`${engineName} translation failed:`, result.reason);
  return `${engineName} 翻译失败，请检查密钥、额度或网络后重试。`;
}

async function translateText(text, tabId, requestId, extra = '') {
  try {
    const { googleApiKey, baiduAppId, baiduKey } = await getConfiguredApiKeys();
    const safeText = escapeHtml(text);

    // 首先发送一个初始的翻译结果框架
    await sendTabMessage(tabId, {
      action: "updateTranslation",
      translation: `
        <div class="sentence-layout sentence-layout--results-only">
          ${extra}
          <div class="sentence-card">
            <div class="sentence-content">${safeText}</div>
          </div>
          <div class="sentence-platform-block">
            <div class="sentence-result"><span class="engine-badge engine-badge--baidu">B</span><span class="engine-name">Baidu Fanyi</span></div>
            <div class="sentence-content sentence-content--pending">正在翻译...</div>
          </div>
          <div class="sentence-platform-block">
            <div class="sentence-result"><span class="engine-badge engine-badge--google">G</span><span class="engine-name">Google Translate</span></div>
            <div class="sentence-content sentence-content--pending">正在翻译...</div>
          </div>
        </div>
      `,
      complete: false,
      requestId: requestId
    });

    const baiduTask = baiduAppId && baiduKey
      ? translateWithBaidu(text, baiduAppId, baiduKey)
      : Promise.resolve('未设置百度翻译 App ID / Key，请在插件设置中填写。');
    const googleTask = googleApiKey
      ? translateWithGoogle(text, googleApiKey)
      : Promise.resolve('未设置 Google API Key，请在插件设置中填写。');
    const [baiduSettled, googleSettled] = await Promise.allSettled([baiduTask, googleTask]);
    const baiduResult = getEngineDisplayResult(baiduSettled, '百度');
    const googleResult = getEngineDisplayResult(googleSettled, 'Google');

    // 更新翻译结果
    await sendTabMessage(tabId, {
      action: "updateTranslation",
      translation: `
        <div class="sentence-layout sentence-layout--results-only">
          ${extra}
          <div class="sentence-card">
            <div class="sentence-content">${safeText}</div>
          </div>
          <div class="sentence-platform-block">
            <div class="sentence-result"><span class="engine-badge engine-badge--baidu">B</span><span class="engine-name">Baidu Fanyi</span></div>
            <div class="sentence-content">${baiduResult}</div>
          </div>
          <div class="sentence-platform-block">
            <div class="sentence-result"><span class="engine-badge engine-badge--google">G</span><span class="engine-name">Google Translate</span></div>
            <div class="sentence-content">${googleResult}</div>
          </div>
        </div>
      `,
      complete: true,
      requestId: requestId
    });

  } catch (error) {
    console.error('Translation error:', error);
    await sendTabMessage(tabId, {
      action: "updateTranslation",
      translation: `
        ${extra}
        <p class="sentence-note sentence-note--error">翻译失败，请重试。</p>
      `,
      complete: true,
      requestId: requestId
    });
  }
}

async function translateWithGoogle(text, apiKey) {
  const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;
  const data = {
    q: text,
    source: 'en',
    target: 'zh-CN',
    format: 'text'
  };

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data)
  });
  const json = await response.json().catch(function () {
    return null;
  });
  if (!response.ok) {
    throw new Error(`Google HTTP ${response.status}`);
  }
  if (json?.data?.translations?.length > 0) {
    return json.data.translations[0].translatedText;
  } else {
    throw new Error('Google translation failed');
  }
}

async function translateWithBaidu(text, appId, key) {
  const salt = new Date().getTime();
  const from = 'en';
  const to = 'zh';
  const str1 = appId + text + salt + key;
  const sign = MD5(str1).toString();

  const url = `https://api.fanyi.baidu.com/api/trans/vip/translate?q=${encodeURIComponent(text)}&from=${from}&to=${to}&appid=${appId}&salt=${salt}&sign=${sign}`;

  const response = await fetchWithTimeout(url);
  const json = await response.json().catch(function () {
    return null;
  });
  if (!response.ok) {
    throw new Error(`Baidu HTTP ${response.status}`);
  }
  if (json?.trans_result?.length > 0) {
    return json.trans_result[0].dst;
  } else {
    throw new Error('Baidu translation failed');
  }
}

// 修改音频播放函数
async function playAudioInBackground(word, type, tabId) {
  const audioType = type == '2' ? 'us' : 'uk';
  try {
    // 先检查缓存
    const cachedResult = await getCachedWord(word);
    if (cachedResult && cachedResult.data.audio && cachedResult.data.audio[audioType]) {
      const cachedAudio = cachedResult.data.audio[audioType];
      const audioData = typeof cachedAudio === 'string'
        ? base64ToByteArray(cachedAudio)
        : cachedAudio;
      await sendTabMessage(tabId, {
        action: "playAudioInContent",
        audioData: audioData
      });
      return;
    }

    // 如果没有缓存，请求音频数据
    const audioUrl = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=${type}`;
    const response = await fetchWithTimeout(audioUrl);
    if (!response.ok) {
      throw new Error(`Youdao audio HTTP ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_AUDIO_RESPONSE_BYTES) {
      throw new Error('Youdao audio response is too large');
    }
    const audioData = Array.from(new Uint8Array(arrayBuffer));

    // 播放音频
    await sendTabMessage(tabId, {
      action: "playAudioInContent",
      audioData: audioData
    });
    await cacheWordAudio(word, audioType, audioData);
  } catch (error) {
    console.error('Error fetching audio:', error);
  }
}

// 添加缓存音频的函数
async function cacheWordAudio(word, audioType, audioData) {
  if (!Array.isArray(audioData) || audioData.length === 0 || audioData.length > MAX_CACHED_AUDIO_BYTES) {
    return;
  }

  return new Promise((resolve) => {
    chrome.storage.local.get(['wordCache'], function(result) {
      const cache = result.wordCache || {};
      if (!cache[word]) {
        cache[word] = {
          data: { audio: {} },
          templateVersion: CACHE_TEMPLATE_VERSION,
          timestamp: Date.now()
        };
      } else if (!cache[word].data.audio) {
        cache[word].data.audio = {};
      }
      // 保存音频数据
      cache[word].data.audio[audioType] = byteArrayToBase64(audioData);
      // 更新时间戳
      cache[word].timestamp = Date.now();
      trimWordCache(cache);
      
      chrome.storage.local.set({ wordCache: cache }, function () {
        if (chrome.runtime.lastError) {
          console.warn('保存音频缓存失败：', chrome.runtime.lastError.message);
        }
        resolve();
      });
    });
  });
}
