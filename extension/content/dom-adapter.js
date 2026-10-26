import { QUESTION_TYPES } from '../shared/protocol.js';
import { normalizeText, splitLabel } from '../shared/text.js';

/**
 * DOM 适配器：整个扩展里唯一接触“页面结构”的模块。
 *
 * 设计约束（文档 2.2 / 3.2）：
 *   1. 选择器集中在这里，业务代码不允许出现 querySelector；
 *   2. 匹配不到结构时返回“不支持”，绝不猜测生成题目；
 *   3. 只读取题目必需信息，不碰 Cookie、登录态、账号数据。
 *
 * 这份实现刻意保持“结构启发式”而不针对某个站点硬编码：
 * 先按语义类名找容器，再用控件类型判定题型，最后把 DOM 引用留在 refs 里，
 * 由填充器在用户确认后使用。
 */

/** 题目容器候选选择器，按可信度从高到低尝试。 */
export const CANDIDATE_SELECTORS = [
  '[data-question]',
  '.question-item',
  '.question',
  '.que-item',
  '.subject',
  '.exam-question',
  '.topic-item',
  '.q-item',
  '.question-box',
];

/** 题干候选选择器。 */
const STEM_SELECTORS = [
  '[data-stem]',
  '.question-title',
  '.question-stem',
  '.stem',
  '.q-title',
  '.mark_name',
  'dt',
  'h3',
  'h4',
  '.title',
];

/** 选项容器候选选择器（含自定义 div 选项的情况）。 */
const OPTION_CONTAINER_SELECTOR =
  '[data-option], .option-item, .option, .answer-item, .choice-item';

/** 选项控件：原生 input 与 ARIA 自定义控件都算。 */
const OPTION_INPUT_SELECTOR =
  'input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"]';

/** 填空控件。注意 input:not([type]) 在 HTML 里等同于 text。 */
const BLANK_SELECTOR =
  'input[type="text"], input:not([type]), textarea, [contenteditable="true"]';

/**
 * 去掉“包含关系”带来的重复节点。
 * 例如 .question 与它内部的 .question-item 同时命中选择器时，只保留外层。
 */
function dedupeNested(nodes) {
  return nodes.filter(
    (node) => !nodes.some((other) => other !== node && other.contains(node)),
  );
}

/** 判断一个节点是否像“一道题”，而不是导航、页脚之类的干扰块。 */
function looksLikeQuestion(node) {
  if (!node) return false;
  const text = normalizeText(node.textContent);
  if (text.length < 2) return false;
  // 必须至少有一个可识别的作答控件或选项容器，否则不认为是题目。
  return Boolean(
    node.querySelector(OPTION_INPUT_SELECTOR) ||
      node.querySelector(BLANK_SELECTOR) ||
      node.querySelector(OPTION_CONTAINER_SELECTOR),
  );
}

/**
 * 查找当前页面中的所有题目节点。
 * 返回空数组表示“结构不支持”，调用方应提示用户而不是发送空批次。
 */
export function findQuestionNodes(root = document) {
  for (const selector of CANDIDATE_SELECTORS) {
    const usable = dedupeNested([...root.querySelectorAll(selector)]).filter(
      looksLikeQuestion,
    );
    if (usable.length > 0) return usable;
  }

  // 兜底：页面没有稳定类名时，从选项控件向上回溯最近的语义容器。
  // 这里刻意不使用 closest('div')，避免把整页内容误当成一道题。
  const controls = [...root.querySelectorAll(OPTION_INPUT_SELECTOR)];
  const containers = dedupeNested(
    controls
      .map(
        (control) =>
          control.closest(
            'li, .question-item, .question, .que-item, .subject, .topic-item',
          ) || null,
      )
      .filter(Boolean),
  );
  return containers.filter(looksLikeQuestion);
}

/** 找题干元素：跳过选项容器内部的节点，避免把选项文字混进题干。 */
function pickStemElement(node) {
  for (const selector of STEM_SELECTORS) {
    for (const element of node.querySelectorAll(selector)) {
      if (element.closest(OPTION_CONTAINER_SELECTOR)) continue;
      if (normalizeText(element.textContent).length >= 2) return element;
    }
  }
  return null;
}

/**
 * 生成题干文本。
 * 图片/公式题的 alt 文本对模型判断很关键，这里会追加为 [图片: alt]；
 * 无法表达时不假装能读懂，交给后端标记为需要人工处理。
 */
function buildStemText(node, stemElement) {
  if (stemElement) {
    const imageAlt = [...stemElement.querySelectorAll('img')]
      .map((img) => normalizeText(img.getAttribute('alt')))
      .filter(Boolean)
      .map((alt) => `[图片: ${alt}]`)
      .join(' ');
    const base = normalizeText(stemElement.textContent);
    return normalizeText([base, imageAlt].filter(Boolean).join(' '));
  }

  // 没有明确题干节点时，退化为“第一个不含作答控件的子块”。
  const block = [...node.children].find(
    (child) =>
      !child.querySelector(OPTION_INPUT_SELECTOR) &&
      !child.matches(OPTION_CONTAINER_SELECTOR) &&
      normalizeText(child.textContent).length >= 2,
  );
  return block ? normalizeText(block.textContent) : '';
}

