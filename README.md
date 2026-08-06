# 选中翻译插件（Chrome Extension）

在浏览器网页中选中文本，即可查词或翻译为简体中文。扩展基于 **Manifest V3**，由**内容脚本**（页面交互与浮层）、**后台 Service Worker**（网络请求与缓存）和**弹出页**（设置）协作完成。

---

## 项目概要

| 项目 | 说明 |
|------|------|
| **名称** | 选中翻译 |
| **版本** | 1.3.0（见 `manifest.json`） |
| **目标** | 在任意网页选择英文内容，展示词典释义（单词）或机器翻译（短语/句子） |
| **输出语言** | 简体中文（词典释义来自有道接口结构；机器翻译为 `zh` / `zh-CN`） |

本仓库为**无构建步骤**的扩展：HTML/CSS/原生 JavaScript，无 React、Vue 等前端框架。

---

## 功能概览

- **选区触发**：鼠标松开后，若选中文本被判定为「可翻译的英文」，则出现「译」悬浮按钮，或（可选）直接弹出结果。
- **纯英文单词**（仅字母）：通过有道 JSON 接口拉取释义、词形变化、同根词、同义词、例句、常见搭配（含搭配译文）；支持英/美音切换与发音（音频经后台拉取后由页面用 Web Audio 播放）。
- **非纯词形式**（含空格、标点等）：走 **百度翻译** 与 **Google Cloud Translation API v2**（需在弹出页配置密钥），展示「原文内容卡片 + 各引擎独立结果块」。
- **开关**：可在弹出页关闭整站翻译、或开启「直接显示翻译结果」（跳过「译」按钮）。

---

## 架构与数据流

```mermaid
flowchart LR
  subgraph page["网页标签页"]
    CS["src/content.js\n内容脚本"]
    UI["浮层：图标 / 弹窗"]
    CS --> UI
  end
  subgraph ext["扩展"]
    POP["src/popup/\n设置与密钥"]
    BG["src/background.js\nService Worker"]
  end
  POP -->|chrome.storage| BG
  CS -->|sendMessage: translate / playAudio| BG
  BG -->|sendMessage: updateTranslation / playAudioInContent| CS
  BG -->|fetch| API["有道 / Google / 百度"]
```

**翻译请求分支（逻辑概要）：**

```mermaid
flowchart TD
  A[用户选中文本并松开鼠标] --> B{可翻译英文?}
  B -->|否| Z[不处理]
  B -->|是| C{直接翻译开关?}
  C -->|开| D[立即请求翻译并显示弹窗]
  C -->|关| E[显示译图标]
  E --> F[用户点击图标]
  F --> D
  D --> G{仅 a-zA-Z 整段?}
  G -->|是| H[有道词典 API\n释义 + 缓存]
  G -->|否| I[百度 + Google\n需配置密钥]
```

---

## 使用方法

### 安装（开发者模式）

1. 打开 Chrome，地址栏输入 `chrome://extensions/`。
2. 打开右上角 **开发者模式**。
3. 点击 **加载已解压的扩展程序**，选择本仓库根目录（含 `manifest.json` 的文件夹）。

### 在网页中使用

1. 确保扩展已启用，且弹出页中 **「启用翻译功能」** 为开启（默认开启）。
2. 用鼠标在页面上**拖选**一段英文（单词、短语或句子均可）。
3. **松开鼠标**后：
   - 默认：选区附近出现 **「译」** 小按钮，点击后发起翻译/查词。
   - 若开启 **「直接显示翻译结果」**：松手后直接弹出结果浮层，无需再点「译」。
4. 结果浮层可**拖动**，并会自动约束在可视区域内（避免超出屏幕）；点击浮层外的页面区域可关闭（等待结果过程中为避免误关有特殊判断）。
5. 单词结果中可切换英/美音按钮、「查看更多」跳转有道网页；完整结果返回后会按偏好**自动播放**一次读音。

### 本地验证

项目测试不依赖第三方包，使用 Node.js 内置测试运行器：

```bash
npm test
```

### 各模式说明

| 模式 | 行为 |
|------|------|
| 仅英文单词（`^[a-zA-Z]+$`） | 有道词典 JSON，失败时回退为百度+Google 翻译说明 |
| 短语/句子 | 需配置 API：同时尝试百度与 Google，未配置的引擎会显示提示文案；每个翻译引擎单独一个结果区块 |
| 排除规则 | 纯数字、中文、常见 URL/路径形态等不会被当作可翻译文本（见 `src/content.js` 中 `isTranslateable`） |

---

## 配置方法

### 弹出页设置

点击浏览器工具栏中的扩展图标，打开弹出页：

