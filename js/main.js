/**
 * ============================================================
 * 心理学实验平台 - 入口文件
 * ============================================================
 */

(function () {
  'use strict';

  // 页面加载完成后初始化实验
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Experiment.init());
  } else {
    Experiment.init();
  }

  // 页面关闭前保存数据
  window.addEventListener('beforeunload', (e) => {
    // 如果实验进行中，提醒用户
    if (Experiment.currentStage > 0 && Experiment.currentStage < 4) {
      // 自动保存当前数据
      const pkg = DataCollector.getPackage();
      StorageManager.save('interrupted', pkg);
    }
  });

  // 检测用户尝试离开页面
  window.addEventListener('pagehide', () => {
    if (Experiment.currentStage > 0 && Experiment.currentStage < 4) {
      const pkg = DataCollector.getPackage();
      StorageManager.save('interrupted', pkg);
    }
  });

  console.log('%c🧪 心理学实验平台已就绪 %cv' + EXPERIMENT_CONFIG.experiment.version,
    'font-size:16px;', 'color:#999;');
  console.log('%c后端类型: %c' + EXPERIMENT_CONFIG.backend.type.toUpperCase(),
    '', 'color:#4CAF50;');
  console.log('%c会话ID: %c' + DataCollector.session.sessionId,
    '', 'color:#2196F3;');
})();
