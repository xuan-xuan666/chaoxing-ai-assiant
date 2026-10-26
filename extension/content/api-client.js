import {
  BG_ACTION,
  MAX_QUESTIONS_PER_BATCH,
  SCHEMA_VERSION,
} from '../shared/protocol.js';
import { shortId } from '../shared/text.js';

/**
 * 前端 API 客户端。
 *
 * 内容脚本不直接 fetch 后端：跨域请求统一交给 background，
 * 这样可以只让 service worker 持有 host_permissions，页面上下文拿不到接口权限。
 */

/** 把内部题目对象裁剪成协议 DTO，确保 DOM 引用、内部字段不会被序列化出去。 */
function toDto(question) {
  return {
    questionId: question.questionId,
    type: question.type,
    stem: question.stem,
    options: question.options.map((option) => ({
      optionId: option.optionId,
      label: option.label,
      text: option.text,
    })),
    blanks: question.blanks.map((blank) => ({
      blankIndex: blank.blankIndex,
    })),
    // 图片/公式标记按需携带，避免所有请求都变胖。
    ...(Object.values(question.media ?? {}).some(Boolean)
      ? { media: question.media }
      : {}),
  };
}

/**
 * 构建批次请求。
 * requestId 每次请求都重新生成，后端必须原样回显，前端据此拒绝串批响应。
 */
export function buildRequest(questions, { pageId, snapshotVersion }) {
  if (questions.length > MAX_QUESTIONS_PER_BATCH) {
    throw new Error(`单次最多处理 ${MAX_QUESTIONS_PER_BATCH} 道题，请分页采集。`);
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    pageId,
    snapshotVersion,
    requestId: `req-${Date.now()}-${shortId()}`,
    questions: questions.map(toDto),
  };
}

/** 通过 background 调用后端（或内置模拟服务）。 */
export async function requestSolve(request) {
  const reply = await chrome.runtime.sendMessage({
    action: BG_ACTION.SOLVE,
    payload: request,
  });

  if (!reply) {
    throw new Error('扩展后台无响应，请在 chrome://extensions 重新加载扩展。');
  }
  if (!reply.ok) {
    throw new Error(reply.error || '后端请求失败');
  }
  return reply.response;
}
