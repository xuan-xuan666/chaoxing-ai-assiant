import { BG_ACTION, POPUP_ACTION, QUESTION_TYPES, RESULT_STATUS } from '../shared/protocol.js';

/**
 * 弹窗逻辑：只做三件事——发指令、显示状态、维护设置。
 * 真正接触页面 DOM 的是内容脚本，弹窗不直接读页面。
 */

const TYPE_TEXT = {
  [QUESTION_TYPES.SINGLE]: '单选',
  [QUESTION_TYPES.MULTIPLE]: '多选',
  [QUESTION_TYPES.FILL]: '填空',
};

const el = (id) => document.getElementById(id);

let currentState = null;

function setStatus(text, kind = '') {
  const node = el('status');
  node.textContent = text;
  node.className = `status ${kind}`.trim();
}

/** 与当前标签页通信；content script 未注入时给出可操作的提示。 */
async function callContent(action) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('找不到当前标签页。');

  try {
    return await chrome.tabs.sendMessage(tab.id, { action });
  } catch (error) {
    const message = String(error?.message || error);
    if (
      message.includes('Receiving end does not exist') ||
      message.includes('Could not establish connection')
    ) {
      throw new Error(
        '当前页面没有加载扩展脚本。请刷新页面后重试；该页面也可能不在扩展允许的范围内。',
      );
    }
    throw error;
  }
}

function emptyHint(text) {
  const node = document.createElement('div');
  node.className = 'empty';
  node.textContent = text;
  return node;
}

/** 渲染题目摘要列表；所有文本走 textContent，避免把页面内容当 HTML 插入。 */
function render(state) {
  const list = el('list');
  list.replaceChildren();

  if (!state?.hasSnapshot) {
    list.append(emptyHint('尚未采集题目。'));
    el('solve').disabled = true;
    el('panel').disabled = true;
    return;
  }

  const summary = document.createElement('div');
  summary.className = 'empty';
  summary.textContent = `已采集 ${state.count} 题 · 已填入 ${state.appliedCount}${
    state.stale ? ' · 结果已过期' : ''
  }`;
  list.append(summary);

  for (const question of state.questions ?? []) {
    const item = document.createElement('div');
    item.className = 'item';

    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = TYPE_TEXT[question.type] ?? question.type;

    item.append(tag, document.createTextNode(question.stem));
    list.append(item);
  }

  el('solve').disabled = false;
  el('panel').disabled = false;
}

async function refresh() {
  try {
    const ping = await callContent(POPUP_ACTION.PING);
    if (!ping?.ok) throw new Error('内容脚本未响应。');

    currentState = await callContent(POPUP_ACTION.GET_STATE);
    render(currentState);

    setStatus(
      currentState.hasSnapshot
        ? `页面已就绪，已采集 ${currentState.count} 题。`
        : '页面已就绪，点击“采集题目”开始。',
      'ok',
    );
  } catch (error) {
    render(null);
    el('collect').disabled = true;
    setStatus(String(error?.message || error), 'error');
  }
}

el('collect').addEventListener('click', async () => {
  el('collect').disabled = true;
  setStatus('正在采集当前页面的题目…');

  try {
    const result = await callContent(POPUP_ACTION.COLLECT);
    if (!result?.ok) {
      setStatus(result?.message || '采集失败。', 'error');
      return;
    }

    currentState = await callContent(POPUP_ACTION.GET_STATE);
    render(currentState);

    const skipped = result.skipped?.length ?? 0;
    setStatus(
      `采集成功：${result.count} 题${skipped > 0 ? `，跳过 ${skipped} 题（结构不完整）` : ''}。`,
      'ok',
    );
  } catch (error) {
    setStatus(String(error?.message || error), 'error');
  } finally {
    el('collect').disabled = false;
  }
});

el('solve').addEventListener('click', async () => {
  el('solve').disabled = true;
  setStatus('正在请求 AI 建议…');

  try {
    const result = await callContent(POPUP_ACTION.SOLVE);
    if (!result?.ok) {
      setStatus(result?.message || '获取建议失败。', 'error');
      return;
    }

    currentState = await callContent(POPUP_ACTION.GET_STATE);
    render(currentState);

    if (result.stale) {
      setStatus('页面已变化，本次结果已作废。请重新采集题目。', 'warn');
      return;
    }

    const answered = result.results.filter(
      (item) => item.status === RESULT_STATUS.ANSWERED,
    ).length;
    const applicable = result.results.filter((item) => item.applicable).length;

    setStatus(
      `已返回 ${result.results.length} 题结果：${answered} 题有答案，${applicable} 题可填入。请在页面结果面板中逐题核对。`,
      'ok',
    );
  } catch (error) {
    setStatus(String(error?.message || error), 'error');
  } finally {
    el('solve').disabled = false;
  }
});

el('panel').addEventListener('click', async () => {
  try {
    const result = await callContent(POPUP_ACTION.TOGGLE_PANEL);
    setStatus(result?.panelVisible ? '结果面板已打开。' : '结果面板已关闭。', 'ok');
  } catch (error) {
    setStatus(String(error?.message || error), 'error');
  }
});

async function loadSettings() {
  try {
    const reply = await chrome.runtime.sendMessage({ action: BG_ACTION.GET_SETTINGS });
    if (!reply?.ok) return;
    el('api').value = reply.settings.apiBaseUrl;
    el('mock').checked = reply.settings.mockMode;
  } catch {
    // 设置读取失败不影响主流程，保持默认值即可。
  }
}

el('save').addEventListener('click', async () => {
  const reply = await chrome.runtime.sendMessage({
    action: BG_ACTION.SET_SETTINGS,
    payload: {
      apiBaseUrl: el('api').value.trim(),
      mockMode: el('mock').checked,
    },
  });

  setStatus(
    reply?.ok ? '设置已保存。' : reply?.error || '设置保存失败。',
    reply?.ok ? 'ok' : 'error',
  );
});

refresh();
loadSettings();
