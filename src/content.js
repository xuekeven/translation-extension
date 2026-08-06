const EXTENSION_ROOT_ID = '__selection_translation_extension_root__';
const MAX_TRANSLATION_LENGTH = 5000;
const ALLOWED_TRANSLATION_TAGS = new Set(['section', 'div', 'h1', 'p', 'span', 'button']);
const ALLOWED_TRANSLATION_ATTRIBUTES = new Set([
  'class',
  'type',
  'aria-label',
  'data-current',
  'data-word',
  'data-type',
  'data-phonetic'
]);

// 标记是否正在拖动弹出框
let isDragging = false;

// 存储拖动时鼠标相对于弹出框左上角的偏移量
let dragOffsetX, dragOffsetY;

// 存储最后选中的文本
let lastSelectedText = '';

// 在文件开头添加一个变量来存储开关状态
let isTranslationEnabled = true;

// 添加一个变量来存储当前正在翻译的单词
let currentTranslatingWord = '';

// 添加一个变量来存储直接翻译开关状态
let isDirectTranslateEnabled = false;

// 添加一个变量来存储是否正在等待翻译结果
let isWaitingForTranslateResult = false;

let activeTranslationRequestId = 0;
let sharedAudioContext = null;
let extensionRoot = null;

function getExtensionRoot() {
  if (!extensionRoot || !extensionRoot.isConnected) {
    extensionRoot = document.createElement('div');
    extensionRoot.id = EXTENSION_ROOT_ID;
    (document.body || document.documentElement).appendChild(extensionRoot);
  }
  return extensionRoot;
}

function queryExtensionElement(selector) {
  return getExtensionRoot().querySelector(selector);
}

function isExtensionInteraction(event) {
  if (!extensionRoot) return false;
  const eventPath = typeof event.composedPath === 'function' ? event.composedPath() : [];
  return eventPath.includes(extensionRoot) || extensionRoot.contains(event.target);
}

function setSafeTranslationHtml(container, html) {
  const template = document.createElement('template');
  template.innerHTML = String(html || '');

  Array.from(template.content.querySelectorAll('*')).forEach(function (element) {
    const tagName = element.tagName.toLowerCase();
    if (!ALLOWED_TRANSLATION_TAGS.has(tagName)) {
      element.replaceWith(document.createTextNode(element.textContent || ''));
      return;
    }

    Array.from(element.attributes).forEach(function (attribute) {
      if (!ALLOWED_TRANSLATION_ATTRIBUTES.has(attribute.name)) {
        element.removeAttribute(attribute.name);
      }
    });

    if (tagName === 'button') {
      element.setAttribute('type', 'button');
    }
  });

  container.replaceChildren(template.content.cloneNode(true));
}

async function playAudioData(audioData) {
  if (!Array.isArray(audioData) || audioData.length === 0 || audioData.length > 2 * 1024 * 1024) return;

  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    sharedAudioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (sharedAudioContext.state === 'suspended') {
    await sharedAudioContext.resume();
  }

  const arrayBuffer = new Uint8Array(audioData).buffer;
  const buffer = await sharedAudioContext.decodeAudioData(arrayBuffer);
  const source = sharedAudioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(sharedAudioContext.destination);
  source.start(0);
}

// 添加一个监听器来接收开关状态的更新
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "toggleTranslation") {
    isTranslationEnabled = request.isEnabled;
    // 如果关闭了翻译功能，清除所有已存在的翻译相关元素
    if (!isTranslationEnabled) {
      hideTranslateIcon();
      hideTranslatePopup();
    }
    return false; // 不需要异步响应
  }
  if (request.action === "toggleDirectTranslate") {
    isDirectTranslateEnabled = request.directTranslate;
    return false;
  }
  if (request.action === "playAudioInContent") {
    playAudioData(request.audioData).catch(function (error) {
      console.error('Error decoding audio data:', error);
    });
  }
  return false;
});

