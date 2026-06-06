/**
 * ============================================================
 * 音频录制模块 - 基于 MediaRecorder API
 * ============================================================
 * 兼容 Chrome 49+, Edge 79+, Firefox 25+
 * Safari 需 14.1+ 且不完全支持 audio/webm
 * ============================================================
 */

class AudioRecorder {
  constructor(options = {}) {
    this.maxDuration = options.maxDuration || 5000; // 最大录音时长(ms)
    this.mimeType = options.mimeType || 'audio/webm;codecs=opus';
    this.onTick = options.onTick || (() => {});       // 每秒回调(remaining)
    this.onStart = options.onStart || (() => {});     // 开始录音回调
    this.onStop = options.onStop || (() => {});       // 停止录音回调(blob)
    this.onError = options.onError || (() => {});     // 错误回调
    this.onVisualizer = options.onVisualizer || (() => {}); // 可视化数据回调

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
    this.micPermission = 'prompt'; // 'prompt' | 'granted' | 'denied'

    this._checkSupport();
  }

  /**
   * 检测浏览器是否支持录音
   */
  _checkSupport() {
    this.isSupported = !!(
      navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia &&
      (window.MediaRecorder || window.webkitMediaRecorder)
    );

    // 检查 MIME 类型支持
    if (this.isSupported) {
      const Recorder = window.MediaRecorder || window.webkitMediaRecorder;
      if (!Recorder.isTypeSupported(this.mimeType)) {
        // 降级到通用格式
        if (Recorder.isTypeSupported('audio/webm')) {
          this.mimeType = 'audio/webm';
        } else if (Recorder.isTypeSupported('audio/ogg;codecs=opus')) {
          this.mimeType = 'audio/ogg;codecs=opus';
        } else if (Recorder.isTypeSupported('audio/mp4')) {
          this.mimeType = 'audio/mp4';
        } else {
          this.mimeType = '';
        }
      }
    }
  }

  /**
   * 请求麦克风权限并初始化
   * @returns {Promise<boolean>} 是否成功授权
   */
  async requestPermission() {
    if (!this.isSupported) {
      this.micPermission = 'denied';
      this.onError({
        type: 'not_supported',
        message: '您的浏览器不支持录音功能，请使用 Chrome、Edge 或 Firefox 浏览器。',
      });
      return false;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
        video: false,
      });

      this.micPermission = 'granted';

      // 初始化 AudioContext 和 Analyser（用于可视化）
      try {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 256;
        const source = this.audioContext.createMediaStreamSource(this.stream);
        source.connect(this.analyser);
      } catch (e) {
        console.warn('[Recorder] AudioContext 初始化失败，可视化不可用:', e.message);
      }

      return true;
    } catch (error) {
      this.micPermission = 'denied';
      
      let message = '无法访问麦克风。';
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        message = '麦克风权限被拒绝。请在浏览器设置中允许本网站使用麦克风后重试。';
      } else if (error.name === 'NotFoundError') {
        message = '未检测到麦克风设备，请连接麦克风后重试。';
      } else if (error.name === 'NotReadableError') {
        message = '麦克风被其他应用占用，请关闭其他录音程序后重试。';
      }

      this.onError({ type: 'permission', message, originalError: error });
      return false;
    }
  }

  /**
   * 开始录音
   * @returns {boolean}
   */
  start() {
    if (!this.stream || this.isRecording) return false;

    const Recorder = window.MediaRecorder || window.webkitMediaRecorder;
    const options = this.mimeType ? { mimeType: this.mimeType } : {};

    try {
      this.mediaRecorder = new Recorder(this.stream, options);
    } catch (e) {
      // 降级：不指定 MIME 类型
      try {
        this.mediaRecorder = new Recorder(this.stream);
      } catch (e2) {
        this.onError({ type: 'recorder_create', message: '无法创建录音器', originalError: e2 });
        return false;
      }
    }

    this.chunks = [];
    this.isRecording = true;
    this.startTime = Date.now();

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      this.isRecording = false;
      this._cleanup();

      if (this.chunks.length > 0) {
        this.audioBlob = new Blob(this.chunks, {
          type: this.mediaRecorder.mimeType || 'audio/webm',
        });
        this.audioUrl = URL.createObjectURL(this.audioBlob);
        this.onStop(this.audioBlob, this.audioUrl);
      }
    };

    // 每秒收集一次数据
    this.mediaRecorder.start(1000);
    this.onStart();

    // 启动倒计时
    const totalSec = Math.ceil(this.maxDuration / 1000);
    let remaining = totalSec;
    this.onTick(remaining);

    this.timerInterval = setInterval(() => {
      remaining--;
      this.onTick(remaining);

      if (remaining <= 0) {
        this.stop();
      }
    }, 1000);

    // 可视化数据推送
    if (this.analyser) {
      const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      this.visInterval = setInterval(() => {
        if (!this.analyser) return;
        this.analyser.getByteFrequencyData(dataArray);
        this.onVisualizer(dataArray);
      }, 50);
    }

    // 硬超时保护
    setTimeout(() => {
      if (this.isRecording) {
        this.stop();
      }
    }, this.maxDuration + 500);

    return true;
  }

  /**
   * 停止录音
   */
  stop() {
    if (!this.isRecording || !this.mediaRecorder) return;

    if (this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }
  }

  /**
   * 内部清理定时器和资源
   */
  _cleanup() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (this.visInterval) {
      clearInterval(this.visInterval);
      this.visInterval = null;
    }
  }

  /**
   * 释放所有资源
   */
  destroy() {
    this._cleanup();

    // 停止所有音轨
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    // 关闭 AudioContext
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
      this.analyser = null;
    }

    // 释放 Blob URL
    if (this.audioUrl) {
      URL.revokeObjectURL(this.audioUrl);
      this.audioUrl = null;
    }

    this.audioBlob = null;
    this.chunks = [];
    this.isRecording = false;
  }

  /**
   * 获取录音文件的 Base64 编码
   * @returns {Promise<string|null>}
   */
  async getBase64() {
    if (!this.audioBlob) return null;
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(this.audioBlob);
    });
  }

  /**
   * 获取录音时长（秒）
   * @returns {number}
   */
  getDuration() {
    if (!this.audioBlob) return 0;
    return this.maxDuration / 1000; // 近似值
  }
}
