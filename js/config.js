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
    
    // ★★★ 调试模式 ★★★
    // true  = 跳过伦理声明、麦克风测试、被试编号，直接进入全屏视频
    // false = 完整实验流程（正式实验用）
    debugMode: true,
    
    // 是否在本地存储备份数据
    localStorageBackup: true,
  },

  // ==========================================
  // 三、情景配置 ★★★ 自定义你的实验内容 ★★★
  // ==========================================
  scenario: {
    // ---- 视频库（支持双视频串联 + 分支）----
    videos: {
      // 情景视频1（先播放）
      scenario1: 'assets/video/scenario1.mp4',
      // 情景视频2（选题+录音后播放）
      scenario2: 'assets/video/scenario2.mp4',
      
      // ★★★ 预留：分支视频 ★★★
      branch_a: 'assets/video/branch_a.mp4',
      branch_b: 'assets/video/branch_b.mp4',
    },
    
    // 视频播放序列（按顺序播放）
    videoSequence: ['scenario1', 'scenario2'],
    
    // 选择题（在 scenario1 结束后弹出）
    questions: [
      {
        id: 'q1',
        stem: '看到小宇一直站在池边不下水，你觉得他心里在想什么？',
        options: [
          { value: 'A', label: '他就是在磨蹭，可能不太想上游泳课。', video: 'assets/video/1_A.mp4' },
          { value: 'B', label: '他可能是怕水，所以一直不敢下水。', video: 'assets/video/1_B.mp4' },
          { value: 'C', label: '他既怕水又怕被人看出来（他怕被别人看出来自己还没学会换气），所以更不敢下了。', video: 'assets/video/1_c.mp4' },
        ],
      },
      {
        id: 'q2',
        stem: '这时你会怎么做？',
        options: [
          { value: 'A', label: '我自己先游自己的，他需要会自己说。', video: 'assets/video/2_A.mp4' },
          { value: 'B', label: '我会问他是不是怕水，我刚开始也不会换气，多练练就好了。', video: 'assets/video/2_B.mp4' },
          { value: 'C', label: '我走过去说："我没学会前也不好意思，多练练就好了。"', video: 'assets/video/2_c.mp4' },
        ],
      },
      {
        id: 'q3',
        stem: '小宇说："我不太会换气……我怕一抬头就呛到，大家会笑我。"你觉得他最需要什么？',
        options: [
          { value: 'A', label: '我觉得他需要多练换气，练熟了自然就不怕了。', video: 'assets/video/3_A.mp4' },
          { value: 'B', label: '他需要有人耐心教他换气，也需要鼓励。', video: 'assets/video/3_B.mp4' },
          { value: 'C', label: '他需要有人教他换气，也需要有人帮他挡住嘲笑，化解尴尬。', video: 'assets/video/3_c.mp4' },
        ],
      },
      {
        id: 'q4',
        stem: '小杰大声说："这有什么好怕的？头埋下去再抬起来不就行了？"小宇假装没听到。你觉得小宇会怎么想？',
        options: [
          { value: 'A', label: '小杰说得也没什么错，换气就是这样的。', video: 'assets/video/4_A.mp4' },
          { value: 'B', label: '小宇听到这种话肯定更紧张，更不敢下水了。', video: 'assets/video/4_B.mp4' },
          { value: 'C', label: '小杰的语气让人觉得"这都不会你好差"，其实怕水很正常。', video: 'assets/video/4_c.mp4' },
        ],
      },
      {
        id: 'q5',
        stem: '如果你要回应小宇说的"我怕一抬头就呛到"，你会怎么说？',
        options: [
          { value: 'A', label: '多呛几次就会了，大家都是这样慢慢学会的。', video: 'assets/video/5_A.mp4' },
          { value: 'B', label: '一开始呛到很正常，我也是这么练的。', video: 'assets/video/5_B.mp4' },
          { value: 'C', label: '一开始呛到没关系，你扶池边练换气，我帮你数拍子。', video: 'assets/video/5_c.mp4' },
        ],
      },
      {
        id: 'q6',
        stem: '小杰说："他根本不敢下水，别管他了。"你会怎么做？',
        options: [
          { value: 'A', label: '算了不管了，他不想下水也不能硬拉。', video: 'assets/video/6_A.mp4' },
          { value: 'B', label: '我会说："他还没准备好呢，你别催他了。"', video: 'assets/video/6_B.mp4' },
          { value: 'C', label: '我会说："别这样说，每个人学游泳速度本来不一样。"', video: 'assets/video/6_c.mp4' },
        ],
      },
      {
        id: 'q7',
        stem: '小宇扶着池边练了一会儿换气，但其他人都去比赛了，他一个人不知道做什么。这时你会怎么做？',
        options: [
          { value: 'A', label: '他已经下水练换气了，应该没什么问题了，那我比赛去了。', video: 'assets/video/7_A.mp4' },
          { value: 'B', label: '我游过去问他："你要不要跟我一起在浅水区练？"我觉得你换气练得不错了，再练练就可以去比赛了。', video: 'assets/video/7_B.mp4' },
          { value: 'C', label: '我游过去说："你换气练得不错了，要不要咱俩来比比换气？"', video: 'assets/video/7_c.mp4' },
        ],
      },
      {
        id: 'q8',
        stem: '下课换衣服时，小宇说："我好怕，大家都游就我不会，我好丢脸。"你会怎么回应？',
        options: [
          { value: 'A', label: '多上几节课自然就会了，大家刚开始都一样。', video: 'assets/video/8_A.mp4' },
          { value: 'B', label: '你今天已经敢下水了，多练几次肯定能学会。', video: 'assets/video/8_B.mp4' },
          { value: 'C', label: '你今天已经从不敢下水到敢练换气了，下节课我们再试试别的动作。', video: 'assets/video/8_c.mp4' },
        ],
      },
    ],

    // 语音问题
    voiceQuestion: '请用语音回答：在刚才的情景中，您做出选择的主要原因是什么？',

    // 分支逻辑（预留）
    branching: {},
    
    totalVideoNodes: 2,
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