// 在初始化时获取开关状态
chrome.storage.sync.get(['isEnabled'], function(data) {
  isTranslationEnabled = data.isEnabled !== undefined ? data.isEnabled : true;
});

// 在初始化时获取直接翻译开关状态
chrome.storage.sync.get(['directTranslate'], function(data) {
  isDirectTranslateEnabled = data.directTranslate || false;
});

/**
 * 创建翻译图标
 * @param {number} x - 图标的横坐标
 * @param {number} y - 图标的纵坐标
 * @returns {HTMLElement} - 创建的翻译图标元素
 */
function createTranslateIcon(x, y) {
  const translateIcon = document.createElement('button');
  translateIcon.type = 'button';
  translateIcon.setAttribute('aria-label', '翻译选中的文本');
  translateIcon.className = 'translate-icon';
  translateIcon.style.left = `${x}px`;
  translateIcon.style.top = `${y}px`;
  translateIcon.textContent = '译';
  translateIcon.addEventListener('click', e => handleIconClick(e, x, y));
  getExtensionRoot().appendChild(translateIcon);
  return translateIcon;
}

/**
 * 显示翻译图标
 * @param {number} x - 图标的横坐标
 * @param {number} y - 图标的纵坐标
 */
function showTranslateIcon(x, y) {
  // 移除可能存在的旧图标
  hideTranslateIcon();
  // 创建新图标
  createTranslateIcon(x, y);
}

/**
 * 隐藏翻译图标
 */
function hideTranslateIcon() {
  const existingIcon = queryExtensionElement('.translate-icon');
  if (existingIcon) {
    existingIcon.remove();
  }
}

/**
 * 处理翻译图标的点击事件
 * @param {Event} e - 点击事件对象
 */
function handleIconClick(e, x, y) {
  if (!e.isTrusted) return;
  if (!isTranslationEnabled) return; // 如果翻译功能被禁用，直接返回

  e.preventDefault(); // 阻止默认行为
  e.stopPropagation(); // 阻止事件冒泡

  // const iconRect = e.currentTarget.getBoundingClientRect();
  // console.log('---iconRect', lastSelectedText);
  // console.log('iconRect---', iconRect);
  translateText(lastSelectedText, x, y);
}

/**
 * 创建翻译结果弹出框
 * @param {string} text - 翻译结果文本
 * @param {number} x - 弹出框的横坐标
 * @param {number} y - 弹出框的纵坐标
 * @returns {HTMLElement} - 创建的翻译结果弹出框元素
 */
function createTranslatePopup(text, x, y) {
  const translatePopup = document.createElement('div');
  translatePopup.style.left = `${x}px`;
  translatePopup.style.top = `${y}px`;
  translatePopup.className = 'translate-popup';

  // 创建内容容器
  const contentDiv = document.createElement('div');
  contentDiv.className = 'translate-popup__body';
  setSafeTranslationHtml(contentDiv, text);

  // 组装弹出框
  translatePopup.appendChild(contentDiv);
  getExtensionRoot().appendChild(translatePopup);

  // 初次创建后立即做一次视口内约束，避免弹层超出屏幕
  clampPopupToViewport(translatePopup);

  // 添加拖动事件监听器
  translatePopup.addEventListener('mousedown', startDragging);
  document.addEventListener('mousemove', drag);
  document.addEventListener('mouseup', stopDragging);

  // 添加一个用于更新内容的方法
  translatePopup.updateContent = function(newContent) {
    setSafeTranslationHtml(contentDiv, newContent);
    // 内容高度变化后再次约束，避免底部或右侧溢出
    clampPopupToViewport(translatePopup);
  };

  return translatePopup;
}

/**
 * 将弹层位置限制在当前可视区域内
 * @param {HTMLElement} popup
 */
