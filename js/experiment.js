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

  init() {
    DataCollector.reset();
    this._bindEvents();
    this._showStage(0);
    this._checkBrowser();
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
      this._collectCinemaChoices();
      this._choicesSubmitted = true;
      this._hideOverlay('choice');
      this._showOverlay('voice');
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
    video.currentTime = Math.max(0, Math.min(video.duration || Infinity, video.currentTime + seconds));
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
      setTimeout(() => { el.style.display = 'none'; }, 400);
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
    let html = '';
    questions.forEach((q, qi) => {
      html += `<div class="question-item">`;
      html += `<p class="question-stem">${qi + 1}. ${q.stem}</p>`;
      html += `<ul class="option-list">`;
      q.options.forEach(opt => {
        html += `<li class="option-item">
          <label class="option-label" data-q="${q.id}" data-v="${opt.value}">
            <input type="radio" name="${q.id}" value="${opt.value}"> ${opt.label}
          </label></li>`;
      });
      html += `</ul></div>`;
    });
    block.innerHTML = html;

    block.querySelectorAll('.option-label').forEach(label => {
      label.addEventListener('click', function() {
        const name = this.querySelector('input').name;
        block.querySelectorAll(`input[name="${name}"]`).forEach(inp => {
          inp.closest('.option-label').classList.remove('selected');
        });
        this.classList.add('selected');
        this.querySelector('input').checked = true;
        Experiment._checkCinemaAllAnswered();
      });
    });
  },

  _checkCinemaAllAnswered() {
    let all = true;
    EXPERIMENT_CONFIG.scenario.questions.forEach(q => {
      if (!document.querySelector(`input[name="${q.id}"]:checked`)) all = false;
    });
    document.getElementById('btnCinemaSubmit').disabled = !all;
  },

  _collectCinemaChoices() {
    const results = [];
    EXPERIMENT_CONFIG.scenario.questions.forEach(q => {
      const chk = document.querySelector(`input[name="${q.id}"]:checked`);
      results.push({
        questionId: q.id, questionStem: q.stem,
        selectedValue: chk?.value || null,
        selectedLabel: chk ? chk.closest('.option-label').textContent.trim() : null,
      });
    });
    DataCollector.setChoices(results);
  },

  // ==================== 语音录制（修复可视化） ====================

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
    
    // 判断当前状态
    const choiceVisible = choiceV.style.display !== 'none' && choiceV.classList.contains('visible');
    const voiceVisible = voiceV.style.display !== 'none' && voiceV.classList.contains('visible');
    
    if (voiceVisible) {
      // 语音阶段 → 直接进入下一视频或完成
      if (this.voiceRecorder?.isRecording) this.voiceRecorder.stop();
      this._hideOverlay('voice');
      this._playNextVideo();
    } else if (choiceVisible) {
      // 选题阶段 → 跳到语音
      this._hideOverlay('choice');
      this._showOverlay('voice');
    } else {
      // 视频播放中（无浮层）→ 快进到视频末尾触发 ended 事件
      if (video.duration && isFinite(video.duration)) {
        video.currentTime = video.duration - 0.1;
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
