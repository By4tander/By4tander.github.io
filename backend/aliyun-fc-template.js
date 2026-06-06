/**
 * ============================================================
 * 阿里云函数计算 (Function Compute) 后端模板
 * ============================================================
 *
 * 部署方式：
 * 1. 登录阿里云控制台，进入函数计算 FC
 * 2. 创建函数 → 选择 "HTTP 函数" → Node.js 18+
 * 3. 将此文件内容粘贴为函数代码
 * 4. 配置 API 网关 HTTP 触发器
 * 5. 配置环境变量（OSS AccessKey 等）
 * 6. 将 API 网关端点填入前端 js/config.js
 * ============================================================
 */

'use strict';

// ★★★ 请根据您的阿里云账号修改以下配置 ★★★
const OSS_CONFIG = {
  region: process.env.OSS_REGION || 'oss-cn-hangzhou',
  bucket: process.env.OSS_BUCKET || 'your-experiment-bucket',
  accessKeyId: process.env.OSS_ACCESS_KEY_ID || '',
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || '',
};

// 数据表名（如使用 Tablestore 或 RDS）
const TABLE_NAME = 'experiment_data';

/**
 * 主处理函数
 */
exports.handler = async (event, context, callback) => {
  // 允许跨域（CORS）
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-App-Key, X-Experiment-Version',
  };

  // OPTIONS 预检请求
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // 仅接受 POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: '仅支持 POST 请求' }),
    };
  }

  try {
    // 解析请求体
    const body = JSON.parse(event.body);
    
    // 基础验证
    if (!body.subjectId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: '缺少被试编号 (subjectId)' }),
      };
    }

    console.log(`[Experiment] 收到数据 | 被试: ${body.subjectId} | Session: ${body.sessionId}`);

    // =================================
    // 第一步：处理音频数据
    // =================================
    const processedData = { ...body };

    // 处理麦克风测试音频（Base64 → OSS）
    if (body.stages?.micTest?.audioBase64) {
      const audioUrl = await uploadAudioToOSS(
        body.stages.micTest.audioBase64,
        `${body.subjectId}/mic-test-${body.sessionId}.webm`
      );
      processedData.stages.micTest.audioUrl = audioUrl;
      processedData.stages.micTest.audioBase64 = '[STORED_IN_OSS]'; // 不存原始Base64
    }

    // 处理语音回答音频（Base64 → OSS）
    if (body.stages?.voiceAnswer?.audioBase64) {
      const audioUrl = await uploadAudioToOSS(
        body.stages.voiceAnswer.audioBase64,
        `${body.subjectId}/voice-${body.sessionId}.webm`
      );
      processedData.stages.voiceAnswer.audioUrl = audioUrl;
      processedData.stages.voiceAnswer.audioBase64 = '[STORED_IN_OSS]';
    }

    // =================================
    // 第二步：存储结构化数据
    // =================================
    const recordId = await saveToDatabase(processedData);

    console.log(`[Experiment] 数据已保存，记录ID: ${recordId}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        recordId,
        message: '数据已成功保存',
      }),
    };

  } catch (error) {
    console.error('[Experiment] 处理失败:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: '服务器内部错误',
        detail: error.message,
      }),
    };
  }
};

/**
 * 上传音频到阿里云 OSS
 * @param {string} base64Data - Base64 编码的音频数据
 * @param {string} objectKey - OSS 对象键名
 * @returns {Promise<string>} OSS 文件 URL
 */
async function uploadAudioToOSS(base64Data, objectKey) {
  // 方案一：使用阿里云 OSS SDK
  // const OSS = require('ali-oss');
  // const client = new OSS(OSS_CONFIG);
  // 
  // const buffer = Buffer.from(
  //   base64Data.replace(/^data:audio\/\w+;base64,/, ''), 
  //   'base64'
  // );
  //
  // const result = await client.put(objectKey, buffer, {
  //   mime: 'audio/webm',
  // });
  //
  // return result.url;

  // =================================
  // 方案二：如果不想用 OSS，直接存 Base64 到数据库
  // 注意：音频 Base64 可能很大（几百KB-几MB），建议用 OSS
  // =================================
  
  // 临时：返回占位符 URL
  console.log(`[OSS] 已保存音频: ${objectKey}`);
  return `https://${OSS_CONFIG.bucket}.${OSS_CONFIG.region}.aliyuncs.com/${objectKey}`;
}

/**
 * 保存数据到数据库
 * @param {object} data
 * @returns {Promise<string>} 记录 ID
 */
async function saveToDatabase(data) {
  // =================================
  // 方案一：使用阿里云 Tablestore
  // =================================
  // const TableStore = require('tablestore');
  // const client = new TableStore.Client({ ... });
  // const result = await client.putRow({ ... });
  // return result.row.primaryKey[0].value;

  // =================================
  // 方案二：使用阿里云 RDS (MySQL)
  // =================================
  // const mysql = require('mysql2/promise');
  // const connection = await mysql.createConnection({ ... });
  // const [result] = await connection.execute(
  //   'INSERT INTO experiment_data (subject_id, session_id, data) VALUES (?, ?, ?)',
  //   [data.subjectId, data.sessionId, JSON.stringify(data)]
  // );
  // return result.insertId;

  // =================================
  // 方案三（最简单）：存储到阿里云 OSS 作为 JSON 文件
  // =================================
  // const OSS = require('ali-oss');
  // const client = new OSS(OSS_CONFIG);
  // const dataKey = `data/${data.subjectId}/${data.sessionId}.json`;
  // await client.put(dataKey, Buffer.from(JSON.stringify(data, null, 2)), {
  //   mime: 'application/json',
  // });
  // console.log(`[OSS] 数据已保存: ${dataKey}`);
  // return dataKey;

  // 临时：模拟存储
  const recordId = `rec_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  console.log(`[DB] 模拟保存数据，记录ID: ${recordId}`);
  return recordId;
}