/** 从一个选项容器里拆出展示标签、选项文本与可点击控件。 */
function buildOption(container, control, index) {
  const input = control instanceof HTMLInputElement ? control : null;

  // 单独渲染的标签节点（如 <span class="option-label">A.</span>）会污染 textContent，
  // 先把它的文字扣掉，再交给 splitLabel 处理一次。
  const labelElement = container.querySelector(
    '[data-label], .option-label, .label, .num, .option-index',
  );
  let text = container.textContent || '';
  if (labelElement) {
    text = text.replace(labelElement.textContent, ' ');
  }
  const parsed = splitLabel(text);

  const rawLabel = normalizeText(
    container.getAttribute('data-label') ||
      labelElement?.textContent ||
      parsed.label ||
      '',
  ).replace(/[.、．:：)）\s]/g, '');

  return {
    option: {
      label: (rawLabel || String.fromCharCode(65 + index)).toUpperCase(),
      text: parsed.text,
    },
    control: {
      container,
      input,
      // 点击 label 比直接点 input 更接近真实用户行为，也能兼容被样式隐藏的 input。
      clickTarget: container.querySelector('label') || control || container,
      role: input ? null : control?.getAttribute('role') || null,
    },
  };
}

/** 采集选项：优先跟随原生控件，其次才用语义类名。 */
function collectOptions(node) {
  const controls = [...node.querySelectorAll(OPTION_INPUT_SELECTOR)];

  if (controls.length > 0) {
    const seen = new Set();
    const collected = [];
    for (const control of controls) {
      // 同一个选项可能同时命中 input 和 [role=radio]，用容器去重。
      const container =
        control.closest(OPTION_CONTAINER_SELECTOR) ||
        control.closest('li, label') ||
        control.parentElement;
      if (!container || seen.has(container)) continue;
      seen.add(container);
      collected.push(buildOption(container, control, collected.length));
    }
    return {
      options: collected.map((item) => item.option),
      controls: collected.map((item) => item.control),
    };
  }

  // 没有原生控件时只能依赖语义类名；此时 typeHint 为 null，解析器会标记为不支持，
  // 而不是猜一个题型出来。
  const containers = dedupeNested([
    ...node.querySelectorAll(OPTION_CONTAINER_SELECTOR),
  ]);
  const collected = containers.map((container, index) =>
    buildOption(container, null, index),
  );
  return {
    options: collected.map((item) => item.option),
    controls: collected.map((item) => item.control),
  };
}

/** 采集填空控件，并排除落在选项内部的输入框（例如选项里的自定义输入）。 */
function collectBlanks(node, optionContainers) {
  return [...node.querySelectorAll(BLANK_SELECTOR)]
    .filter(
      (element) => !optionContainers.some((container) => container.contains(element)),
    )
    .map((element) => {
      let kind = 'input';
      if (element.tagName === 'TEXTAREA') kind = 'textarea';
      else if (element.isContentEditable) kind = 'contenteditable';
      return { el: element, kind };
    });
}

/** 根据控件类型推断题型；无法确定时返回 null，交由解析器报 UNKNOWN_TYPE。 */
function detectTypeHint(optionControls, blankControls) {
  const roleOf = (control) =>
    control.input?.type || control.role || control.clickTarget?.getAttribute('role');

  if (optionControls.some((control) => roleOf(control) === 'checkbox')) {
    return QUESTION_TYPES.MULTIPLE;
  }
  if (optionControls.some((control) => roleOf(control) === 'radio')) {
    return QUESTION_TYPES.SINGLE;
  }
  if (blankControls.length > 0 && optionControls.length === 0) {
    return QUESTION_TYPES.FILL;
  }
  return null;
}

/** 记录影响作答的辅助内容，供后端判断是否需要人工处理。 */
function detectMediaFlags(node) {
  return {
    hasImage: Boolean(node.querySelector('img')),
    hasCode: Boolean(node.querySelector('pre, code')),
    hasTable: Boolean(node.querySelector('table')),
  };
}

/**
 * 把单个题目节点解析成“纯数据 + DOM 引用”两部分：
 *   - raw  会被序列化成 JSON 发给后端，不能包含任何 DOM 对象；
 *   - refs 只留在浏览器内存里，填充阶段按索引与题目选项对应。
 */
export function extractRaw(node) {
  const stemElement = pickStemElement(node);
  const { options, controls } = collectOptions(node);
  const blankControls = collectBlanks(
    node,
    controls.map((control) => control.container),
  );

  return {
    raw: {
      // 页面自带的稳定 ID 优先；没有就由解析器生成 UUID 绑定当前 DOM 节点。
      domId: node.getAttribute('data-question-id') || node.id || null,
      stem: buildStemText(node, stemElement),
      options,
      blanks: blankControls.map((blank, index) => ({
        blankIndex: index,
        kind: blank.kind,
      })),
      typeHint: detectTypeHint(controls, blankControls),
      flags: detectMediaFlags(node),
    },
    refs: {
      node,
      optionControls: controls,
      blankControls,
    },
  };
}
