import { POPUP_ACTION, RESULT_STATUS } from '../shared/protocol.js';
import { buildRequest, requestSolve } from './api-client.js';
import { validateAndMap } from './answer-mapper.js';
import { extractRaw } from './dom-adapter.js';
import { createFiller } from './fillers/answer-filler.js';
import { detectPage } from './page-detector.js';
import { assembleQuestion } from './question-parser.js';
import { ResultPanel } from './result-renderer.js';
import { SnapshotManager } from './snapshot-manager.js';

/**
 * 内容脚本主流程（文档第 3 章）：
 *   采集 → 构建请求 → 交给 background 请求后端 → 按 ID 校验映射 → 用户确认 → 填入。
 *
 * 这里的核心原则只有一条：任何时候都不自动提交作业。
 * 应用答案必须来自用户在面板上的显式点击。
 */

function truncate(text, max = 60) {
  const value = String(text ?? '');
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function init() {
  const snapshot = new SnapshotManager();

  const state = {
    /** @type {null | { stale: boolean, results: object[], errors: object[] }} */
    mapping: null,
    applied: new Set(),
    collectedUrl: location.href,
  };

  const panel = new ResultPanel({
    onApply: (questionId) => applyOne(questionId),
    onApplyAll: () => applyAll(),
    onClose: () => panel.hide(),
  });

  /** 采集当前页面并建立新快照。 */
  async function collect() {
    // URL 变化通常意味着已经翻页，旧快照与旧结果必须整体作废，
    // 否则会出现“把上一页答案填到这一页”的最坏情况。
    if (state.collectedUrl !== location.href) {
      snapshot.rotatePage();
      state.collectedUrl = location.href;
    }
    /** 检测页面 */
    const detection = detectPage();
    if (!detection.supported) {
      return { ok: false, code: 'UNSUPPORTED_PAGE', message: detection.reason };
    }

    const usedIds = new Set();
    const entries = [];
    const skipped = [];

    detection.nodes.forEach((node, index) => {
      const { raw, refs } = extractRaw(node);
      // 解析器负责分配 ID、判定题型；有致命问题就跳过这道题，
      // 不发残缺数据给模型，避免得到“看起来很像”的错误答案。
      const { question, issues, fatal } = assembleQuestion(raw, {
        index,
        usedIds,
      });
      if (fatal || !question) {
        skipped.push({ index, issues });
        return;
      }
      entries.push({ question, refs, issues });
    });

    if (entries.length === 0) {
      return {
        ok: false,
        code: 'PARSE_FAILED',
        message: '识别到题目区域，但没有解析出有效题目，可能是页面结构已变化。',
        skipped,
      };
    }

    const meta = snapshot.commit(entries);
    state.mapping = null;
    state.applied = new Set();

    // 如果面板已经打开，重新采集后立即刷新成“未请求”状态，避免显示上一批结果。
    if (panel.isVisible) render();

    return {
      ok: true,
      ...meta,
      // 与 GET_STATE 的字段保持一致，popup 直接读 count 即可。
      count: entries.length,
      skipped,
      questions: entries.map((entry) => ({
        questionId: entry.question.questionId,
        type: entry.question.type,
        stem: truncate(entry.question.stem),
      })),
    };
  }

  /** 请求 AI 建议，并按快照校验映射回题目。 */
  async function solve() {
    const questions = snapshot.questions;
    if (questions.length === 0) {
      return { ok: false, code: 'NO_SNAPSHOT', message: '请先采集当前页面的题目。' };
    }

    let request;
    try {
      request = buildRequest(questions, {
        pageId: snapshot.pageId,
        snapshotVersion: snapshot.version,
      });
    } catch (error) {
      return { ok: false, code: 'BUILD_FAILED', message: error.message };
    }

    let response;
    try {
      response = await requestSolve(request);
    } catch (error) {
      return { ok: false, code: 'API_ERROR', message: error.message };
    }

    // 关键校验：批次、快照版本、requestId 任一不符，整批结果直接作废。
    const mapping = validateAndMap({
      response,
      questions,
      pageId: snapshot.pageId,
      snapshotVersion: snapshot.version,
      requestId: request.requestId,
    });
    state.mapping = mapping;
    if (mapping.stale) state.applied = new Set();

    render(
      mapping.stale
        ? '页面已变化，或该响应不属于本次请求，结果已作废。请重新采集题目。'
        : '',
    );
    panel.show();

    return {
      ok: true,
      stale: mapping.stale,
      requestId: request.requestId,
      results: mapping.results.map((result) => ({
        questionId: result.questionId,
        status: result.status,
        applicable: result.applicable,
        issues: result.issues,
      })),
      errors: mapping.errors,
    };
  }

  /** 统一重绘结果面板；notice 用于展示单次操作反馈。 */
  function render(notice = '') {
    const items = snapshot.questions.map((question) => ({
      question,
      result:
        state.mapping?.results.find(
          (item) => item.questionId === question.questionId,
        ) ?? null,
    }));
    panel.update({ items, applied: state.applied, notice });
  }

  /** 应用单题：只有用户点击按钮才会走到这里，这就是“人工确认”。 */
  async function applyOne(questionId) {
    const entry = snapshot.find(questionId);
    const result = state.mapping?.results.find(
      (item) => item.questionId === questionId,
    );

    if (!entry || !result) {
      return { ok: false, message: '未找到该题或结果，请重新获取建议。' };
    }
    if (!result.applicable) {
      return { ok: false, message: '该结果未通过校验，不能自动填入。' };
    }

    let outcome;
    try {
      outcome = await createFiller(entry.question.type).applyConfirmed(
        entry.question,
        result,
        entry.refs,
      );
    } catch (error) {
      outcome = { ok: false, message: `填入失败：${error?.message || error}` };
    }

    if (outcome.ok) state.applied.add(questionId);
    render(outcome.message);
    return { ...outcome, appliedCount: state.applied.size };
  }

  /** 批量应用：串行执行，避免多个适配器同时改动同一片 DOM 造成状态竞争。 */
  async function applyAll() {
    if (!state.mapping) {
      return { ok: false, message: '请先获取 AI 建议。' };
    }

    const targets = state.mapping.results.filter(
      (result) => result.applicable && !state.applied.has(result.questionId),
    );
    if (targets.length === 0) {
      return { ok: false, message: '当前没有可应用的题目。' };
    }

    const failures = [];
    for (const result of targets) {
      const entry = snapshot.find(result.questionId);
      if (!entry) {
        failures.push('题目已不存在');
        continue;
      }
      const outcome = await createFiller(entry.question.type).applyConfirmed(
        entry.question,
        result,
        entry.refs,
      );
      if (outcome.ok) state.applied.add(result.questionId);
      else failures.push(outcome.message);
    }

    render(
      failures.length > 0
        ? `部分题目未填入：${failures.join('；')}`
        : `已填入 ${targets.length} 道题`,
    );

    return {
      ok: failures.length === 0,
      message:
        failures.length > 0
          ? `部分题目未填入：${failures.join('；')}`
          : `已填入 ${targets.length} 道题`,
      appliedCount: state.applied.size,
    };
  }

  /** 供 popup 查询的轻量状态。 */
  function getState() {
    return {
      ok: true,
      url: location.href,
      hasSnapshot: snapshot.entries.size > 0,
      count: snapshot.entries.size,
      snapshotVersion: snapshot.version,
      hasResults: Boolean(state.mapping),
      stale: state.mapping?.stale ?? false,
      appliedCount: state.applied.size,
      panelVisible: panel.isVisible,
      answeredCount: state.mapping
        ? state.mapping.results.filter(
            (result) => result.status === RESULT_STATUS.ANSWERED,
          ).length
        : 0,
      questions: snapshot.questions.map((question) => ({
        questionId: question.questionId,
        type: question.type,
        stem: truncate(question.stem, 40),
      })),
    };
  }

  function togglePanel() {
    if (panel.isVisible) {
      panel.hide();
    } else {
      render();
      panel.show();
    }
    return { ok: true, panelVisible: panel.isVisible };
  }

  // popup 通过 tabs.sendMessage 调用；必须返回 true 才能异步 sendResponse。
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const run = async () => {
      switch (message?.action) {
        case POPUP_ACTION.PING:
          return { ok: true, ready: true, url: location.href };
        case POPUP_ACTION.COLLECT:
          return collect();
        case POPUP_ACTION.SOLVE:
          return solve();
        case POPUP_ACTION.GET_STATE:
          return getState();
        case POPUP_ACTION.TOGGLE_PANEL:
          return togglePanel();
        default:
          return {
            ok: false,
            code: 'UNKNOWN_ACTION',
            message: `未知操作：${message?.action}`,
          };
      }
    };

    run()
      .then(sendResponse)
      .catch((error) =>
        sendResponse({
          ok: false,
          code: 'INTERNAL',
          message: String(error?.message || error),
        }),
      );
    return true;
  });
}

// 扩展重载后 boot.js 可能再次注入，用全局标记保证只初始化一次。
if (!globalThis.__CX_AI_ASSISTANT__) {
  globalThis.__CX_AI_ASSISTANT__ = true;
  init();
}
