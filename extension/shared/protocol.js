/**
 * 前后端共享的协议常量。
 *
 * 这里的所有枚举都与设计文档第 5 章一致。修改任一字段含义时，
 * 必须同时提升 SCHEMA_VERSION，避免旧扩展打到新后端上产生静默错配。
 */

export const SCHEMA_VERSION = '1.0';

/** 题型枚举：后端与前端必须使用同一套字符串，禁止各写各的。 */
export const QUESTION_TYPES = Object.freeze({
  SINGLE: 'SINGLE_CHOICE',
  MULTIPLE: 'MULTIPLE_CHOICE',
  FILL: 'FILL_BLANK',
});

/** 逐题结果状态，对应文档 5.5。 */
export const RESULT_STATUS = Object.freeze({
  ANSWERED: 'ANSWERED',
  UNCERTAIN: 'UNCERTAIN',
  INVALID_INPUT: 'INVALID_INPUT',
  FAILED: 'FAILED',
  STALE: 'STALE',
});

/** popup → content script 的消息动作。 */
export const POPUP_ACTION = Object.freeze({
  PING: 'popup:ping',
  COLLECT: 'popup:collect',
  SOLVE: 'popup:solve',
  GET_STATE: 'popup:get-state',
  TOGGLE_PANEL: 'popup:toggle-panel',
});

/** content script → background 的消息动作（只有跨域请求需要中转）。 */
export const BG_ACTION = Object.freeze({
  SOLVE: 'bg:solve',
  GET_SETTINGS: 'bg:get-settings',
  SET_SETTINGS: 'bg:set-settings',
});

/** 后端未就绪时使用的默认配置；mockMode 让整条链路可以离线跑通。 */
export const DEFAULT_SETTINGS = Object.freeze({
  apiBaseUrl: 'http://localhost:8080/api/v1/answers/solve',
  mockMode: true,
  timeoutMs: 20000,
});

/** 单次请求的题目上限，防止误采集整页导致请求体过大（文档 9.2）。 */
export const MAX_QUESTIONS_PER_BATCH = 50;

/** 允许模型返回的结果状态集合，用于过滤脏数据。 */
export const ALLOWED_RESULT_STATUS = Object.freeze([
  RESULT_STATUS.ANSWERED,
  RESULT_STATUS.UNCERTAIN,
  RESULT_STATUS.INVALID_INPUT,
  RESULT_STATUS.FAILED,
]);
