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


// 现有的 background.js 代码从这里开始
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "translate") {
    const text = request.text;
    if (isEnglishWord(text)) {
      fetchWordDefinition(text, sender.tab.id);
    } else {
      translateText(text, sender.tab.id);
    }
    return false;
  } else if (request.action === "playAudio") {
    // 直接在 background 中播放音频
    playAudioInBackground(request.word, request.type);
    return false;
  }
  return false;
});

function isEnglishWord(text) {
  return /^[a-zA-Z]+$/.test(text);
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
        if (isExpired) {
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
        timestamp: Date.now()
      };
      // 限制缓存大小，最多存储100个单词
      const words = Object.keys(cache);
      if (words.length > 100) {
        // 删除最早缓存的单词
        delete cache[words[0]];
      }
      chrome.storage.local.set({ wordCache: cache }, resolve);
    });
  });
}

// 获取用户的音标显示偏好
async function getPhoneticPreference() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['phoneticPreference'], function(result) {
      // 默认使用美音
      resolve(result.phoneticPreference || 'us');
    });
  });
}

async function fetchWordDefinition(word, tabId) {
  try {
    // 先检查缓存
    const cachedResult = await getCachedWord(word);
    if (cachedResult && cachedResult.data && cachedResult.data.definition) {
      console.log('Using cached result for:', word);
      chrome.tabs.sendMessage(tabId, {
        action: "updateTranslation", 
        translation: cachedResult.data.definition, 
        complete: true,
        word: word
      });
      return;
    }

    const url = `https://dict.youdao.com/jsonapi_s?doctype=json&q=${encodeURIComponent(word)}`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    const data = await response.json();
    
    // 获取用户偏好的音标显示方式
    const phoneticPreference = await getPhoneticPreference();
    
    // 生成翻译结果 HTML
    let result = `
      <div style="display: flex; align-items: center; margin-bottom: 5px;">
        <h2 style="font-size: 18px; color: white; margin: 0;">${word}</h2>
    `;
    
    // 添加音标按钮（如果有）
    if (data.ec?.word?.[0]) {
      const wordInfo = data.ec.word[0];

      const flagSwitcher = `
        <button class="flagSwitcher" data-current="${phoneticPreference}" style="
          background: none;
          border: none;
          color: white;
          padding: 2px 5px;
          text-align: center;
          display: inline-block;
          font-size: 12px;
          margin-left: 10px;
          cursor: pointer;
        ">${phoneticPreference === 'uk' ? '🇬🇧' : '🇺🇸'}</button>
      `;
      const ukButton = `
        <button class="playButton phoneticButton" data-word="${word}" data-type="1" data-phonetic="uk" style="
          ${phoneticPreference === 'us' ? 'display: none;' : ''}
        ">/${wordInfo.ukphone || 'n/a'}/</button>
      `;

      const usButton = `
        <button class="playButton phoneticButton" data-word="${word}" data-type="2" data-phonetic="us" style="
          ${phoneticPreference === 'uk' ? 'display: none;' : ''}
        ">/${wordInfo.usphone || 'n/a'}/</button>
      `;

      result += flagSwitcher + ukButton + usButton;
    }

    // 添加查看更多按钮
    result += `
        <button class="moreButton" data-word="${word}">查看更多</button>
      </div>
    `;

    // 2. 词性和释义
    if (data.ec?.word?.[0]?.trs?.length > 0) {
      result += `
        <div style="margin-bottom: 5px;">
          <strong style="color: #ddd; font-size: 12px;">释义</strong>
          <ul style="list-style-type: none; padding-left: 10px; margin: 5px 0;">
            ${data.ec.word[0].trs.map(tr => `<li style="color: white; margin: 3px 0; font-size: 12px;">${tr.tr[0].l.i[0] ? `<span style="color: #white;">${tr.tr[0].l.i[0]}</span> ` : ''}</li>`).join('')}
          </ul>
        </div>
      `;
    }

    // 3. 词形变化
    if (data.ec?.word?.[0]?.wfs?.length > 0) {
      result += `
        <div style="margin-bottom: 5px;">
          <strong style="color: #ddd; font-size: 12px;">词形变化</strong>
          <ul style="list-style-type: none; padding-left: 10px; margin: 5px 0;">
            ${data.ec.word[0].wfs.map(wf => `<li style="color: white; font-size: 12px;"><span style="color: #white;">${wf.wf.name}</span> <span style="color: #white;">${wf.wf.value}</span></li>`).join('')}
          </ul>
        </div>
      `;
    }

    // 4. 同根词
    if (data.rel_word?.rels && Array.isArray(data.rel_word.rels) && data.rel_word.rels.length > 0) {
      result += `
        <div style="margin-bottom: 5px;">
          <strong style="color: #ddd; font-size: 12px;">同根词</strong>
          <div style="list-style-type: none; padding-left: 10px; margin: 5px 0;">
            ${data.rel_word.rels.map(rel => `
              <div style="color: white; font-size: 12px;">
                ${(rel.rel.words || []).map(w => `
                  <div>
                    <span style="color: #white;">${rel.rel.pos || ''}</span>
                    <span style="color: #white;">${w?.word || ''}</span>
                    <span style="color: #white;">${w?.tran}</span>
                  </div>`).join('')}
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // 5. 同义词/近义词
    if (data.syno?.synos?.length > 0) {
      result += `
        <div style="margin-bottom: 5px;">
          <strong style="color: #ddd; font-size: 12px;">同义词</strong>
          <ul style="list-style-type: none; padding-left: 10px; margin: 5px 0;">
            ${data.syno.synos.map(syno => `
              <li style="color: white; font-size: 12px;">
                <span style="color: #white;">${syno.syno.pos || ''}</span> 
                <span style="color: #white;">${(syno.syno.ws || []).map(w => w?.w || '').filter(Boolean).join(', ')}</span>
                ${syno.syno.tran ? `<br><span style="color: #white;"></span> <span style="color: #white;">${syno.syno.tran}</span>` : ''}
              </li>
            `).join('')}
          </ul>
        </div>
      `;
    }

    // 6. 例句
    if (data.blng_sents_part?.['sentence-pair']?.length > 0) {
      result += `
        <div style="margin-bottom: 5px;">
          <strong style="color: #ddd; font-size: 12px;">例句</strong>
          <ul style="list-style-type: none; padding-left: 10px; margin: 5px 0;">
            ${data.blng_sents_part['sentence-pair'].map(pair => `
              <li style="color: white; margin-bottom: 5px; font-size: 12px;">
                <div><span style="color: #white;">${pair.sentence}</span></div>
                <div><span style="color: #888;">${pair['sentence-translation']}</span></div>
              </li>
            `).join('')}
          </ul>
        </div>
      `;
    }

    // 7. 词组搭配
    if (data.phrs?.phrs?.length > 0) {
      result += `
        <div style="margin-bottom: 5px;">
          <strong style="color: #ddd; font-size: 12px;">词组搭配</strong>
          <ul style="list-style-type: none; padding-left: 10px; margin: 5px 0;">
            ${data.phrs.phrs.map(phr => `
              <li style="color: white; margin-bottom: 5px; font-size: 12px;">
                <span style="color: white;">${phr.phr.headword.l.i}</span><span style="color: #white;; padding-left: 5px;">${phr.phr.trs[0].tr.l.i}</span>
              </li>
            `).join('')}
          </ul>
        </div>
      `;
    }

    // 缓存结
    await cacheWord(word, result);

    chrome.tabs.sendMessage(tabId, {
      action: "updateTranslation", 
      translation: result, 
      complete: true,
      word: word
    });
  } catch (error) {
    console.error('API error:', error);
    // 如果获取单词定义失败，则使用百度和Google翻译单词
    const extra = "<p style='font-size: 16px; color: white; margin: 0;'>使用网易API获取单词定义时出错。<br>以下是使用百度和Google翻译的结果。</p><br>";
    translateText(word, tabId, extra);
  }
}

async function translateText(text, tabId, extra = '') {
  try {
    // 获取存储的 API 密钥和 App ID
    const { googleApiKey, baiduAppId, baiduKey } = await new Promise((resolve) => {
      chrome.storage.sync.get(['googleApiKey', 'baiduAppId', 'baiduKey'], resolve);
    });

    // 首先发送一个初始的翻译结果框架
    chrome.tabs.sendMessage(tabId, {
      action: "updateTranslation",
      translation: `
        <p style="font-size: 16px; color: white; margin: 0;">
          ${extra}
          <strong>原文：</strong><br>
          ${text}<br><br>
          <strong>百度翻译：</strong><br>
          正在翻译...<br><br>
          <strong>Google 翻译：</strong><br>
          正在翻译...
        </p>
      `,
      complete: false
    });

    let baiduResult = '';
    let googleResult = '';

    // 检查百度翻译的 App ID 和 Key
    if (baiduAppId && baiduKey) {
      baiduResult = await translateWithBaidu(text, baiduAppId, baiduKey);
    } else {
      baiduResult = "<p style='color: red;'>未设置百度翻译的 App ID 和 Key。请点击右上角的插件设置。</p>";
    }

    // 检查 Google API Key
    if (googleApiKey) {
      googleResult = await translateWithGoogle(text, googleApiKey);
    } else {
      googleResult = "<p style='color: red;'>未设置 Google API Key。请点击右上角的插件设置。</p>";
    }

    // 更新翻译结果
    chrome.tabs.sendMessage(tabId, {
      action: "updateTranslation",
      translation: `
        <p style="font-size: 16px; color: white; margin: 0;">
          ${extra}
          <strong>原文：</strong><br>
          <span style="user-select: text; cursor: text;">${text}</span><br><br>
          <strong>百度翻译：</strong><br>
          <span style="user-select: text; cursor: text;">${baiduResult}</span><br><br>
          <strong>Google 翻译：</strong><br>
          <span style="user-select: text; cursor: text;">${googleResult}</span>
        </p>
      `,
      complete: true
    });

  } catch (error) {
    console.error('Translation error:', error);
    chrome.tabs.sendMessage(tabId, {
      action: "updateTranslation",
      translation: `
        ${extra}
        <p style='font-size: 16px; color: white; margin: 0;'>翻译失败，请重试。</p>
      `,
      complete: true
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

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data)
  });
  const json = await response.json();
  if (json.data && json.data.translations && json.data.translations.length > 0) {
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

  const url = `http://api.fanyi.baidu.com/api/trans/vip/translate?q=${encodeURIComponent(text)}&from=${from}&to=${to}&appid=${appId}&salt=${salt}&sign=${sign}`;

  const response = await fetch(url);
  const json = await response.json();
  if (json.trans_result && json.trans_result.length > 0) {
    return json.trans_result[0].dst;
  } else {
    throw new Error('Baidu translation failed');
  }
}

// 修改音频播放函数
async function playAudioInBackground(word, type) {
  const audioType = type == '2' ? 'us' : 'uk';
  try {
    // 先检查缓存
    const cachedResult = await getCachedWord(word);
    if (cachedResult && cachedResult.data.audio && cachedResult.data.audio[audioType]) {
      // 如果有缓存的音频数据，直接使用
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
              action: "playAudioInContent",
              audioData: cachedResult.data.audio[audioType]
          });
        }
      });
      return;
    }

    // 如果没有缓存，请求音频数据
    const audioUrl = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=${type}`;
    const response = await fetch(audioUrl);
    const arrayBuffer = await response.arrayBuffer();
    const audioData = Array.from(new Uint8Array(arrayBuffer));

    // 播放音频
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "playAudioInContent",
          audioData: audioData
        });
      }
    });
    cacheWordAudio(word, audioType, audioData);
  } catch (error) {
    console.error('Error fetching audio:', error);
  }
}

// 添加缓存音频的函数
async function cacheWordAudio(word, audioType, audioData) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['wordCache'], function(result) {
      const cache = result.wordCache || {};
      if (!cache[word]) {
        cache[word] = {
          data: { audio: {} },
          timestamp: Date.now()
        };
      } else if (!cache[word].data.audio) {
        cache[word].data.audio = {};
      }
      // 保存音频数据
      cache[word].data.audio[audioType] = audioData;
      // 更新时间戳
      cache[word].timestamp = Date.now();
      // 限制缓存大小，最多存储100个单词
      const words = Object.keys(cache);
      if (words.length > 100) {
        // 删除最早缓存的单词
        delete cache[words[0]];
      }
      
      chrome.storage.local.set({ wordCache: cache }, resolve);
    });
  });
}