function clampPopupToViewport(popup) {
  if (!popup) return;
  const margin = 8;
  const rect = popup.getBoundingClientRect();
  const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
  const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
  const currentLeft = popup.offsetLeft;
  const currentTop = popup.offsetTop;
  const clampedLeft = Math.min(Math.max(currentLeft, margin), maxLeft);
  const clampedTop = Math.min(Math.max(currentTop, margin), maxTop);
  popup.style.left = `${clampedLeft}px`;
  popup.style.top = `${clampedTop}px`;
}

/**
 * 隐藏翻译结果弹出框
 */
function hideTranslatePopup() {
  const existingPopup = queryExtensionElement('.translate-popup');
  if (existingPopup) {
    existingPopup.remove();
    currentTranslatingWord = ''; // 清除当前翻译的单词
  }
  activeTranslationRequestId += 1;
  isWaitingForTranslateResult = false;
}

/**
 * 检查文本是否要翻译
 * @param {string} text - 要检查的文本
 * @returns {boolean} - 如果包含有意义的英文内容返回true，否则返回false
 */
function isTranslateable(text) {
    if (typeof text !== 'string' || text.length > MAX_TRANSLATION_LENGTH) return false;

    // 至少包含一个英文单词（1个或以上字母）的正则表达式
    const englishWordPattern = /[a-zA-Z]{1,}/;
  
    // 排除常见的无意义字符串模式
    const excludePatterns = [
      /^[0-9-]+$/, // 纯数字和连字符
      /^[a-f0-9-]{8,}$/i, // UUID类格式
      /^\d+$/, // 纯数字
      /^[^a-zA-Z]*$/, // 不包含任何英文字母的文本
      /[\u4e00-\u9fa5]/, // 包含中文字符
      /^https?:\/\//, // 以 http:// 或 https:// 开头的 URL
      /^www\./, // 以 www. 开头的 URL
      /\.(com|net|org|edu|gov|mil|biz|info|io|uk|cn|jp)(\/.+)?$/, // 常见顶级域名结尾的 URL
      /^[a-zA-Z]:\\/, // Windows 文件路径
      /^\/[a-zA-Z]/, // Unix 文件路径
      /^[a-zA-Z0-9]+:\/\// // 其他协议的 URI（如 ftp://, file:// 等）
    ];
  
    // 检查是否包含至少一个有意义的英文单词，且不匹配任何排除模式
    return englishWordPattern.test(text) && !excludePatterns.some(pattern => pattern.test(text));
}

/**
 * 发送翻译请求并显示结果
 * @param {string} text - 要翻译的文本
 * @param {number} x - 结果显示的横坐标
 * @param {number} y - 结果显示的纵坐标
 */
function translateText(text, x, y) {
  if (!isTranslateable(text)) return;
  hideTranslateIcon(); // 隐藏翻译图标
  
  // 创建一个新的弹出框或获取现有的弹出框
  let popup = queryExtensionElement('.translate-popup');
  if (!popup) {
    popup = createTranslatePopup('<p class="translate-loading">正在翻译...</p>', x, y);
  }

  isWaitingForTranslateResult = true;
  const requestId = ++activeTranslationRequestId;
  const sendPromise = chrome.runtime.sendMessage({action: "translate", text: text, requestId: requestId});
  if (sendPromise && typeof sendPromise.then === 'function') {
    sendPromise.then(function (response) {
      if (response?.ok !== false || requestId !== activeTranslationRequestId) return;
      isWaitingForTranslateResult = false;
      updateTranslatePopup('<p class="sentence-note sentence-note--error">翻译请求未被后台接受，请重试。</p>', '', true);
    }).catch(function () {
      if (requestId !== activeTranslationRequestId) return;
      isWaitingForTranslateResult = false;
      updateTranslatePopup('<p class="sentence-note sentence-note--error">无法连接插件后台，请重新加载扩展后重试。</p>', '', true);
    });
  }
}

// 修改开始拖动、拖动和停止拖动的函数
let dragTarget = null;

