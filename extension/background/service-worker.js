import { BG_ACTION, DEFAULT_SETTINGS } from '../shared/protocol.js';
import { solveWithMock } from './mock-solver.js';

/**
 * 后台 Service Worker。
 *
 * 只做两件必须放在后台的事：
 *   1. 跨域请求后端（内容脚本受页面 CORS 限制，后台有 host_permissions）；
 *   2. 读写扩展设置（API 地址、模拟开关、超时）。
 * 不在这里做题目解析，也不保存任何页面数据。
 */

/** 合并用户设置与默认值。 */
async function getSettings() {
  const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored };
}

/** 带超时的后端调用；错误统一转成可读信息，不把堆栈抛给页面。 */
async function callBackend(payload, settings) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.timeoutMs);

  try {
    const response = await fetch(settings.apiBaseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`后端返回 HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data || typeof data !== 'object') {
      throw new Error('后端返回的内容不是 JSON 对象');
    }
    return data;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`请求超时（${settings.timeoutMs}ms）`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function handleSolve(payload) {
  if (!payload || !Array.isArray(payload.questions) || payload.questions.length === 0) {
    return { ok: false, error: '请求中没有题目' };
  }

  const settings = await getSettings();

  if (settings.mockMode) {
    // 模拟服务也保留一点延迟，方便观察加载态与重复点击保护。
    await new Promise((resolve) => setTimeout(resolve, 250));
    return { ok: true, response: solveWithMock(payload) };
  }

  const response = await callBackend(payload, settings);
  return { ok: true, response };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const action = message?.action;

  if (action === BG_ACTION.SOLVE) {
    handleSolve(message.payload)
      .then(sendResponse)
      .catch((error) =>
        sendResponse({ ok: false, error: String(error?.message || error) }),
      );
    return true; // 异步响应
  }

  if (action === BG_ACTION.GET_SETTINGS) {
    getSettings()
      .then((settings) => sendResponse({ ok: true, settings }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }

  if (action === BG_ACTION.SET_SETTINGS) {
    const next = message.payload ?? {};
    const safe = {
      apiBaseUrl: String(next.apiBaseUrl || DEFAULT_SETTINGS.apiBaseUrl),
      mockMode: Boolean(next.mockMode),
      timeoutMs: Number(next.timeoutMs) || DEFAULT_SETTINGS.timeoutMs,
    };
    chrome.storage.local
      .set(safe)
      .then(() => sendResponse({ ok: true, settings: safe }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }

  return false;
});
