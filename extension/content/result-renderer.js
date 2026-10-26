import { QUESTION_TYPES, RESULT_STATUS } from '../shared/protocol.js';

/**
 * 页面内结果面板（Shadow DOM 隔离，避免和宿主页面样式互相污染）。
 *
 * 安全约束：所有文本都用 textContent 写入，绝不用 innerHTML 拼接模型输出，
 * 防止题目文本或模型解释里带 HTML 造成注入（文档 9.2）。
 */

const HOST_ID = 'cx-ai-assist-panel-host';

const STATUS_TEXT = {
  [RESULT_STATUS.ANSWERED]: '已给出建议',
  [RESULT_STATUS.UNCERTAIN]: '不确定',
  [RESULT_STATUS.INVALID_INPUT]: '校验未通过',
  [RESULT_STATUS.FAILED]: '失败',
  [RESULT_STATUS.STALE]: '结果已过期',
};

const TYPE_TEXT = {
  [QUESTION_TYPES.SINGLE]: '单选',
  [QUESTION_TYPES.MULTIPLE]: '多选',
  [QUESTION_TYPES.FILL]: '填空',
};

/** 极简 DOM 构造器：文本一律走 textContent。 */
function h(tag, props = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null) continue;
    if (key === 'class') element.className = value;
    else if (key === 'text') element.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      element.addEventListener(key.slice(2).toLowerCase(), value);
    } else element.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return element;
}

const STYLE = `
  :host { all: initial; }
  /* all: initial 会把 :host 的 display 重置为 inline，从而盖掉浏览器默认的
     [hidden] { display: none }，导致关闭按钮设了 hidden 面板却仍然显示。
     这里显式补一条更高优先级的规则，让 hidden 真正生效。 */
  :host([hidden]) { display: none !important; }
  .panel {
    position: fixed; right: 16px; bottom: 16px; width: 380px; max-height: 72vh;
    display: flex; flex-direction: column; z-index: 2147483646;
    background: #fff; color: #1f2328; border: 1px solid #d0d7de; border-radius: 12px;
    box-shadow: 0 12px 32px rgba(0,0,0,.18); font: 13px/1.55 -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
  }
  .head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #eaeef2; }
  .head .title { font-weight: 600; flex: 1; }
  .head button, .apply {
    font: inherit; cursor: pointer; border-radius: 6px; border: 1px solid #d0d7de;
    background: #f6f8fa; padding: 4px 10px; color: #1f2328;
  }
  .head button:hover, .apply:hover:not(:disabled) { background: #eef1f4; }
  .apply:disabled { opacity: .45; cursor: not-allowed; }
  .apply.primary { background: #1f6feb; border-color: #1f6feb; color: #fff; }
  .apply.primary:hover:not(:disabled) { background: #1a5fd0; }
  .notice { padding: 6px 12px; background: #fff8c5; color: #6b5900; border-bottom: 1px solid #eaeef2; }
  .list { overflow: auto; padding: 8px 12px; display: flex; flex-direction: column; gap: 10px; }
  .card { border: 1px solid #eaeef2; border-radius: 8px; padding: 10px; }
  .meta { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; color: #57606a; font-size: 12px; }
  .badge { padding: 1px 8px; border-radius: 999px; background: #eef1f4; color: #57606a; }
  .badge.ok { background: #dafbe1; color: #116329; }
  .badge.warn { background: #fff8c5; color: #6b5900; }
  .badge.bad { background: #ffebe9; color: #a40e26; }
  .stem { margin: 2px 0 6px; }
  .option { color: #57606a; padding: 1px 0; }
  .option.picked { color: #116329; font-weight: 600; }
  .answer { margin-top: 6px; color: #1f2328; }
  .answer b { color: #1f6feb; }
  .explain { margin-top: 4px; color: #57606a; }
  .problems { margin-top: 4px; color: #a40e26; font-size: 12px; }
  .row { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
  .applied { color: #116329; font-size: 12px; }
  .foot { padding: 8px 12px; border-top: 1px solid #eaeef2; color: #8b949e; font-size: 12px; }
  .empty { padding: 24px 12px; color: #8b949e; text-align: center; }
`;

export class ResultPanel {
  constructor({ onApply, onApplyAll, onClose } = {}) {
    this.onApply = onApply;
    this.onApplyAll = onApplyAll;
    this.onClose = onClose;
    this.host = null;
    this.shadow = null;
    this.root = null;
    this.body = null;
    this.noticeEl = null;
  }

  get isVisible() {
    return Boolean(this.host && !this.host.hidden);
  }

