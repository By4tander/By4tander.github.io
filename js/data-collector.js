/**
 * ============================================================
 * 数据采集模块 - 汇总实验各阶段数据
 * ============================================================
 */

const DataCollector = {
  // 会话数据容器
  session: {
    sessionId: StorageManager.generateSessionId(),
    subjectId: '',
    consentTime: null,
    experimentStartTime: null,
    
    // 各阶段数据
    micTest: null,
    choices: [],
    voiceAnswer: null,
    textInput: '',
    
    // 元数据
    events: [], // 事件时间线
  },

  /**
   * 重置会话
   */
  reset() {
    this.session = {
      sessionId: StorageManager.generateSessionId(),
      subjectId: '',
      consentTime: null,
      experimentStartTime: null,
      micTest: null,
      choices: [],
      voiceAnswer: null,
      textInput: '',
      events: [],
    };
  },

  /**
   * 记录事件
   * @param {string} eventName
   * @param {object} data
   */
  logEvent(eventName, data = {}) {
    this.session.events.push({
      event: eventName,
      timestamp: new Date().toISOString(),
      data,
    });
  },

  /**
   * 设置知情同意时间
   */
  setConsent() {
    this.session.consentTime = new Date().toISOString();
    this.logEvent('consent_given');
    StorageManager.save('sessionId', this.session.sessionId);
  },

  /**
   * 设置被试编号
   * @param {string} id
   */
  setSubjectId(id) {
    this.session.subjectId = id;
    this.session.experimentStartTime = new Date().toISOString();
    this.logEvent('experiment_started', { subjectId: id });
    StorageManager.save('subjectId', id);
  },

  /**
   * 记录麦克风测试结果
   * @param {object} testData
   */
  setMicTest(testData) {
    this.session.micTest = {
      passed: testData.passed,
      audioBase64: testData.audioBase64 || null,
      audioSize: testData.audioSize || 0,
      timestamp: new Date().toISOString(),
    };
    this.logEvent('mic_test_completed', { passed: testData.passed });
  },

  /**
   * 记录视频观看事件
   */
  logVideoWatched() {
    this.logEvent('video_watched');
  },

  /**
   * 记录视频跳过事件
   */
  logVideoSkipped() {
    this.logEvent('video_skipped');
  },

  /**
   * 设置选择题答案
   * @param {Array} choices
   */
  setChoices(choices) {
    this.session.choices = choices;
    this.logEvent('choices_submitted', { count: choices.length });
  },

  /**
   * 设置语音回答
   * @param {object} voiceData
   */
  setVoiceAnswer(voiceData) {
    this.session.voiceAnswer = {
      audioBase64: voiceData.audioBase64 || null,
      audioSize: voiceData.audioSize || 0,
      duration: voiceData.duration || 0,
      timestamp: new Date().toISOString(),
    };
    this.logEvent('voice_answer_recorded');
  },

  /**
   * 获取完整数据包
   * @returns {object}
   */
  getPackage() {
    return StorageManager.createDataPackage({
      sessionId: this.session.sessionId,
      subjectId: this.session.subjectId,
      consentTime: this.session.consentTime,
      experimentStartTime: this.session.experimentStartTime,
      micTest: this.session.micTest,
      choices: this.session.choices,
      voiceAnswer: this.session.voiceAnswer,
      textInput: this.session.textInput,
      events: this.session.events,
    });
  },

  /**
   * 导出数据为 JSON 下载
   */
  download() {
    const pkg = this.getPackage();
    const filename = `experiment-${this.session.subjectId}-${this.session.sessionId}.json`;
    StorageManager.downloadJSON(pkg, filename);
  },

  /**
   * 上传到云端
   * @returns {Promise<object>}
   */
  async upload() {
    const pkg = this.getPackage();
    return StorageManager.upload(pkg);
  },
};
