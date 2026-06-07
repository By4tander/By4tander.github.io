/**
 * ============================================================
 * 实验流程控制器 v3.0 - 双视频串联 + 视频控制 + 退回选题
 * ============================================================
 * 流程: 知情同意 → 麦克风测试 → 被试编号 → 全屏影院
 * 影院内: scenario1 → 选题 → 语音 → scenario2 → 完成
 * ============================================================
 */

const Experiment = {
  currentStage: 0,
  stages: ['consent', 'mic-test', 'subject-id', 'cinema', 'complete'],

  micTestRecorder: null,
  voiceRecorder: null,
  micTestAudio: null,
  voiceAudio: null,

  // 双视频状态
  _videoIndex: 0,             // 当前播放到第几个视频
  _videoSequence: [],         // 视频键名序列
  _videoPlaying: true,        // 视频是否在播放
  _choicesSubmitted: false,   // 选题是否已提交
  _currentQuestionIndex: 0,
  _previewOptionIndex: 0,
  _choiceAnswers: {},
  _isPreviewingOptions: false,

  init() {
    DataCollector.reset();
    this._bindEvents();
    this._checkBrowser();

    if (EXPERIMENT_CONFIG.experiment.debugMode) {
      // 调试模式：跳过伦理、麦克风、被试编号，直接进影院
      DataCollector.setConsent();
      DataCollector.setSubjectId('DEBUG_' + Date.now().toString(36));
      // 静默获取麦克风权限（影院内语音录制需要）
      this.micTestRecorder = new AudioRecorder({ manualMode: true, maxDuration: 30000 });
      this.micTestRecorder.requestPermission().then(() => {
        this._showStage(3);
      });
    } else {
      this._showStage(0);  // 正常流程：知情同意开始
    }
  },

  _checkBrowser() {
    const tr = new AudioRecorder({ maxDuration: 1000 });
    if (!tr.isSupported) {
      this._showModal('您的浏览器不支持录音功能，请使用最新版 Chrome、Edge 或 Firefox。');
    }
  },

  // ==================== 事件绑定 ====================

  _bindEvents() {
    // ---- 知情同意 ----
    const cb = document.getElementById('consentCheckbox');
    cb.addEventListener('change', () => {
      const ok = cb.checked;
      document.getElementById('btnConsentNext').disabled = !ok;
      document.getElementById('consentHint').style.display = ok ? 'none' : 'block';
    });
    document.getElementById('btnConsentNext').addEventListener('click', () => {
      DataCollector.setConsent();
      this._showStage(1);
    });

    // ---- 麦克风测试 ----
    document.getElementById('btnStartRecord').addEventListener('click', () => {
      if (!this.micTestRecorder) return;
      if (this.micTestRecorder.isRecording) {
        this.micTestRecorder.stop();
      } else {
        this.micTestRecorder.start();
      }
    });
    document.getElementById('btnMicOK').addEventListener('click', () => this._showStage(2));
    document.getElementById('btnMicRetry').addEventListener('click', () => this._resetMicTest());
    document.getElementById('btnDownloadMicTest').addEventListener('click', () => {
      if (this.micTestAudio?.blob) this._downloadBlob(this.micTestAudio.blob, 'mic-test.webm');
    });

    // ---- 被试编号 ----
    const subj = document.getElementById('subjectId');
    subj.addEventListener('input', () => {
      document.getElementById('btnStartExperiment').disabled = !subj.value.trim();
    });
    document.getElementById('btnStartExperiment').addEventListener('click', () => {
      DataCollector.setSubjectId(subj.value.trim());
      this._showStage(3);
    });

    // ---- 视频控制 ----
    document.getElementById('btnCinemaToggle').addEventListener('click', () => this._toggleVideoPlay());
    document.getElementById('btnCinemaBack').addEventListener('click', () => this._seekVideo(-10));
    document.getElementById('btnCinemaFwd').addEventListener('click', () => this._seekVideo(10));

    // ---- 影院：选题提交 ----
    document.getElementById('btnCinemaSubmit').addEventListener('click', () => {
      this._advanceCinemaQuestion();
    });

    // ---- 影院：语音录制 ----
    document.getElementById('btnCinemaRecord').addEventListener('click', () => {
      if (!this.voiceRecorder) return;
      if (this.voiceRecorder.isRecording) {
        this.voiceRecorder.stop();
      } else {
        this.voiceRecorder.start();
      }
    });

    // 确认语音 → 播放 scenario2
    document.getElementById('btnCinemaVoiceOK').addEventListener('click', () => {
      // 保存语音数据
      if (this.voiceAudio) {
        const dur = this.voiceAudio.duration || 0;
        DataCollector.setVoiceAnswer({
          audioSize: this.voiceAudio.blob.size,
          duration: dur,
        });
      }
      this._hideOverlay('voice');
      this._playNextVideo();
    });

    // 重新录制
    document.getElementById('btnCinemaVoiceRetry').addEventListener('click', () => this._resetCinemaVoice());

    // 退回修改选项
    document.getElementById('btnCinemaBackToChoice').addEventListener('click', () => {
      this._hideOverlay('voice');
      if (this.voiceRecorder) this.voiceRecorder.destroy();
      this.voiceAudio = null;
      this._showOverlay('choice');
    });

    // ---- 完成页 ----
    document.getElementById('btnDownloadData').addEventListener('click', () => DataCollector.download());
    document.getElementById('btnDownloadVoiceAudio').addEventListener('click', () => {
      if (this.voiceAudio?.blob) this._downloadBlob(this.voiceAudio.blob, `voice-${DataCollector.session.subjectId}.webm`);
    });
    document.getElementById('btnDownloadMicAudio').addEventListener('click', () => {
      if (this.micTestAudio?.blob) this._downloadBlob(this.micTestAudio.blob, `mic-test-${DataCollector.session.subjectId}.webm`);
    });

    // ---- 模态弹窗 ----
    document.getElementById('btnModalClose').addEventListener('click', () => {
      document.getElementById('modalOverlay').style.display = 'none';
    });

    // ---- 影院跳过 ----
    document.getElementById('btnCinemaSkip').addEventListener('click', () => this._skipCinemaCurrent());
  },

  // ==================== 阶段切换 ====================

  _showStage(index) {
    document.querySelectorAll('.stage').forEach(el => el.classList.remove('active'));
    const stageId = this.stages[index];
    const el = document.getElementById(`stage-${stageId}`);
    if (el) el.classList.add('active');
    this._updateProgress(index);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.currentStage = index;
    this._onStageEnter(stageId);
  },

  _updateProgress(index) {
    const total = this.stages.length - 1;
    const pct = Math.round((index / total) * 100);
    document.getElementById('progressFill').style.width = `${pct}%`;
    document.getElementById('progressText').textContent = `步骤 ${index}/${total}`;
  },

  _onStageEnter(stageId) {
    switch (stageId) {
      case 'mic-test': this._initMicTest(); break;
      case 'cinema': this._enterCinema(); break;
      case 'complete': this._handleComplete(); break;
    }
  },

  // ==================== 麦克风测试 ====================

  async _initMicTest() {
    const se = document.getElementById('micStatus');
    const st = document.getElementById('micStatusText');
    const btn = document.getElementById('btnStartRecord');
    se.className = 'mic-status'; st.textContent = '正在请求麦克风权限...';

    this.micTestRecorder = new AudioRecorder({
      manualMode: true,
      maxDuration: 30000,
      onTick: (sec) => {
        document.getElementById('recordTimer').textContent = `00:${String(sec).padStart(2, '0')}`;
      },
      onStart: () => {
        btn.classList.add('recording');
        btn.innerHTML = '<span class="record-dot"></span> 点击停止录音';
        st.textContent = '正在录音，请对着麦克风说话...';
      },
      onStop: (blob, url, dur) => {
        btn.classList.remove('recording');
        btn.innerHTML = '<span class="record-dot"></span> 开始录音';
        btn.disabled = false;
        document.getElementById('playbackSection').style.display = 'block';
        document.getElementById('audioPlayback').src = url;
        document.getElementById('micTestResult').style.display = 'flex';
        document.getElementById('btnDownloadMicTest').style.display = 'inline-flex';
        this.micTestAudio = { blob, url };
        DataCollector.setMicTest({ passed: true, audioSize: blob.size, duration: dur });
        st.textContent = `录音完成（${dur}秒），请播放确认。`;
      },
      onError: (err) => {
        st.textContent = err.message; se.className = 'mic-status denied';
        this._showModal(err.message);
      },
      onVisualizer: (data) => this._updateVisualizer('audioVisualizer', data),
    });

    const ok = await this.micTestRecorder.requestPermission();
    if (ok) {
      se.className = 'mic-status granted';
      st.textContent = '麦克风已就绪，点击按钮开始，再次点击停止';
      btn.disabled = false;
    } else {
      se.className = 'mic-status denied';
      st.textContent = '麦克风权限未授权，无法继续实验';
    }
  },

  _resetMicTest() {
    ['micTestResult','playbackSection'].forEach(id => {
      document.getElementById(id).style.display = 'none';
    });
    document.getElementById('audioPlayback').src = '';
    document.getElementById('btnDownloadMicTest').style.display = 'none';
    document.getElementById('recordTimer').textContent = '00:00';
    const btn = document.getElementById('btnStartRecord');
    btn.disabled = false; btn.classList.remove('recording');
    btn.innerHTML = '<span class="record-dot"></span> 开始录音';
    if (this.micTestRecorder) this.micTestRecorder.destroy();
    this.micTestAudio = null;
    this._initMicTest();
  },

  // ==================== 影院入口 ====================

  _enterCinema() {
    const overlay = document.getElementById('cinemaOverlay');
    const video = document.getElementById('cinemaVideo');
    const cfg = EXPERIMENT_CONFIG.scenario;

    // 初始化视频序列
    this._videoIndex = 0;
    this._videoSequence = cfg.videoSequence || ['scenario1'];
    this._videoPlaying = true;
    this._choicesSubmitted = false;
    this._currentQuestionIndex = 0;
    this._previewOptionIndex = 0;
    this._choiceAnswers = {};
    this._isPreviewingOptions = false;

    // 隐藏进度条和主容器
    document.getElementById('progressBar').style.display = 'none';
    document.getElementById('mainContainer').style.display = 'none';

    // 显示影院
    overlay.style.display = 'block';
    requestAnimationFrame(() => overlay.classList.add('active'));

    // 显示视频控制
    document.getElementById('cinemaControls').classList.add('visible');

    this._hideAllOverlays();
    this._loadVideoByIndex(0);

    // 统一视频结束监听
    this._bindVideoEnded();
  },

  /**
   * 加载并播放序列中的视频
   */
  _loadVideoByIndex(index) {
    const video = document.getElementById('cinemaVideo');
    const cfg = EXPERIMENT_CONFIG.scenario;
    const key = this._videoSequence[index];
    const src = cfg.videos[key];
    if (!src) {
      console.warn('[Cinema] 视频未找到:', key);
      if (index === 0) this._showOverlay('choice');
      else this._exitCinema();
      return;
    }
    this._videoIndex = index;
    this._videoPlaying = true;

    video.src = src;
    video.load();
    video.play().catch(e => {
      console.warn('[Cinema] 自动播放失败:', e);
    });

    // 更新跳过按钮
    document.getElementById('btnCinemaSkip').style.display =
      EXPERIMENT_CONFIG.experiment.showSkipButton ? 'block' : 'none';
  },

  /**
   * 绑定视频结束事件（每次 loadVideo 后重新绑定）
   */
  _bindVideoEnded() {
    const video = document.getElementById('cinemaVideo');
    // 移除旧监听
    video.onended = null;
    
    video.onended = () => {
      this._videoPlaying = false;
      DataCollector.logVideoWatched();

      if (this._videoIndex === 0) {
        // scenario1 结束 → 弹出选题
        this._showOverlay('choice');
      } else {
        // scenario2（或更后）结束 → 完成
        this._showOverlay('complete-transition');
        setTimeout(() => this._exitCinema(), 1500);
      }
    };

    video.onerror = () => {
      console.warn('[Cinema] 视频加载失败');
      if (this._videoIndex === 0) {
        this._showOverlay('choice');
      } else {
        this._showOverlay('complete-transition');
        setTimeout(() => this._exitCinema(), 1000);
      }
    };
  },

  /**
   * 播放下一个视频（选题+语音完成后调用）
   */
  _playNextVideo() {
    const nextIdx = this._videoIndex + 1;
    if (nextIdx < this._videoSequence.length) {
      this._loadVideoByIndex(nextIdx);
      this._bindVideoEnded();
    } else {
      this._exitCinema();
    }
  },

  _exitCinema() {
    const overlay = document.getElementById('cinemaOverlay');
    overlay.classList.remove('active');
    setTimeout(() => {
      overlay.style.display = 'none';
      document.getElementById('cinemaVideo').pause();
      document.getElementById('cinemaVideo').onended = null;
      document.getElementById('cinemaControls').classList.remove('visible');
      document.getElementById('progressBar').style.display = 'block';
      document.getElementById('mainContainer').style.display = 'block';
      this._showStage(4);
    }, 300);
  },

  // ==================== 视频控制 ====================

  _toggleVideoPlay() {
    const video = document.getElementById('cinemaVideo');
    if (video.paused) {
      video.play();
      this._videoPlaying = true;
    } else {
      video.pause();
      this._videoPlaying = false;
    }
  },

  _seekVideo(seconds) {
    const video = document.getElementById('cinemaVideo');
    // 确保视频时长有效再跳转，避免 currentTime 变成 NaN 导致重播
    if (!video.duration || !isFinite(video.duration)) return;
    const target = video.currentTime + seconds;
    video.currentTime = Math.max(0, Math.min(video.duration, target));
  },

  // ==================== 浮层控制 ====================

  _showOverlay(name) {
    this._hideAllOverlays();
    const el = document.getElementById(name + 'Overlay');
    if (el) {
      el.style.display = 'flex';
      requestAnimationFrame(() => el.classList.add('visible'));
    }
    if (name === 'choice') this._renderCinemaChoices();
    if (name === 'voice') this._initCinemaVoice();
  },

  _hideOverlay(name) {
    const el = document.getElementById(name + 'Overlay');
    if (el) {
      el.classList.remove('visible');
      setTimeout(() => { el.style.display = 'none'; }, 6100);
    }
  },

  _hideAllOverlays() {
    ['choice', 'voice', 'complete-transition'].forEach(name => {
      const el = document.getElementById(name + 'Overlay');
      if (el) { el.classList.remove('visible'); el.style.display = 'none'; }
    });
  },

  // ==================== 选择题 ====================

  _renderCinemaChoices() {
    const block = document.getElementById('cinemaQuestionBlock');
    const questions = EXPERIMENT_CONFIG.scenario.questions;
    const q = questions[this._currentQuestionIndex];
    if (!q) {
      this._collectCinemaChoices();
      this._choicesSubmitted = true;
      this._hideOverlay('choice');
      this._showOverlay('voice');
      return;
    }

    const selected = this._choiceAnswers[q.id]?.selectedValue || '';
    const total = questions.length;
    block.innerHTML = `
      <div class="immersive-question-shell">
        <div class="question-progress">问题 ${this._currentQuestionIndex + 1}/${total}</div>
        <p class="immersive-question-stem">${q.stem}</p>
        <div class="option-preview-status" id="optionPreviewStatus">正在播放选项视频...</div>
        <div class="immersive-option-grid" id="immersiveOptionGrid"></div>
      </div>
    `;

    document.getElementById('btnCinemaSubmit').disabled = !selected;
    document.getElementById('btnCinemaSubmit').textContent =
      this._currentQuestionIndex === total - 1 ? '确认选择并进入语音回答' : '确认选择并进入下一题';

    this._previewOptionIndex = 0;
    this._isPreviewingOptions = true;
    this._renderOptionCards(q);
    this._playCurrentOptionPreview();
  },

  _renderOptionCards(question) {
    const grid = document.getElementById('immersiveOptionGrid');
    if (!grid) return;
    const selected = this._choiceAnswers[question.id]?.selectedValue || '';
    grid.innerHTML = '';

    question.options.forEach((opt, index) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'immersive-option-card';
      card.dataset.q = question.id;
      card.dataset.v = opt.value;
      card.disabled = this._isPreviewingOptions;
      if (selected === opt.value) card.classList.add('selected');
      if (index >= this._previewOptionIndex) card.classList.add('pending');

      const media = opt.video
        ? `<video muted playsinline preload="metadata" src="${opt.video}"></video>`
        : `<div class="option-video-missing">无视频</div>`;
      card.innerHTML = `
        <div class="option-media">${media}</div>
        <div class="option-caption">
          <span class="option-letter">${opt.value}</span>
          <span class="option-label-text">${opt.label}</span>
        </div>
      `;
      card.addEventListener('click', () => this._selectCinemaOption(question, opt));
      grid.appendChild(card);
    });
  },

  _playCurrentOptionPreview() {
    const questions = EXPERIMENT_CONFIG.scenario.questions;
    const question = questions[this._currentQuestionIndex];
    const option = question?.options[this._previewOptionIndex];
    const video = document.getElementById('cinemaVideo');
    const status = document.getElementById('optionPreviewStatus');
    const cards = document.querySelectorAll('.immersive-option-card');
    const choiceOverlay = document.getElementById('choiceOverlay');

    if (!question || !option) {
      this._finishOptionPreviews(question);
      return;
    }

    choiceOverlay?.classList.add('preview-playing');

    cards.forEach((card, index) => {
      card.classList.toggle('previewing', index === this._previewOptionIndex);
      card.classList.toggle('pending', index >= this._previewOptionIndex);
    });

    if (status) status.textContent = `正在全屏播放选项 ${option.value}，请沉浸理解该选择`;
    video.classList.add('option-preview-video');
    video.src = option.video || '';
    video.load();
    video.play().catch(e => {
      console.warn('[Cinema] 选项视频自动播放失败:', e);
      this._finishOneOptionPreview();
    });

    video.onended = () => this._finishOneOptionPreview();
    video.onerror = () => this._finishOneOptionPreview();
  },

  _finishOneOptionPreview() {
    const question = EXPERIMENT_CONFIG.scenario.questions[this._currentQuestionIndex];
    const option = question?.options[this._previewOptionIndex];
    const card = document.querySelector(`.immersive-option-card[data-v="${option?.value}"]`);
    const thumb = card?.querySelector('video');
    const mainVideo = document.getElementById('cinemaVideo');
    const choiceOverlay = document.getElementById('choiceOverlay');

    choiceOverlay?.classList.remove('preview-playing');

    DataCollector.logEvent('option_video_watched', {
      questionId: question?.id,
      optionValue: option?.value,
      video: option?.video || null,
    });

    if (thumb && option?.video) {
      thumb.src = option.video;
      thumb.currentTime = 0;
    }
    if (card) {
      card.classList.remove('pending', 'previewing');
      card.classList.add('ready', 'arrived');
    }

    this._previewOptionIndex += 1;
    if (question && this._previewOptionIndex < question.options.length) {
      window.setTimeout(() => this._playCurrentOptionPreview(), 850);
    } else {
      mainVideo.pause();
      mainVideo.onended = null;
      mainVideo.onerror = null;
      mainVideo.removeAttribute('src');
      mainVideo.load();
      this._finishOptionPreviews(question);
    }
  },

  _finishOptionPreviews(question) {
    this._isPreviewingOptions = false;
    document.getElementById('choiceOverlay')?.classList.remove('preview-playing');
    document.getElementById('cinemaVideo').classList.remove('option-preview-video');
    const status = document.getElementById('optionPreviewStatus');
    if (status) status.textContent = '四个选项视频已播放完毕，请选择最符合你的选项';

    document.querySelectorAll('.immersive-option-card').forEach(card => {
      card.disabled = false;
      card.classList.remove('pending', 'previewing');
      card.classList.add('ready');
    });

    const selected = question && this._choiceAnswers[question.id]?.selectedValue;
    document.getElementById('btnCinemaSubmit').disabled = !selected;
  },

  _selectCinemaOption(question, option) {
    if (this._isPreviewingOptions) return;
    this._choiceAnswers[question.id] = {
      questionId: question.id,
      questionStem: question.stem,
      selectedValue: option.value,
      selectedLabel: option.label,
      selectedVideo: option.video || null,
    };

    document.querySelectorAll('.immersive-option-card').forEach(card => {
      card.classList.toggle('selected', card.dataset.v === option.value);
    });
    document.getElementById('btnCinemaSubmit').disabled = false;
  },

  _advanceCinemaQuestion() {
    const questions = EXPERIMENT_CONFIG.scenario.questions;
    const current = questions[this._currentQuestionIndex];
    if (!current || !this._choiceAnswers[current.id]) return;

    if (this._currentQuestionIndex < questions.length - 1) {
      this._currentQuestionIndex += 1;
      this._renderCinemaChoices();
      return;
    }

    this._collectCinemaChoices();
    this._choicesSubmitted = true;
    this._hideOverlay('choice');
    this._showOverlay('voice');
  },

  _collectCinemaChoices() {
    const results = EXPERIMENT_CONFIG.scenario.questions.map(q => (
      this._choiceAnswers[q.id] || {
        questionId: q.id,
        questionStem: q.stem,
        selectedValue: null,
        selectedLabel: null,
        selectedVideo: null,
      }
    ));
    DataCollector.setChoices(results);
  },

  // ==================== 语音录制可视化 ====================

  _initCinemaVoice() {
    document.getElementById('cinemaVoiceQuestion').textContent =
      EXPERIMENT_CONFIG.scenario.voiceQuestion;

    const btn = document.getElementById('btnCinemaRecord');
    btn.disabled = false;
    btn.classList.remove('recording');
    btn.innerHTML = '<span class="record-dot"></span> 点击开始录音';
    document.getElementById('cinemaTimer').textContent = '00:00';
    document.getElementById('cinemaPlayback').style.display = 'none';
    document.getElementById('cinemaVoiceActions').style.display = 'none';

    this.voiceRecorder = new AudioRecorder({
      manualMode: true,
      maxDuration: 120000,
      onTick: (sec) => {
        document.getElementById('cinemaTimer').textContent = `00:${String(sec).padStart(2, '0')}`;
      },
      onStart: () => {
        btn.classList.add('recording');
        btn.innerHTML = '<span class="record-dot"></span> 录音中，点击停止';
      },
      onStop: (blob, url, dur) => {
        btn.classList.remove('recording');
        btn.innerHTML = '<span class="record-dot"></span> 点击开始录音';
        btn.disabled = false;
        document.getElementById('cinemaPlayback').style.display = 'block';
        document.getElementById('cinemaPlaybackAudio').src = url;
        document.getElementById('cinemaVoiceActions').style.display = 'flex';
        this.voiceAudio = { blob, url, duration: dur };
      },
      onError: (err) => this._showModal(err.message),
      onVisualizer: (data) => this._updateVisualizer('cinemaVisualizer', data),
    });

    // 复用已有 stream 并正确初始化 AudioContext/Analyser（修复可视化bug）
    if (this.micTestRecorder?.stream) {
      this.voiceRecorder.stream = this.micTestRecorder.stream;
      this.voiceRecorder.micPermission = 'granted';
      this.voiceRecorder.isSupported = true;
      // ★ 关键修复：从已有 stream 新建 AudioContext + Analyser
      this.voiceRecorder.initAnalyserFromStream();
    }
  },

  _resetCinemaVoice() {
    document.getElementById('cinemaPlayback').style.display = 'none';
    document.getElementById('cinemaVoiceActions').style.display = 'none';
    document.getElementById('cinemaPlaybackAudio').src = '';
    const btn = document.getElementById('btnCinemaRecord');
    btn.disabled = false; btn.classList.remove('recording');
    btn.innerHTML = '<span class="record-dot"></span> 点击开始录音';
    document.getElementById('cinemaTimer').textContent = '00:00';
    if (this.voiceRecorder) this.voiceRecorder.destroy();
    this.voiceAudio = null;
    this._initCinemaVoice();
  },

  _skipCinemaCurrent() {
    const choiceV = document.getElementById('choiceOverlay');
    const voiceV = document.getElementById('voiceOverlay');
    const video = document.getElementById('cinemaVideo');
    
    const choiceVisible = choiceV.style.display !== 'none' && choiceV.classList.contains('visible');
    const voiceVisible = voiceV.style.display !== 'none' && voiceV.classList.contains('visible');
    
    if (voiceVisible) {
      if (this.voiceRecorder?.isRecording) this.voiceRecorder.stop();
      this._hideOverlay('voice');
      this._playNextVideo();
    } else if (choiceVisible) {
      this._hideOverlay('choice');
      this._showOverlay('voice');
    } else {
      // 视频播放中 → 直接触发 video.onended 逻辑（不依赖 currentTime 跳转）
      video.pause();
      this._videoPlaying = false;
      DataCollector.logVideoWatched();
      if (this._videoIndex === 0) {
        this._showOverlay('choice');
      } else {
        this._showOverlay('complete-transition');
        setTimeout(() => this._exitCinema(), 1500);
      }
    }
  },

  // ==================== 完成页 ====================

  async _handleComplete() {
    // 语音数据已在 _initCinemaVoice → onStop 中通过 btnCinemaVoiceOK 保存
    const st = document.getElementById('uploadStatusText');
    const sp = document.getElementById('uploadSpinner');
    const re = document.getElementById('uploadResult');
    const dd = document.getElementById('dataDownload');

    st.textContent = '正在上传数据到服务器...'; sp.style.display = 'block';
    const result = await DataCollector.upload();
    sp.style.display = 'none'; re.style.display = 'block';

    if (result.success) {
      re.className = 'upload-result success';
      re.innerHTML = '<p>✅ 数据上传成功！感谢您的参与。</p>';
      st.textContent = '上传完成';
    } else if (result.local) {
      re.className = 'upload-result local';
      re.innerHTML = '<p>⚠️ 云端未配置，数据仅保存在本地。</p>';
      st.textContent = '本地存储模式';
    } else {
      re.className = 'upload-result error';
      re.innerHTML = `<p>❌ 上传失败：${result.error || '未知错误'}</p>`;
      st.textContent = '上传失败';
    }

    dd.style.display = 'block';
    document.getElementById('btnDownloadVoiceAudio').style.display =
      this.voiceAudio?.blob ? 'inline-flex' : 'none';
    document.getElementById('btnDownloadMicAudio').style.display =
      this.micTestAudio?.blob ? 'inline-flex' : 'none';
  },

  // ==================== 工具 ====================

  _updateVisualizer(containerId, dataArray) {
    const c = document.getElementById(containerId);
    if (!c) return;
    const bars = c.querySelectorAll('.visualizer-bar');
    if (!bars.length) return;
    const step = Math.floor(dataArray.length / bars.length);
    bars.forEach((bar, i) => {
      bar.style.height = `${Math.max(2, (dataArray[i * step] || 0) / 255 * 100)}%`;
    });
  },

  _blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  },

  _downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  _showModal(msg) {
    document.getElementById('modalBody').innerHTML = msg;
    document.getElementById('modalOverlay').style.display = 'flex';
  },
};
