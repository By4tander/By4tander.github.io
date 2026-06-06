/**
 * ============================================================
 * 实验流程控制器 - 管理 Stage 切换和交互逻辑
 * ============================================================
 */

const Experiment = {
  // 当前阶段索引（0-6）
  currentStage: 0,
  
  // 阶段列表
  stages: [
    'consent',    // 0: 知情同意
    'mic-test',   // 1: 麦克风测试
    'subject-id', // 2: 被试编号
    'video',      // 3: 视频情景
    'choice',     // 4: 选择题
    'voice',      // 5: 语音回答
    'complete',   // 6: 完成页
  ],

  // 录音器实例
  micTestRecorder: null,
  voiceRecorder: null,

  // 录音数据
  micTestAudio: null,   // { blob, url, base64 }
  voiceAudio: null,     // { blob, url, base64 }

  /**
   * 初始化实验
   */
  init() {
    DataCollector.reset();
    this._bindEvents();
    this._showStage(0);
    this._checkBrowser();
  },

  /**
   * 浏览器兼容性检查
   */
  _checkBrowser() {
    const warnings = [];
    const testRecorder = new AudioRecorder({ maxDuration: 1000 });
    
    if (!testRecorder.isSupported) {
      warnings.push('您的浏览器不支持录音功能，请使用最新版 Chrome、Edge 或 Firefox。');
    }

    if (warnings.length > 0) {
      this._showModal(warnings.join('<br>'));
    }
  },

  /**
   * 绑定全局事件
   */
  _bindEvents() {
    // 知情同意 → 下一步
    document.getElementById('consentCheckbox').addEventListener('change', (e) => {
      const checked = e.target.checked;
      const btn = document.getElementById('btnConsentNext');
      const hint = document.getElementById('consentHint');
      btn.disabled = !checked;
      hint.style.display = checked ? 'none' : 'block';
    });

    document.getElementById('btnConsentNext').addEventListener('click', () => {
      DataCollector.setConsent();
      this._showStage(1);
    });

    // 麦克风测试按钮
    document.getElementById('btnStartRecord').addEventListener('click', () => {
      this._startMicTest();
    });

    document.getElementById('btnMicOK').addEventListener('click', () => {
      this._showStage(2);
    });

    document.getElementById('btnMicRetry').addEventListener('click', () => {
      this._resetMicTest();
    });

    // 被试编号
    const subjectInput = document.getElementById('subjectId');
    subjectInput.addEventListener('input', () => {
      document.getElementById('btnStartExperiment').disabled = !subjectInput.value.trim();
    });

    document.getElementById('btnStartExperiment').addEventListener('click', () => {
      const id = subjectInput.value.trim();
      DataCollector.setSubjectId(id);
      this._showStage(3);
    });

    // 视频
    const video = document.getElementById('scenarioVideo');
    video.addEventListener('ended', () => {
      DataCollector.logVideoWatched();
      document.getElementById('btnVideoContinue').style.display = 'flex';
    });

    document.getElementById('btnVideoContinue').addEventListener('click', () => {
      this._showStage(4);
    });

    // 选择题
    document.getElementById('btnSubmitChoices').addEventListener('click', () => {
      this._collectChoices();
      this._showStage(5);
    });

    // 语音回答
    document.getElementById('btnVoiceRecord').addEventListener('click', () => {
      this._startVoiceRecord();
    });

    document.getElementById('btnVoiceOK').addEventListener('click', () => {
      this._showStage(6);
    });

    document.getElementById('btnVoiceRetry').addEventListener('click', () => {
      this._resetVoiceRecord();
    });

    // 完成页 - 下载数据
    document.getElementById('btnDownloadData').addEventListener('click', () => {
      DataCollector.download();
    });

    // 弹窗关闭
    document.getElementById('btnModalClose').addEventListener('click', () => {
      document.getElementById('modalOverlay').style.display = 'none';
    });
  },

  /**
   * 切换到指定阶段
   * @param {number} index
   */
  _showStage(index) {
    // 隐藏所有阶段
    document.querySelectorAll('.stage').forEach(el => el.classList.remove('active'));

    // 显示目标阶段
    const stageId = this.stages[index];
    const stageEl = document.getElementById(`stage-${stageId}`);
    if (stageEl) {
      stageEl.classList.add('active');
    }

    // 更新进度条
    this._updateProgress(index);

    // 滚动到顶部
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // 阶段初始化
    this.currentStage = index;
    this._onStageEnter(stageId);
  },

  /**
   * 阶段进入时的初始化
   * @param {string} stageId
   */
  _onStageEnter(stageId) {
    switch (stageId) {
      case 'mic-test':
        this._initMicTest();
        break;
      case 'video':
        this._initVideo();
        break;
      case 'choice':
        this._renderChoices();
        break;
      case 'voice':
        this._initVoiceStage();
        break;
      case 'complete':
        this._handleComplete();
        break;
    }
  },

  /**
   * 更新进度条
   * @param {number} index
   */
  _updateProgress(index) {
    const total = this.stages.length - 1;
    const percent = Math.round((index / total) * 100);
    document.getElementById('progressFill').style.width = `${percent}%`;
    document.getElementById('progressText').textContent = `步骤 ${index}/${total}`;
  },

  // ==========================================
  // Stage 1: 麦克风测试
  // ==========================================
  async _initMicTest() {
    const statusEl = document.getElementById('micStatus');
    const statusText = document.getElementById('micStatusText');
    const recordBtn = document.getElementById('btnStartRecord');

    statusEl.className = 'mic-status';
    statusText.textContent = '正在请求麦克风权限...';

    this.micTestRecorder = new AudioRecorder({
      maxDuration: EXPERIMENT_CONFIG.experiment.micTestDuration * 1000,
      onTick: (remaining) => {
        document.getElementById('recordTimer').textContent = 
          `00:${String(remaining).padStart(2, '0')}`;
      },
      onStart: () => {
        recordBtn.classList.add('recording');
        recordBtn.innerHTML = '<span class="record-dot"></span> 录音中...';
        recordBtn.disabled = true;
        statusText.textContent = '正在录音，请对着麦克风说话...';
        document.getElementById('audio-visualizer-id')?.classList?.add('active');
      },
      onStop: (blob, url) => {
        recordBtn.classList.remove('recording');
        recordBtn.innerHTML = '<span class="record-dot"></span> 开始录音 (5秒)';
        recordBtn.disabled = true;
        
        // 显示回放
        const playback = document.getElementById('playbackSection');
        const audioPlayback = document.getElementById('audioPlayback');
        playback.style.display = 'block';
        audioPlayback.src = url;

        // 显示结果确认
        document.getElementById('micTestResult').style.display = 'flex';

        // 保存数据
        this.micTestAudio = { blob, url };
        
        DataCollector.setMicTest({
          passed: true,
          audioSize: blob.size,
        });

        statusText.textContent = '录音完成！请播放确认。';
      },
      onError: (error) => {
        statusText.textContent = error.message;
        statusEl.className = 'mic-status denied';
        this._showModal(error.message);
      },
      onVisualizer: (dataArray) => {
        this._updateVisualizer('audioVisualizer', dataArray);
      },
    });

    const granted = await this.micTestRecorder.requestPermission();

    if (granted) {
      statusEl.className = 'mic-status granted';
      statusText.textContent = '麦克风已就绪，请点击按钮开始测试';
      recordBtn.disabled = false;
    } else {
      statusEl.className = 'mic-status denied';
      statusText.textContent = '麦克风权限未授权，无法继续实验';
    }
  },

  _startMicTest() {
    if (this.micTestRecorder) {
      document.getElementById('micTestResult').style.display = 'none';
      document.getElementById('playbackSection').style.display = 'none';
      this.micTestRecorder.start();
    }
  },

  _resetMicTest() {
    document.getElementById('micTestResult').style.display = 'none';
    document.getElementById('playbackSection').style.display = 'none';
    document.getElementById('audioPlayback').src = '';
    document.getElementById('btnStartRecord').disabled = false;
    document.getElementById('recordTimer').textContent = '00:00';
    document.getElementById('micStatusText').textContent = '麦克风已就绪，请点击按钮开始测试';
    
    if (this.micTestRecorder) {
      this.micTestRecorder.destroy();
    }
    this.micTestAudio = null;
    this._initMicTest();
  },

  // ==========================================
  // Stage 3: 视频
  // ==========================================
  _initVideo() {
    const video = document.getElementById('scenarioVideo');
    const btn = document.getElementById('btnVideoContinue');
    
    // 设置视频源
    video.src = EXPERIMENT_CONFIG.scenario.videoSrc;
    video.load();
    
    btn.style.display = EXPERIMENT_CONFIG.experiment.allowSkipVideo ? 'flex' : 'none';

    // 视频加载失败处理
    video.addEventListener('error', () => {
      console.warn('[Experiment] 视频加载失败，显示继续按钮');
      btn.style.display = 'flex';
      DataCollector.logVideoSkipped();
    });
  },

  // ==========================================
  // Stage 4: 选择题
  // ==========================================
  _renderChoices() {
    const questionBlock = document.getElementById('questionBlock');
    const questions = EXPERIMENT_CONFIG.scenario.questions;
    
    // 情景描述
    document.getElementById('scenarioContext').innerHTML = 
      `<p>${EXPERIMENT_CONFIG.scenario.description}</p>`;

    let html = '';
    questions.forEach((q, qi) => {
      html += `<div class="question-item">`;
      html += `<p class="question-stem">${qi + 1}. ${q.stem}</p>`;
      html += `<ul class="option-list">`;
      
      q.options.forEach((opt) => {
        html += `
          <li class="option-item">
            <label class="option-label" data-q="${q.id}" data-v="${opt.value}">
              <input type="radio" name="${q.id}" value="${opt.value}">
              ${opt.label}
            </label>
          </li>`;
      });
      
      html += `</ul></div>`;
    });

    questionBlock.innerHTML = html;

    // 绑定选择事件
    const optionLabels = questionBlock.querySelectorAll('.option-label');
    optionLabels.forEach(label => {
      label.addEventListener('click', function() {
        // 取消同组其他选项的选中样式
        const name = this.querySelector('input').name;
        questionBlock.querySelectorAll(`input[name="${name}"]`).forEach(inp => {
          inp.closest('.option-label').classList.remove('selected');
        });
        // 选中当前
        this.classList.add('selected');
        this.querySelector('input').checked = true;
        
        // 检查是否所有题目都已作答
        Experiment._checkAllQuestionsAnswered();
      });
    });
  },

  _checkAllQuestionsAnswered() {
    const questions = EXPERIMENT_CONFIG.scenario.questions;
    let allAnswered = true;
    
    questions.forEach(q => {
      const checked = document.querySelector(`input[name="${q.id}"]:checked`);
      if (!checked) allAnswered = false;
    });

    document.getElementById('btnSubmitChoices').disabled = !allAnswered;
  },

  _collectChoices() {
    const questions = EXPERIMENT_CONFIG.scenario.questions;
    const results = [];
    
    questions.forEach(q => {
      const checked = document.querySelector(`input[name="${q.id}"]:checked`);
      results.push({
        questionId: q.id,
        questionStem: q.stem,
        selectedValue: checked ? checked.value : null,
        selectedLabel: checked 
          ? checked.closest('.option-label').textContent.trim() 
          : null,
      });
    });

    DataCollector.setChoices(results);
  },

  // ==========================================
  // Stage 5: 语音回答
  // ==========================================
  _initVoiceStage() {
    // 设置语音问题
    document.getElementById('voiceQuestion').innerHTML = 
      `<p class="question-text">${EXPERIMENT_CONFIG.scenario.voiceQuestion}</p>`;

    const btn = document.getElementById('btnVoiceRecord');
    btn.disabled = false;
    btn.innerHTML = '<span class="record-dot"></span> 开始录音 (10秒)';
    btn.classList.remove('recording');

    document.getElementById('voiceTimer').textContent = '00:00';
    document.getElementById('voicePlayback').style.display = 'none';
    document.getElementById('voiceActions').style.display = 'none';
    document.getElementById('voiceMicStatusText').textContent = '准备录音';

    this.voiceRecorder = new AudioRecorder({
      maxDuration: EXPERIMENT_CONFIG.experiment.voiceAnswerDuration * 1000,
      onTick: (remaining) => {
        document.getElementById('voiceTimer').textContent = 
          `00:${String(remaining).padStart(2, '0')}`;
      },
      onStart: () => {
        btn.classList.add('recording');
        btn.innerHTML = '<span class="record-dot"></span> 录音中...';
        btn.disabled = true;
        document.getElementById('voiceMicStatusText').textContent = '正在录音...';
      },
      onStop: (blob, url) => {
        btn.classList.remove('recording');
        btn.innerHTML = '<span class="record-dot"></span> 开始录音 (10秒)';
        btn.disabled = true;
        
        // 显示回放
        document.getElementById('voicePlayback').style.display = 'block';
        document.getElementById('voicePlaybackAudio').src = url;

        // 显示操作按钮
        document.getElementById('voiceActions').style.display = 'flex';
        document.getElementById('voiceMicStatusText').textContent = '录音完成，请确认或重新录制';

        this.voiceAudio = { blob, url };
      },
      onError: (error) => {
        document.getElementById('voiceMicStatusText').textContent = error.message;
        this._showModal(error.message);
      },
      onVisualizer: (dataArray) => {
        this._updateVisualizer('voiceVisualizer', dataArray);
      },
    });

    // 复用已有麦克风权限
    this.voiceRecorder.stream = this.micTestRecorder?.stream || null;
    this.voiceRecorder.micPermission = 'granted';
    this.voiceRecorder.isSupported = true;
  },

  _startVoiceRecord() {
    // 如果没有 stream，先请求权限
    if (!this.voiceRecorder.stream) {
      this.voiceRecorder.requestPermission().then(granted => {
        if (granted) this.voiceRecorder.start();
      });
    } else {
      this.voiceRecorder.start();
    }
  },

  _resetVoiceRecord() {
    document.getElementById('voicePlayback').style.display = 'none';
    document.getElementById('voiceActions').style.display = 'none';
    document.getElementById('voicePlaybackAudio').src = '';
    
    const btn = document.getElementById('btnVoiceRecord');
    btn.disabled = false;
    btn.classList.remove('recording');
    btn.innerHTML = '<span class="record-dot"></span> 开始录音 (10秒)';
    document.getElementById('voiceTimer').textContent = '00:00';
    document.getElementById('voiceMicStatusText').textContent = '准备录音';

    if (this.voiceRecorder) {
      this.voiceRecorder.destroy();
    }
    this.voiceAudio = null;
    this._initVoiceStage();
  },

  // ==========================================
  // Stage 6: 完成页
  // ==========================================
  async _handleComplete() {
    // 保存语音数据
    if (this.voiceAudio) {
      const base64 = await this._blobToBase64(this.voiceAudio.blob);
      DataCollector.setVoiceAnswer({
        audioBase64: base64,
        audioSize: this.voiceAudio.blob.size,
        duration: EXPERIMENT_CONFIG.experiment.voiceAnswerDuration,
      });
    }

    const statusText = document.getElementById('uploadStatusText');
    const spinner = document.getElementById('uploadSpinner');
    const resultEl = document.getElementById('uploadResult');
    const downloadEl = document.getElementById('dataDownload');

    // 上传数据
    statusText.textContent = '正在上传数据到服务器...';
    spinner.style.display = 'block';

    const result = await DataCollector.upload();

    spinner.style.display = 'none';
    resultEl.style.display = 'block';

    if (result.success) {
      resultEl.className = 'upload-result success';
      resultEl.innerHTML = '<p>✅ 数据上传成功！感谢您的参与。</p>';
      document.getElementById('uploadStatusText').textContent = '上传完成';
    } else if (result.local) {
      resultEl.className = 'upload-result local';
      resultEl.innerHTML = '<p>⚠️ 云端未配置，数据仅保存在本地。请点击下方按钮下载数据。</p>';
      document.getElementById('uploadStatusText').textContent = '使用本地存储模式';
      downloadEl.style.display = 'block';
    } else {
      resultEl.className = 'upload-result error';
      resultEl.innerHTML = `<p>❌ 上传失败：${result.error || '未知错误'}</p>
        <p>数据已保存在本地，请点击下方按钮下载。</p>`;
      document.getElementById('uploadStatusText').textContent = '上传失败';
      downloadEl.style.display = 'block';
    }

    // 总是显示下载按钮作为备份
    if (EXPERIMENT_CONFIG.experiment.localStorageBackup) {
      downloadEl.style.display = 'block';
    }
  },

  // ==========================================
  // 工具方法
  // ==========================================

  /**
   * 更新音频可视化器
   * @param {string} containerId
   * @param {Uint8Array} dataArray
   */
  _updateVisualizer(containerId, dataArray) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const bars = container.querySelectorAll('.visualizer-bar');
    if (bars.length === 0) return;

    // 采样 dataArray 以匹配 bar 数量
    const step = Math.floor(dataArray.length / bars.length);
    bars.forEach((bar, i) => {
      const value = dataArray[i * step] || 0;
      // 映射 0-255 到 0-100%
      const height = Math.max(2, (value / 255) * 100);
      bar.style.height = `${height}%`;
    });
  },

  /**
   * Blob 转 Base64
   * @param {Blob} blob
   * @returns {Promise<string>}
   */
  _blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  },

  /**
   * 显示模态弹窗
   * @param {string} message - HTML 内容
   */
  _showModal(message) {
    document.getElementById('modalBody').innerHTML = message;
    document.getElementById('modalOverlay').style.display = 'flex';
  },
};