  mount() {
    if (this.host) return;
    this.host = document.createElement('div');
    this.host.id = HOST_ID;
    this.shadow = this.host.attachShadow({ mode: 'open' });
    this.shadow.append(h('style', { text: STYLE }));

    this.root = h('div', { class: 'panel' });
    const closeBtn = h('button', {
      type: 'button',
      text: '关闭',
      onClick: () => this.onClose?.(),
    });
    const applyAllBtn = h('button', {
      type: 'button',
      class: 'primary',
      text: '应用全部',
      onClick: () => this.onApplyAll?.(),
    });

    this.noticeEl = h('div', { class: 'notice' });
    this.noticeEl.hidden = true;

    this.body = h('div', { class: 'list' });

    this.root.append(
      h(
        'div',
        { class: 'head' },
        h('span', { class: 'title', text: 'AI 解题建议' }),
        applyAllBtn,
        closeBtn,
      ),
      this.noticeEl,
      this.body,
      h('div', {
        class: 'foot',
        text: '仅供核对：工具只填写答案，不会提交作业；请自行确认后再提交。',
      }),
    );

    this.shadow.append(this.root);
    // 挂在 documentElement 上而不是 body，避免宿主框架替换 body 时把面板一起移除。
    document.documentElement.append(this.host);
  }

  show() {
    this.mount();
    this.host.hidden = false;
  }

  hide() {
    if (this.host) this.host.hidden = true;
  }

  destroy() {
    this.host?.remove();
    this.host = null;
    this.shadow = null;
    this.root = null;
    this.body = null;
  }

  /**
   * 重新渲染整份列表。
   * @param {object}   params
   * @param {Array}    params.items   [{ question, result }]
   * @param {Set}      params.applied 已成功填入的 questionId
   * @param {string}   [params.notice] 顶部提示
   */
  update({ items = [], applied = new Set(), notice = '' } = {}) {
    this.mount();

    if (this.noticeEl) {
      this.noticeEl.textContent = notice;
      this.noticeEl.hidden = !notice;
    }

    this.body.replaceChildren();

    if (items.length === 0) {
      this.body.append(h('div', { class: 'empty', text: '暂无题目，请先在扩展弹窗中采集。' }));
      return;
    }

    items.forEach((item, index) => {
      this.body.append(this.#buildCard(item, index, applied));
    });
  }

  #buildCard({ question, result }, index, applied) {
    // result 为空表示“已采集但还没请求建议”，此时不应显示成失败。
    const status = result?.status ?? null;
    const badgeClass =
      status === RESULT_STATUS.ANSWERED
        ? 'ok'
        : status === RESULT_STATUS.UNCERTAIN
          ? 'warn'
          : status
            ? 'bad'
            : '';

    const picked = new Set(result?.answer?.optionIds ?? []);

    const optionLines = question.options.map((option) =>
      h('div', {
        class: picked.has(option.optionId) ? 'option picked' : 'option',
        text: `${option.label}. ${option.text}${picked.has(option.optionId) ? '  ✓' : ''}`,
      }),
    );

    const answerText =
      question.type === QUESTION_TYPES.FILL
        ? (result?.answer?.blankAnswers ?? [])
            .map((value, blankIndex) => `第 ${blankIndex + 1} 空：${value}`)
            .join('；')
        : question.options
            .filter((option) => picked.has(option.optionId))
            .map((option) => `${option.label}. ${option.text}`)
            .join('；');

    const isApplied = applied.has(question.questionId);
    const canApply = Boolean(result?.applicable) && !isApplied;

    const applyButton = h('button', {
      class: canApply ? 'apply primary' : 'apply',
      type: 'button',
      text: isApplied ? '已填入' : '应用本题',
      disabled: canApply ? null : 'disabled',
      onClick: () => this.onApply?.(question.questionId),
    });

    return h(
      'div',
      { class: 'card' },
      h(
        'div',
        { class: 'meta' },
        h('span', { text: `第 ${index + 1} 题` }),
        h('span', { class: 'badge', text: TYPE_TEXT[question.type] ?? question.type }),
        h('span', {
          class: `badge ${badgeClass}`.trim(),
          text: status ? STATUS_TEXT[status] ?? status : '未请求',
        }),
        isApplied ? h('span', { class: 'applied', text: '已填入' }) : null,
      ),
      h('div', { class: 'stem', text: question.stem || '（题干为空）' }),
      optionLines,
      result?.status === RESULT_STATUS.ANSWERED && answerText
        ? h('div', { class: 'answer' }, '建议答案：', h('b', { text: answerText }))
        : null,
      result?.explanation
        ? h('div', { class: 'explain', text: `解析：${result.explanation}` })
        : null,
      result?.issues?.length
        ? h('div', { class: 'problems', text: `问题：${result.issues.join('，')}` })
        : null,
      h('div', { class: 'row' }, applyButton),
    );
  }
}
