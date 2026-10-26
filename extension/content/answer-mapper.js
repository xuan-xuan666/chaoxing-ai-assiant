import {
  ALLOWED_RESULT_STATUS,
  QUESTION_TYPES,
  RESULT_STATUS,
} from '../shared/protocol.js';

/**
 * 答案映射与校验（文档第 6 章）。
 *
 * 纯函数实现，不依赖 DOM，也不信任模型输出：
 *   - 先校验批次/快照/请求 ID，不匹配就是 STALE；
 *   - 再按 questionId 映射，绝不用数组下标；
 *   - 最后逐题检查题型、选项存在性、数量与填空个数。
 * 任何一项不合法都标记 INVALID_INPUT 并附 issues，而不是“尽量修一修”。
 */

function emptyAnswer() {
  return { optionIds: [], blankAnswers: [] };
}

function baseResult(question) {
  return {
    questionId: question.questionId,
    type: question.type,
    status: RESULT_STATUS.FAILED,
    answer: emptyAnswer(),
    explanation: '',
    issues: [],
    applicable: false,
  };
}

function staleResult(question) {
  const result = baseResult(question);
  result.status = RESULT_STATUS.STALE;
  result.issues.push('STALE_SNAPSHOT');
  return result;
}

/** 校验单题结果；返回带 issues 与 applicable 的展示用对象。 */
function validateOne(question, raw) {
  const result = baseResult(question);
  result.status = ALLOWED_RESULT_STATUS.includes(raw?.status)
    ? raw.status
    : RESULT_STATUS.FAILED;
  if (!ALLOWED_RESULT_STATUS.includes(raw?.status)) {
    result.issues.push('INVALID_STATUS');
  }
  result.explanation =
    typeof raw?.explanation === 'string' ? raw.explanation : '';

  const answer = raw?.answer ?? {};
  const optionIds = Array.isArray(answer.optionIds)
    ? answer.optionIds.map((id) => String(id))
    : [];
  const blankAnswers = Array.isArray(answer.blankAnswers)
    ? answer.blankAnswers.map((value) => String(value ?? ''))
    : [];

  // 题型必须与采集时一致，否则答案结构没有意义。
  if (raw?.type !== question.type) {
    result.issues.push('TYPE_MISMATCH');
    result.status = RESULT_STATUS.INVALID_INPUT;
    return result;
  }

  // 非 ANSWERED 的结果只展示，不允许应用。
  if (result.status !== RESULT_STATUS.ANSWERED) {
    result.answer = { optionIds, blankAnswers };
    return result;
  }

  const validOptionIds = new Set(
    question.options.map((option) => option.optionId),
  );

  if (question.type === QUESTION_TYPES.SINGLE) {
    if (optionIds.length !== 1) result.issues.push('SINGLE_OPTION_COUNT');
    else if (!validOptionIds.has(optionIds[0])) result.issues.push('UNKNOWN_OPTION');
  } else if (question.type === QUESTION_TYPES.MULTIPLE) {
    if (optionIds.length === 0) result.issues.push('MULTIPLE_OPTION_COUNT');
    if (new Set(optionIds).size !== optionIds.length) {
      result.issues.push('DUPLICATE_OPTION');
    }
    if (optionIds.some((id) => !validOptionIds.has(id))) {
      result.issues.push('UNKNOWN_OPTION');
    }
  } else if (question.type === QUESTION_TYPES.FILL) {
    const expected = question.blanks.length;
    if (expected === 0) result.issues.push('MISSING_BLANK_POSITION');
    else if (blankAnswers.length !== expected) {
      result.issues.push('BLANK_COUNT_MISMATCH');
    }
    if (blankAnswers.some((value) => !String(value).trim())) {
      result.issues.push('EMPTY_BLANK_ANSWER');
    }
  }

  result.answer = { optionIds, blankAnswers };
  if (result.issues.length > 0) {
    result.status = RESULT_STATUS.INVALID_INPUT;
  }
  result.applicable =
    result.status === RESULT_STATUS.ANSWERED && result.issues.length === 0;
  return result;
}

/**
 * 把后端响应映射回当前快照中的题目。
 *
 * @param {object}   params
 * @param {object}   params.response        后端返回的 AnswerBatchResponse
 * @param {object[]} params.questions       当前快照中的题目数组
 * @param {string}   params.pageId          当前 pageId
 * @param {number}   params.snapshotVersion 当前快照版本
 * @param {string}   [params.requestId]     本次请求 ID，用于防止串批
 */
export function validateAndMap({
  response,
  questions,
  pageId,
  snapshotVersion,
  requestId,
}) {
  const errors = [];

  if (!response || typeof response !== 'object') {
    errors.push({ code: 'EMPTY_RESPONSE' });
    return {
      stale: false,
      results: questions.map((question) => ({
        ...baseResult(question),
        issues: ['EMPTY_RESPONSE'],
      })),
      errors,
    };
  }

  // 页面已翻页/重渲染，或响应根本不属于这次请求：整批作废，不做任何兜底匹配。
  const batchMismatch =
    response.pageId !== pageId ||
    Number(response.snapshotVersion) !== Number(snapshotVersion);
  const requestMismatch =
    Boolean(response.requestId) &&
    Boolean(requestId) &&
    response.requestId !== requestId;

  if (batchMismatch || requestMismatch) {
    errors.push({
      code: requestMismatch ? 'REQUEST_MISMATCH' : 'STALE_SNAPSHOT',
    });
    return {
      stale: true,
      results: questions.map(staleResult),
      errors,
    };
  }

  const byId = new Map(questions.map((question) => [question.questionId, question]));
  const seen = new Set();
  const mapped = new Map();

  for (const raw of response.results ?? []) {
    if (!raw?.questionId) {
      errors.push({ code: 'MISSING_QUESTION_ID' });
      continue;
    }
    if (seen.has(raw.questionId)) {
      errors.push({ code: 'DUPLICATE_RESULT', questionId: raw.questionId });
      continue;
    }
    seen.add(raw.questionId);

    const question = byId.get(raw.questionId);
    if (!question) {
      errors.push({ code: 'UNKNOWN_QUESTION_ID', questionId: raw.questionId });
      continue;
    }
    mapped.set(raw.questionId, validateOne(question, raw));
  }

  // 按当前题目顺序输出，缺少结果的题目显式标 FAILED，不隐瞒（文档 9.1）。
  const results = questions.map((question) => {
    const existing = mapped.get(question.questionId);
    if (existing) return existing;
    errors.push({ code: 'MISSING_RESULT', questionId: question.questionId });
    return {
      ...baseResult(question),
      status: RESULT_STATUS.FAILED,
      issues: ['MISSING_RESULT'],
    };
  });

  return { stale: false, results, errors };
}