function startDragging(e) {
  // 如果点击的是按钮、链接或文本内容，不触发拖动
  if (e.target.tagName.toLowerCase() === 'button' || 
      e.target.tagName.toLowerCase() === 'a' || 
      e.target.tagName.toLowerCase() === 'span' 
    ) {
    return;
  }

  // 获取最近的 translate-popup 父元素
  const popup = e.target.closest('.translate-popup');
  if (popup) {
    isDragging = true;
    dragTarget = popup;
    dragOffsetX = e.clientX - popup.offsetLeft;
    dragOffsetY = e.clientY - popup.offsetTop;
  }
}

function drag(e) {
  if (isDragging && dragTarget) {
    dragTarget.style.left = (e.clientX - dragOffsetX) + 'px';
    dragTarget.style.top = (e.clientY - dragOffsetY) + 'px';
    clampPopupToViewport(dragTarget);
  }
}

function stopDragging() {
  isDragging = false;
  if (dragTarget) {
    clampPopupToViewport(dragTarget);
  }
  dragTarget = null;
}

function mouseupHandler(e) {
  if (!e.isTrusted) return;
  if (!isTranslationEnabled) return; // 如果翻译功能被禁用，直接返回
  if (isExtensionInteraction(e)) return;

  const selectedText = window.getSelection().toString().trim();
  // 如果选中的文本不是英文单词，则不进行翻译
  if (!selectedText || !isTranslateable(selectedText)) return;

  // 检查选中的文本是否在翻译弹层内
  const translatePopup = queryExtensionElement('.translate-popup');
  const isInsidePopup = translatePopup && translatePopup.contains(e.target);

  // 如果在弹层内且选中的文本与当前翻译的单词相同，则不显示翻译图标
  if (isInsidePopup && selectedText === currentTranslatingWord) {
    return;
  }

  const range = window.getSelection().getRangeAt(0);
  const rect = range.getBoundingClientRect();
  const x = e.x;
  const y = rect.bottom;
  lastSelectedText = selectedText;
  // console.log('test--- mouseup', e, rect, x, y, lastSelectedText);

  if (isDirectTranslateEnabled) {
    // 创建弹层并发送翻译请求
    translateText(selectedText, x, y);
    // 防止事件冒泡
    e.stopPropagation();
  } else {
    // 显示翻译图标
    showTranslateIcon(x, y);
  }
}
// 修改鼠标释放事件监听器，添加开关状态检查
document.addEventListener('mouseup', mouseupHandler);

// 监听点击事件，用于隐藏翻译图标和弹出框
document.addEventListener('click', function(e) {
  if (!e.isTrusted) return;
  // 然后检查translatePopup是否存在，如果存在且点击不在其内部，则隐藏它
  const selectedText = window.getSelection().toString().trim();
  if (!selectedText) {
    hideTranslateIcon();
  }
  const translatePopup = queryExtensionElement('.translate-popup');
  if (translatePopup && !translatePopup.contains(e.target) && !isWaitingForTranslateResult) {
    hideTranslatePopup();
  }
});

// 修改消息监听器
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "translate") {
    if (!isTranslationEnabled) {
      sendResponse({text: null});
      return false;
    }
    var selectedText = window.getSelection().toString().trim();
    if (selectedText && isTranslateable(selectedText)) {
      sendResponse({text: selectedText});
    } else {
      sendResponse({text: null});
    }
    return false; // 不需要异步响应
  } else if (request.action === "updateTranslation") {
    if (request.requestId !== activeTranslationRequestId) return false;
    isWaitingForTranslateResult = !request.complete;
    if (!isTranslationEnabled) return false;
    updateTranslatePopup(request.translation, request.word, request.complete);
    return false; // 不需要异步响应
  }
  return false; // 默认返回 false
});

// 监听鼠标释放事件，用于处理拖动结束后的情况
document.addEventListener('mouseup', function() {
  if (isDragging) {
    isDragging = false;
    // 在拖动结束后，更新lastSelectedText为当前选中的文本
    lastSelectedText = window.getSelection().toString().trim();
    // console.log('test--- mouseup', lastSelectedText);
  }
});

