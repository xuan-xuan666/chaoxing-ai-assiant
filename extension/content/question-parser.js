import { QUESTION_TYPES } from '../shared/protocol.js';
import { normalizeText, shortId } from '../shared/text.js';

/**
 * 题目解析器：把 DOM 适配器给出的“原始结构”转换成协议里的统一题目对象。
 *
 * 这一层不接触 DOM，因此可以在 Node 里直接跑单元测试（见 tests/）。
 * 关键职责：
 *   - 分配 questionId / optionId 并保证批次内唯一（文档 5.3）；
 *   - 判断题型，识别字段缺失；
 *   - 区分“致命问题”（不能发给后端）与“可继续的警告”。
 */

/** 单次解析中不允许继续处理的问题。 */
const FATAL_ISSUES = new Set([
  'MISSING_STEM',
  'UNKNOWN_TYPE',
  'NOT_ENOUGH_OPTIONS',
  'NO_BLANK_POSITION',
]);

/** 根据 typeHint 与结构推断题型；推断不出就返回 null，而不是猜。 */
export function detectType(raw) {
  if (raw?.typeHint) return raw.typeHint;

  const options = raw?.options ?? [];
  const blanks = raw?.blanks ?? [];

  if (blanks.length > 0 && options.length === 0) return QUESTION_TYPES.FILL;
  return null;
}

/**
 * 分配题目 ID。
 * 页面自带的 ID 可能重复（例如模板渲染），所以必须做唯一性兜底；
 * 没有 domId 时生成带序号的随机 ID：既不依赖题干哈希，也能绑定当前 DOM 条目。
 */
function allocateQuestionId(raw, index, usedIds) {
  const base = normalizeText(raw?.domId) || `q-${index + 1}-${shortId()}`;
  let candidate = base;
  let suffix = 1;
  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

/** 选项 ID 由采集阶段生成（a、b、c…），绝不允许模型自由生成（文档 5.3）。 */
function optionIdFor(questionId, index) {
  const letter = index < 26 ? String.fromCharCode(97 + index) : `x${index}`;
  return `${questionId}-opt-${letter}`;
}

/**
 * 组装单道题。
 *
 * @param {object} raw       dom-adapter.extractRaw() 返回的 raw 部分
 * @param {object} options   { index, usedIds }
 * @returns {{ question: object|null, issues: string[], fatal: boolean }}
 */
export function assembleQuestion(raw, { index = 0, usedIds = new Set() } = {}) {
  const issues = [];
  const stem = normalizeText(raw?.stem);
  if (!stem) issues.push('MISSING_STEM');

  const type = detectType(raw ?? {});
  if (!type) issues.push('UNKNOWN_TYPE');

  // 选项：去掉空文本，保留展示标签；标签重复会被后端拒绝映射，这里提前发现。
  const options = (raw?.options ?? [])
    .map((item, optionIndex) => ({
      optionId: '',
      label: normalizeText(item?.label) || String.fromCharCode(65 + optionIndex),
      text: normalizeText(item?.text),
    }))
    .filter((item) => item.text.length > 0);

  const seenLabels = new Set();
  for (const option of options) {
    if (seenLabels.has(option.label)) issues.push('DUPLICATE_OPTION_LABEL');
    seenLabels.add(option.label);
  }

  const isChoice =
    type === QUESTION_TYPES.SINGLE || type === QUESTION_TYPES.MULTIPLE;
  if (isChoice && options.length < 2) issues.push('NOT_ENOUGH_OPTIONS');

  const blanks = (raw?.blanks ?? []).map((blank, blankIndex) => ({
    blankIndex: Number.isInteger(blank?.blankIndex) ? blank.blankIndex : blankIndex,
  }));
  if (type === QUESTION_TYPES.FILL && blanks.length === 0) {
    issues.push('NO_BLANK_POSITION');
  }

  if (!type || !stem) {
    // 致命问题不产出题目对象，避免把残缺数据发给模型后得到“看起来很像”的错误答案。
    return { question: null, issues, fatal: true };
  }

  const questionId = allocateQuestionId(raw, index, usedIds);
  options.forEach((option, optionIndex) => {
    option.optionId = optionIdFor(questionId, optionIndex);
  });

  const fatal = issues.some((issue) => FATAL_ISSUES.has(issue));

  return {
    question: {
      questionId,
      type,
      stem,
      options,
      blanks,
      // 图片/公式/代码等辅助信息：模型看不到原图，后端可据此降级为“需人工”。
      media: raw?.flags ?? {},
    },
    issues,
    fatal,
  };
}
