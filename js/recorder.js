/**
 * ============================================================
 * 音频录制模块 - 基于 MediaRecorder API
 * ============================================================
 * 兼容 Chrome 49+, Edge 79+, Firefox 25+
 * 支持两种模式：
 *   manualMode=false → 固定时长倒计时自动停止
 *   manualMode=true  → 被试自主点击开始/结束（计时正数）
 * ============================================================
 */

class AudioRecorder {
  constructor(options = {}) {
    this.maxDuration = options.maxDuration || 120000;   // 安全上限(ms)
    this.manualMode = options.manualMode || false;       // true=手动启停
    this.mimeType = options.mimeType || 'audio/webm;codecs=opus';
    this.onTick = options.onTick || (() => {});           // 每秒回调(秒数)
    this.onStart = options.onStart || (() => {});         // 开始录音回调
    this.onStop = options.onStop || (() => {});           // 停止录音回调(blob, url, durationSec)
    this.onError = options.onError || (() => {});         // 错误回调
    this.onVisualizer = options.onVisualizer || (() => {});

    this.stream = null;
    this.mediaRecorder = null;
    this.audioContext = null;
    this.analyser = null;
    this.chunks = [];
    this.audioBlob = null;
    this.audioUrl = null;
    this.timerInterval = null;
    this.visInterval = null;
    this.startTime = 0;
    this.isRecording = false;
    this.isSupported = false;
    this.micPermission = 'prompt';
    this._recordDuration = 0;  // 实际录制秒数

    this._checkSupport();
  }

  _checkSupport() {
    this.isSupported = !!(
      navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia &&
      (window.MediaRecorder || window.webkitMediaRecorder)
    );
    if (this.isSupported) {
      const Recorder = window.MediaRecorder || window.webkitMediaRecorder;
      if (!Recorder.isTypeSupported(this.mimeType)) {
        if (Recorder.isTypeSupported('audio/webm')) this.mimeType = 'audio/webm';
        else if (Recorder.isTypeSupported('audio/ogg;codecs=opus')) this.mimeType = 'audio/ogg;codecs=opus';
        else if (Recorder.isTypeSupported('audio/mp4')) this.mimeType = 'audio/mp4';
        else this.mimeType = '';
      }
    }
  }

  async requestPermission() {
    if (!this.isSupported) {
      this.micPermission = 'denied';
      this.onError({ type: 'not_supported', message: '浏览器不支持录音，请使用 Chrome、Edge 或 Firefox。' });
      return false;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 },
        video: false,
      });
      this.micPermission = 'granted';
      try {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 256;
        const source = this.audioContext.createMediaStreamSource(this.stream);
        source.connect(this.analyser);
      } catch (e) { /* 可视化不可用，忽略 */ }
      return true;
    } catch (error) {
      this.micPermission = 'denied';
      let msg = '无法访问麦克风。';
      if (error.name === 'NotAllowedError') msg = '麦克风权限被拒绝，请在浏览器设置中允许后重试。';
      else if (error.name === 'NotFoundError') msg = '未检测到麦克风设备。';
      else if (error.name === 'NotReadableError') msg = '麦克风被其他应用占用。';
      this.onError({ type: 'permission', message: msg, originalError: error });
      return false;
    }
  }

  /**
   * 开始录音
   */
  start() {
    if (!this.stream || this.isRecording) return false;
    const Recorder = window.MediaRecorder || window.webkitMediaRecorder;
    const options = this.mimeType ? { mimeType: this.mimeType } : {};
    try { this.mediaRecorder = new Recorder(this.stream, options); }
    catch (e) {
      try { this.mediaRecorder = new Recorder(this.stream); }
      catch (e2) {
        this.onError({ type: 'recorder_create', message: '无法创建录音器' });
        return false;
      }
    }

    this.chunks = [];
    this.isRecording = true;
    this.startTime = Date.now();
    this._recordDuration = 0;

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) this.chunks.push(event.data);
    };

    this.mediaRecorder.onstop = () => {
      this.isRecording = false;
      this._recordDuration = Math.round((Date.now() - this.startTime) / 1000);
      this._cleanup();
      if (this.chunks.length > 0) {
        this.audioBlob = new Blob(this.chunks, { type: this.mediaRecorder.mimeType || 'audio/webm' });
        this.audioUrl = URL.createObjectURL(this.audioBlob);
        this.onStop(this.audioBlob, this.audioUrl, this._recordDuration);
      }
    };

    this.mediaRecorder.start(1000);
    this.onStart();

    // ---- 计时器 ----
    if (this.manualMode) {
      // 手动模式：正数计时
      let elapsed = 0;
      this.onTick(elapsed);
      this.timerInterval = setInterval(() => {
        elapsed++;
        this.onTick(elapsed);
      }, 1000);
    } else {
      // 自动模式：倒计时
      const totalSec = Math.ceil(this.maxDuration / 1000);
      let remaining = totalSec;
      this.onTick(remaining);
      this.timerInterval = setInterval(() => {
        remaining--;
        this.onTick(remaining);
        if (remaining <= 0) this.stop();
      }, 1000);
    }

    // 可视化
    if (this.analyser) {
      const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      this.visInterval = setInterval(() => {
        if (!this.analyser) return;
        this.analyser.getByteFrequencyData(dataArray);
        this.onVisualizer(dataArray);
      }, 50);
    }

    // 安全上限保护（仅手动模式需要，自动模式已有倒计时）
    if (this.manualMode) {
      setTimeout(() => { if (this.isRecording) this.stop(); }, this.maxDuration + 500);
    }

    return true;
  }

  stop() {
    if (!this.isRecording || !this.mediaRecorder) return;
    if (this.mediaRecorder.state === 'recording') this.mediaRecorder.stop();
  }

  _cleanup() {
    if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null; }
    if (this.visInterval) { clearInterval(this.visInterval); this.visInterval = null; }
  }

  destroy() {
    this._cleanup();
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close(); this.audioContext = null; this.analyser = null;
    }
    if (this.audioUrl) { URL.revokeObjectURL(this.audioUrl); this.audioUrl = null; }
    this.audioBlob = null; this.chunks = []; this.isRecording = false;
  }

  async getBase64() {
    if (!this.audioBlob) return null;
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(this.audioBlob);
    });
  }

  getDuration() { return this._recordDuration; }
}