| 配置项 | 存储键 | 说明 |
|--------|--------|------|
| 启用翻译功能 | `isEnabled` | 关闭后不再显示图标/结果，并清理当前页浮层 |
| 直接显示翻译结果 | `directTranslate` | 选区松手后直接弹层，不经过「译」按钮 |
| Google API Key | `googleApiKey` | [Google Cloud Translation API](https://cloud.google.com/translate/docs) 的 API 密钥 |
| 百度翻译 App ID | `baiduAppId` | [百度翻译开放平台](https://fanyi-api.baidu.com/) 应用 ID |
| 百度翻译 Key | `baiduKey` | 同上应用密钥 |
| 音标偏好 | `phoneticPreference` | `us` / `uk`，在单词浮层内切换时写入 |

插件会直接加载项目根目录、已被 `.gitignore` 忽略的 `key.js`，从全局 `TRANSLATION_API_KEYS` 配置对象读取密钥，无需再手动填写。弹出页会显示自动读取到的值；如在弹出页点击 **「保存以上密钥」**，对应值会写入本机 `chrome.storage.local` 并优先于 `key.js`。旧版本保存在 `chrome.storage.sync` 的密钥仍可读取，并会在下次保存时迁移到本机。至少需要提供 **Google Key** 或 **百度 App ID + Key** 中的一套，短语/句子翻译才会有对应引擎的结果。

### 获取第三方密钥（官方入口）

- **Google**：在 [Google Cloud Console](https://console.cloud.google.com/) 创建项目，启用 Cloud Translation API，创建 API 密钥并限制用途（建议限制 HTTP 引用来源或 IP，仅作说明，具体以 Google 文档为准）。
- **百度**：在 [百度翻译开放平台](https://fanyi-api.baidu.com/) 创建应用，获取 App ID 与密钥。

### 权限与网络

扩展在 `manifest.json` 中声明了 `storage` 与三个翻译服务所需的 `host_permissions`。内容脚本仅注入 HTTP/HTTPS 页面，不访问浏览器内部页面或本地文件。

---

## 存储说明

| 存储 | 用途 |
|------|------|
| 根目录 `key.js` | 本地默认 API 密钥，不提交到 Git，由后台和弹出页自动读取 |
| `chrome.storage.sync` | 启用状态、直接翻译和音标偏好等非敏感用户设置 |
| `chrome.storage.local` | API 密钥覆盖值与 `wordCache`（约 24 小时过期、最多约 40 词，音频使用 Base64 且限制单项大小） |

---

## 项目结构（主要文件）

```
chrome-translation-extension/
├── manifest.json              # 扩展清单（入口指向 src/）
├── key.js                     # 本地默认密钥（被 Git 忽略）
├── package.json               # 零依赖回归测试命令
├── LICENSE
├── README.md
├── TechStack.md
├── src/
    ├── api-keys.js            # 读取 key.js 并合并弹出页覆盖值
    ├── background.js          # Service Worker：翻译、缓存、音频
    ├── content.js             # 内容脚本：选区、浮层、消息
    ├── icons/                 # 工具栏图标（紫渐变「译」）
    ├── styles/
    │   └── content.css        # 注入页面的图标与弹层样式
    └── popup/
        ├── popup.html
        ├── popup.css          # 弹出页专用样式
        └── popup.js
└── test/
    ├── extension.test.js      # 安全、权限、缓存和解析回归测试
    └── test.html              # 手工选词测试页
```

| 路径 | 作用 |
|------|------|
| `manifest.json` | MV3 清单、权限、`src/` 下各入口 |
| `src/content.js` | 选区检测、图标/弹层 UI、与后台消息收发、音频播放解码 |
| `src/background.js` | 翻译路由、有道/百度/Google 请求、MD5 签名、缓存与音频拉取 |
| `src/popup/popup.html` · `popup.js` · `popup.css` | 设置界面与 `storage` 读写 |
| `src/styles/content.css` | 注入网页的 `.translate-icon` / `.translate-popup` 等 |
| `test/extension.test.js` | Node.js 内置测试运行器执行的零依赖回归测试 |

---

## 注意事项

- **安全**：`key.js` 已被 `.gitignore` 忽略，请勿强制提交。浏览器扩展中的密钥无法真正保密，若分发插件，其他人仍可从扩展文件或网络请求中读取密钥；建议仅本机使用，并在第三方平台限制密钥权限和额度。
- **请求安全**：仅可信用户事件可以发起翻译，文本最长 5000 字符；页面展示使用标签/属性白名单并转义第三方文本。
- **清单与权限**：当前 `host_permissions` 仅包含有道、Google、百度翻译所需 HTTPS 域名；MD5 在 `src/background.js` 内联实现。
- **缓存策略**：单词缓存项包含 `templateVersion`，当模板升级时会自动淘汰旧缓存；音频缓存使用 Base64 并限制大小，避免快速耗尽 `storage.local` 配额。
- **引擎容错**：百度和 Google 并行请求、独立显示结果，单个引擎失败不会遮蔽另一个引擎的成功结果。

---

## 许可证

见仓库根目录 `LICENSE` 文件。