// 在 updateTranslatePopup 函数中添加事件监听
function updateTranslatePopup(translation, word, complete) {
  currentTranslatingWord = word || '';

  let translatePopup = queryExtensionElement('.translate-popup');
  
  if (!translatePopup) {
    const fallbackX = Math.max(16, Math.min(window.innerWidth - 430, window.innerWidth * 0.18));
    const fallbackY = Math.max(16, window.innerHeight * 0.15);
    translatePopup = createTranslatePopup('<p class="translate-loading">正在翻译...</p>', fallbackX, fallbackY);
  }
  translatePopup.updateContent(translation);
  
  // 修改播放按钮的击事件处理
  const playButtons = translatePopup.querySelectorAll('.playButton');
  playButtons.forEach(button => {
    button.addEventListener('click', function(e) {
      if (!e.isTrusted) return;
      e.stopPropagation();
      const word = this.getAttribute('data-word');
      const type = this.getAttribute('data-type');
      
      // 直接发送消息给 background 脚本播放音频
      chrome.runtime.sendMessage({
        action: "playAudio",
        word: word,
        type: type
      });
    });
  });
  
  // 为查看更多按钮添加点击事件
  const moreButtons = translatePopup.querySelectorAll('.moreButton');
  moreButtons.forEach(button => {
    button.addEventListener('click', function(e) {
      if (!e.isTrusted) return;
      e.stopPropagation();
      const word = this.getAttribute('data-word');
      window.open(`https://dict.youdao.com/result?word=${encodeURIComponent(word)}&lang=en`, '_blank', 'noopener,noreferrer');
    });
  });

  // 为音标切换按钮添加点击事件
  const flagSwitcher = translatePopup.querySelector('.flagSwitcher');
  if (flagSwitcher) {
    flagSwitcher.addEventListener('click', function(e) {
      if (!e.isTrusted) return;
      e.stopPropagation();
      const currentPhonetic = this.getAttribute('data-current');
      const newPhonetic = currentPhonetic === 'us' ? 'uk' : 'us';
      
      // 更新显示状态
      const ukButton = translatePopup.querySelector('[data-phonetic="uk"]');
      const usButton = translatePopup.querySelector('[data-phonetic="us"]');
      
      if (newPhonetic === 'uk') {
        ukButton.classList.remove('is-hidden');
        usButton.classList.add('is-hidden');
        this.textContent = '🇬🇧';
      } else {
        ukButton.classList.add('is-hidden');
        usButton.classList.remove('is-hidden');
        this.textContent = '🇺🇸';
      }
      
      // 保存用户偏好
      chrome.storage.sync.set({ phoneticPreference: newPhonetic });
      this.setAttribute('data-current', newPhonetic);

      // 播放新选择的音标发音
      if (currentTranslatingWord) {
        chrome.runtime.sendMessage({
          action: "playAudio",
          word: currentTranslatingWord,
          type: newPhonetic === 'us' ? 2 : 1  // 2代表美音，1代表英音
        });
      }
    });
  }

  // 为所有包含文本的元素添加样式
  const textElements = translatePopup.querySelectorAll('span');
  textElements.forEach(element => {
    if (element.textContent.trim()) {  // 只为包含文本的元素添加样式
      element.style.userSelect = 'text';  // 允许文本选择
      element.style.cursor = 'text';      // 文本光标
    } else {
      element.style.cursor = 'move';      // 空白区域显示移动光标
    }
  });

  // 在更新弹窗内容后，如果是完整的翻译结果且有单词，根据用户偏好自动播放发音
  if (complete && word) {
    // 获取用户的音标偏好
    chrome.storage.sync.get(['phoneticPreference'], function(result) {
      // 默认使用美音
      const preference = result.phoneticPreference || 'us';
      const type = preference === 'us' ? 2 : 1;  // 2代表美音，1代表英音
      
      // 发送播放音频消息
      chrome.runtime.sendMessage({
        action: "playAudio",
        word: word,
        type: type
      });
    });
  }
}
