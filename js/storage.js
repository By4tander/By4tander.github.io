/**
 * ============================================================
 * 数据持久化模块 - 本地存储 & 云端上传
 * ============================================================
 */

const StorageManager = {
  // 本地存储键名前缀
  PREFIX: 'exp_',

  /**
   * 保存数据到 localStorage
   * @param {string} key
   * @param {*} value
   */
  save(key, value) {
    try {
      localStorage.setItem(this.PREFIX + key, JSON.stringify(value));
    } catch (e) {
      console.warn('[Storage] localStorage 写入失败:', e.message);
    }
  },

  /**
   * 从 localStorage 读取数据
   * @param {string} key
   * @returns {*|null}
   */
  load(key) {
    try {
      const raw = localStorage.getItem(this.PREFIX + key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn('[Storage] localStorage 读取失败:', e.message);
      return null;
    }
  },

  /**
   * 删除 localStorage 数据
   * @param {string} key
   */
  remove(key) {
    try {
      localStorage.removeItem(this.PREFIX + key);
    } catch (e) {
      console.warn('[Storage] localStorage 删除失败:', e.message);
    }
  },

  /**
   * 生成唯一被试会话 ID
   * @returns {string}
   */
  generateSessionId() {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).substring(2, 8);
    return `${ts}-${rand}`;
  },

  /**
   * 创建实验数据包
   * @param {object} data - 各阶段采集的数据
   * @returns {object} 完整的实验数据记录
   */
  createDataPackage(data) {
    return {
      sessionId: data.sessionId || this.generateSessionId(),
      subjectId: data.subjectId || '',
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      screenSize: `${window.screen.width}x${window.screen.height}`,
      experiment: {
        name: EXPERIMENT_CONFIG.experiment.name,
        version: EXPERIMENT_CONFIG.experiment.version,
      },
      stages: {
        micTest: data.micTest || null,
        choices: data.choices || [],
        voiceAnswer: data.voiceAnswer || null,
      },
      textInput: data.textInput || '',
      metadata: {
        consentTime: data.consentTime || null,
        experimentStartTime: data.experimentStartTime || null,
        experimentEndTime: new Date().toISOString(),
        totalDuration: data.experimentStartTime 
          ? (Date.now() - new Date(data.experimentStartTime).getTime()) / 1000 
          : null,
      },
    };
  },

  /**
   * 上传数据到阿里云后端
   * @param {object} dataPackage - 实验数据包
   * @returns {Promise<object>}
   */
  async uploadToAliyun(dataPackage) {
    const config = EXPERIMENT_CONFIG.backend.aliyun;
    const endpoint = config.apiEndpoint;

    // 如果未配置真实 API 端点，模拟成功
    if (endpoint.includes('YOUR_API_GATEWAY_ID')) {
      console.log('[Storage] 阿里云 API 未配置，数据保存至本地');
      return { success: false, reason: 'not_configured', local: true };
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-App-Key': config.appKey,
          'X-Experiment-Version': EXPERIMENT_CONFIG.experiment.version,
        },
        body: JSON.stringify(dataPackage),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      return { success: true, data: result };
    } catch (error) {
      console.error('[Storage] 上传失败:', error.message);
      return { success: false, reason: 'network_error', error: error.message };
    }
  },

  /**
   * 上传到 LeanCloud
   * @param {object} dataPackage
   * @returns {Promise<object>}
   */
  async uploadToLeanCloud(dataPackage) {
    const config = EXPERIMENT_CONFIG.backend.leancloud;
    
    if (config.appId.includes('YOUR_LEANCLOUD')) {
      console.log('[Storage] LeanCloud 未配置，数据保存至本地');
      return { success: false, reason: 'not_configured', local: true };
    }

    try {
      const response = await fetch(`${config.serverURL}/1.1/classes/ExperimentData`, {
        method: 'POST',
        headers: {
          'X-LC-Id': config.appId,
          'X-LC-Key': config.appKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dataPackage),
      });

      const result = await response.json();
      return { success: !!result.objectId, data: result };
    } catch (error) {
      console.error('[Storage] LeanCloud 上传失败:', error.message);
      return { success: false, reason: 'network_error', error: error.message };
    }
  },

  /**
   * 上传到 Supabase
   * @param {object} dataPackage
   * @returns {Promise<object>}
   */
  async uploadToSupabase(dataPackage) {
    const config = EXPERIMENT_CONFIG.backend.supabase;
    
    if (config.url.includes('YOUR_PROJECT_ID')) {
      console.log('[Storage] Supabase 未配置，数据保存至本地');
      return { success: false, reason: 'not_configured', local: true };
    }

    try {
      const response = await fetch(`${config.url}/rest/v1/experiment_data`, {
        method: 'POST',
        headers: {
          'apikey': config.anonKey,
          'Authorization': `Bearer ${config.anonKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify(dataPackage),
      });

      const result = await response.json();
      return { success: response.ok, data: result };
    } catch (error) {
      console.error('[Storage] Supabase 上传失败:', error.message);
      return { success: false, reason: 'network_error', error: error.message };
    }
  },

  /**
   * 智能上传（根据配置自动选择后端）
   * @param {object} dataPackage
   * @returns {Promise<object>}
   */
  async upload(dataPackage) {
    const backendType = EXPERIMENT_CONFIG.backend.type;

    // 本地备份
    if (EXPERIMENT_CONFIG.experiment.localStorageBackup) {
      this.save('lastExperiment', dataPackage);
    }

    switch (backendType) {
      case 'aliyun':
        return this.uploadToAliyun(dataPackage);
      case 'leancloud':
        return this.uploadToLeanCloud(dataPackage);
      case 'supabase':
        return this.uploadToSupabase(dataPackage);
      case 'local':
      default:
        return { success: false, reason: 'local_only', local: true };
    }
  },

  /**
   * 导出数据为 JSON 文件下载
   * @param {object} dataPackage
   * @param {string} filename
   */
  downloadJSON(dataPackage, filename) {
    const json = JSON.stringify(dataPackage, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `experiment-${dataPackage.subjectId}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * 清除本次实验的本地数据
   */
  clearSession() {
    this.remove('lastExperiment');
    this.remove('sessionId');
    this.remove('subjectId');
  },
};
