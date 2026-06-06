# 🧪 心理学实验平台 — 语音交互行为实验

> 基于 GitHub Pages 的静态网页实验平台，支持视频情景展示、语音录制、交互选题和数据云端上传。

---

## 📋 实验流程

| 步骤 | 阶段 | 说明 |
|------|------|------|
| 0 | 知情同意书 | 强制勾选后才能继续，明确告知麦克风权限和数据用途 |
| 1 | 麦克风测试 | 录制 5 秒音频并回放，确认麦克风正常工作 |
| 2 | 被试编号 | 输入匿名被试编号（不关联身份信息） |
| 3 | 视频情景 | 播放情景视频（预留位置，放入 `assets/video/scenario.mp4`） |
| 4 | 选择题 | 根据视频情景完成交互选择题 |
| 5 | 语音回答 | 录制语音回答（10 秒），支持回放和重新录制 |
| 6 | 数据上传 | 自动上传到云后端，支持本地数据备份下载 |

---

## 🚀 快速部署到 GitHub Pages

### 第一步：清空仓库并推送代码

```bash
# 1. 克隆你的 GitHub Pages 仓库
git clone https://github.com/By4tander/By4tander.github.io.git
cd By4tander.github.io

# 2. 清空所有旧文件
git rm -rf .
# 或者在本地先删除再提交

# 3. 复制实验平台文件到仓库目录
# （将 MyPage 目录下的所有文件复制过来）

# 4. 添加、提交、推送
git add .
git commit -m "feat: 心理学语音交互实验平台 v1.0"
git push origin master  # 或 main

# 5. 访问 https://by4tander.github.io 测试
```

### 第二步：放入测试视频

将测试视频重命名为 `scenario.mp4`，放入 `assets/video/` 目录，然后提交：

```bash
cp /path/to/your/test-video.mp4 assets/video/scenario.mp4
git add assets/video/scenario.mp4
git commit -m "添加测试视频"
git push
```

---

## ⚙️ 后端配置

### 选项 A：阿里云（推荐用于正式实验）

1. **开通阿里云函数计算 FC**
   - 进入 [函数计算控制台](https://fc.console.aliyun.com/)
   - 创建 HTTP 函数，Node.js 18 运行时
   - 将 `backend/aliyun-fc-template.js` 作为函数代码

2. **配置 API 网关**
   - 为函数添加 HTTP 触发器
   - 记录 API 端点地址

3. **配置前端**
   - 编辑 `js/config.js`，填入 API 端点：
   ```javascript
   aliyun: {
     apiEndpoint: 'https://YOUR_ID.apigateway.aliyuncs.com/prod/experiment/upload',
     appKey: 'YOUR_APP_KEY',
     appSecret: 'YOUR_APP_SECRET',
   }
   ```

4. **配置 OSS（存储音频文件）**
   - 创建 OSS Bucket，获取 AccessKey
   - 在函数计算环境变量中配置

### 选项 B：LeanCloud（推荐用于快速测试）

1. 注册 [LeanCloud](https://leancloud.cn/)，创建应用
2. 在 `js/config.js` 中修改：
```javascript
backend: {
  type: 'leancloud',
  leancloud: {
    appId: 'YOUR_APP_ID',
    appKey: 'YOUR_APP_KEY',
    serverURL: 'https://YOUR_APP_ID.api.lncldglobal.com',
  },
}
```

### 选项 C：本地模式（无需后端）

修改 `js/config.js`：
```javascript
backend: {
  type: 'local',  // 数据仅保存在本地，实验结束后手动下载
}
```

---

## 🎨 自定义配置

编辑 `js/config.js` 修改以下内容：

### 实验问题
```javascript
scenario: {
  description: '根据刚才观看的视频情景，请回答以下问题：',
  questions: [
    {
      id: 'q1',
      stem: '您的问题文字...',
      options: [
        { value: 'A', label: '选项A' },
        { value: 'B', label: '选项B' },
        // ...
      ],
    },
  ],
  voiceQuestion: '语音回答的问题文字...',
},
```

### 被试信息扩展字段

在 `index.html` 的 `#extraFieldsGroup` 中取消隐藏即可启用年龄、性别字段。

### 录音时长
```javascript
experiment: {
  micTestDuration: 5,        // 麦克风测试录音秒数
  voiceAnswerDuration: 10,   // 语音回答录音秒数
},
```

---

## 📊 数据格式

上传到后端的 JSON 数据结构：

```json
{
  "sessionId": "唯一会话ID",
  "subjectId": "被试编号",
  "timestamp": "ISO 8601 时间戳",
  "experiment": {
    "name": "语言交互行为实验",
    "version": "1.0.0"
  },
  "stages": {
    "micTest": { "passed": true, "audioBase64": "...", "audioSize": 12345 },
    "choices": [
      { "questionId": "q1", "selectedValue": "A", "selectedLabel": "选项A：..." }
    ],
    "voiceAnswer": { "audioBase64": "...", "audioSize": 54321, "duration": 10 }
  },
  "metadata": {
    "consentTime": "...",
    "experimentStartTime": "...",
    "experimentEndTime": "...",
    "totalDuration": 45.2
  }
}
```

---

## 🔒 隐私与安全

- 被试编号为匿名标识，不关联个人身份信息
- 音频数据经 Base64 编码传输，生产环境建议使用 HTTPS
- 数据仅用于学术研究目的
- 被试可在实验过程中随时退出

---

## 📁 项目结构

```
MyPage/
├── index.html              # 实验主页面
├── css/
│   └── style.css           # 样式表
├── js/
│   ├── config.js           # 实验配置（★需要修改★）
│   ├── storage.js          # 数据持久化模块
│   ├── recorder.js         # 音频录制模块
│   ├── data-collector.js   # 数据采集模块
│   ├── experiment.js       # 实验流程控制器
│   └── main.js             # 入口文件
├── assets/
│   └── video/
│       └── scenario.mp4    # ★放入您的测试视频★
├── backend/
│   └── aliyun-fc-template.js  # 阿里云后端模板
└── README.md               # 本文件
```

---

## 🌐 浏览器兼容性

| 功能 | Chrome | Edge | Firefox | Safari |
|------|--------|------|---------|--------|
| 录音 (MediaRecorder) | ✅ 49+ | ✅ 79+ | ✅ 25+ | ⚠️ 14.1+ |
| 音频可视化 | ✅ | ✅ | ✅ | ✅ |
| 视频播放 | ✅ | ✅ | ✅ | ✅ |

> **建议使用 Chrome 或 Edge 浏览器以获得最佳体验。**

---

## 🐛 常见问题

**Q: 录音按钮灰色不可点击？**
A: 需要在浏览器设置中允许麦克风权限。Chrome：地址栏左侧 → 网站设置 → 麦克风 → 允许。

**Q: Safari 无法录音？**
A: Safari 14.1+ 支持 MediaRecorder，但格式可能不兼容。建议使用 Chrome。

**Q: 视频不显示？**
A: 确认 `assets/video/scenario.mp4` 文件存在且格式为 H.264 + AAC。

**Q: 数据上传失败？**
A: 检查 `js/config.js` 中的后端配置是否正确。也可先使用 local 模式测试。

---

*本平台仅用于学术研究目的。*
