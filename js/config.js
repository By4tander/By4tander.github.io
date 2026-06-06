/**
 * ============================================================
 * 实验配置 - 后端接口和实验参数
 * ============================================================
 * 使用前请根据您的实际部署修改以下配置。
 * ============================================================
 */

const EXPERIMENT_CONFIG = {
  // ==========================================
  // 一、后端存储配置
  // ==========================================
  backend: {
    /**
     * 后端类型：'aliyun' | 'leancloud' | 'supabase' | 'local'
     * - aliyun: 阿里云 API Gateway + Function Compute
     * - leancloud: LeanCloud 云服务
     * - supabase: Supabase 开源云服务
     * - local: 仅本地下载（无需后端）
     */
    type: 'aliyun',

    // ---- 阿里云配置 ----
    aliyun: {
      /**
       * ★★★ 需要配置 ★★★
       * 阿里云 API Gateway 端点地址
       * 格式：https://your-api-id.apigateway.aliyuncs.com/your-stage/resource
       * 
       * 后端收到数据后的处理逻辑请参考 backend/aliyun-fc-template.js
       */
      apiEndpoint: 'https://YOUR_API_GATEWAY_ID.apigateway.aliyuncs.com/prod/experiment/upload',
      
      // API 鉴权（如使用阿里云APP签名认证）
      appKey: 'YOUR_APP_KEY',
      appSecret: 'YOUR_APP_SECRET',
      
      // OSS 配置（用于存储音频文件）
      oss: {
        region: 'oss-cn-hangzhou',
        bucket: 'your-experiment-bucket',
        endpoint: 'https://your-experiment-bucket.oss-cn-hangzhou.aliyuncs.com',
        accessKeyId: 'YOUR_OSS_ACCESS_KEY_ID',
        accessKeySecret: 'YOUR_OSS_ACCESS_KEY_SECRET',
      },
    },

    // ---- LeanCloud 配置 ----
    leancloud: {
      appId: 'YOUR_LEANCLOUD_APP_ID',
      appKey: 'YOUR_LEANCLOUD_APP_KEY',
      serverURL: 'https://YOUR_APP_ID.api.lncldglobal.com',
    },

    // ---- Supabase 配置 ----
    supabase: {
      url: 'https://YOUR_PROJECT_ID.supabase.co',
      anonKey: 'YOUR_SUPABASE_ANON_KEY',
      bucketName: 'audio-recordings',
    },
  },

  // ==========================================
  // 二、实验参数
  // ==========================================
  experiment: {
    name: '语言交互行为实验',
    version: '2.0.0',
    
    // 录音均为手动启停模式（被试自主控制开始/结束）
    // 以下为安全上限（秒）
    micTestMaxDuration: 30,
    voiceAnswerMaxDuration: 120,
    
    // 音频格式
    audioMimeType: 'audio/webm;codecs=opus',
    
    // 是否显示影院跳过按钮（调试用，正式实验应设为 false）
    showSkipButton: true,
    
    // 是否在本地存储备份数据
    localStorageBackup: true,
  },

  // ==========================================
  // 三、情景配置 ★★★ 自定义你的实验内容 ★★★
  // ==========================================
  scenario: {
    // ---- 视频库（支持分支视频串联）----
    videos: {
      // 主情景视频
      main: 'assets/video/scenario.mp4',
      
      // ★★★ 预留：分支视频 ★★★
      // 根据被试选择的不同，可以播放不同的后续视频
      // 示例：选A → 播放 branch_a.mp4，选B → 播放 branch_b.mp4
      branch_a: 'assets/video/branch_a.mp4',
      branch_b: 'assets/video/branch_b.mp4',
      branch_c: 'assets/video/branch_c.mp4',
      branch_d: 'assets/video/branch_d.mp4',
    },
    
    // 当前使用的视频路径（默认主情景）
    videoSrc: 'assets/video/scenario.mp4',

    // ---- 视频结束后浮出的选择题 ----
    questions: [
      {
        id: 'q1',
        stem: '在视频情景中，您的第一反应是？',
        options: [
          { value: 'A', label: '选项A：立即采取行动' },
          { value: 'B', label: '选项B：先观察情况' },
          { value: 'C', label: '选项C：寻求他人帮助' },
          { value: 'D', label: '选项D：忽视当前情况' },
        ],
      },
      {
        id: 'q2',
        stem: '您认为视频中的角色做出的决定是否合理？',
        options: [
          { value: 'A', label: '选项A：非常合理' },
          { value: 'B', label: '选项B：比较合理' },
          { value: 'C', label: '选项C：不太合理' },
          { value: 'D', label: '选项D：完全不合理' },
        ],
      },
    ],

    // ---- 选题后浮出的语音问题 ----
    voiceQuestion: '请用语音回答：在刚才的情景中，您做出选择的主要原因是什么？',

    // ★★★ 预留：分支逻辑 ★★★
    // 根据选择题结果决定下一个视频
    // key 为 questionId，value 为选项→视频的映射
    // 示例：{ q1: { A: 'branch_a', B: 'branch_b' } }
    // 如果不需要分支，保持为空对象 {}
    branching: {
      // q1: { A: 'branch_a', B: 'branch_b' },
      // q2: { A: 'branch_a', B: 'branch_b', C: 'branch_c', D: 'branch_d' },
    },
    
    // 总共有几个视频节点（用于进度显示，1 = 单视频无分支）
    totalVideoNodes: 1,
  },

  // ==========================================
  // 四、UI 文本（可定制）
  // ==========================================
  ui: {
    consentTitle: '🎓 语言交互行为实验',
    micTestTitle: '🎤 麦克风测试',
    subjectTitle: '📋 被试信息',
    cinemaTitle: '🎬 互动视频',
    completeTitle: '✅ 实验完成',
  },
};

// 导出（如果使用模块化加载）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = EXPERIMENT_CONFIG;
}
