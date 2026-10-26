import { QUESTION_TYPES, RESULT_STATUS } from '../shared/protocol.js';

/**
 * 内置模拟解题服务。
 *
 * 后端尚未搭建时，用它替代真实接口，好处有三点：
 *   1. 前端整条链路（请求协议、状态、校验、回填）可以立刻验证；
 *   2. 故意把结果顺序倒过来返回，用来验证“按 questionId 映射而非数组下标”；
 *   3. 输出结构与真实后端完全一致，将来换成 SpringBoot 不用改前端。
 *
 * 注意：这里给的是固定占位答案，不具备任何解题能力，仅用于联调。
 */

function chooseSingle(question) {
  const preferred =
    question.options.find((option) => option.label === 'B') ?? question.options[0];
  return preferred ? [preferred.optionId] : [];
}

function chooseMultiple(question) {
  return question.options.slice(0, 2).map((option) => option.optionId);
}

/** 生成单题模拟结果；结构严格对齐设计文档 5.4。 */
function buildResult(question) {
  // 图片/公式题在模拟服务里明确返回“不确定”，演示降级路径。
  if (question.media?.hasImage) {
    return {
      questionId: question.questionId,
      type: question.type,
      status: RESULT_STATUS.UNCERTAIN,
      answer: { optionIds: [], blankAnswers: [] },
      explanation: '（模拟数据）题目含图片，模拟服务不猜测图片内容。',
    };
  }

  if (question.type === QUESTION_TYPES.SINGLE) {
    const optionIds = chooseSingle(question);
    return {
      questionId: question.questionId,
      type: question.type,
      status: optionIds.length === 1 ? RESULT_STATUS.ANSWERED : RESULT_STATUS.UNCERTAIN,
      answer: { optionIds, blankAnswers: [] },
      explanation: '（模拟数据）按题型随机选中一个选项，仅用于联调回填流程。',
    };
  }

  if (question.type === QUESTION_TYPES.MULTIPLE) {
    const optionIds = chooseMultiple(question);
    return {
      questionId: question.questionId,
      type: question.type,
      status: optionIds.length > 0 ? RESULT_STATUS.ANSWERED : RESULT_STATUS.UNCERTAIN,
      answer: { optionIds, blankAnswers: [] },
      explanation: '（模拟数据）取前两个选项，仅用于联调回填流程。',
    };
  }

  if (question.type === QUESTION_TYPES.FILL) {
    const blankAnswers = question.blanks.map(
      (_blank, index) => `示例答案${index + 1}`,
    );
    return {
      questionId: question.questionId,
      type: question.type,
      status:
        blankAnswers.length === question.blanks.length && blankAnswers.length > 0
          ? RESULT_STATUS.ANSWERED
          : RESULT_STATUS.UNCERTAIN,
      answer: { optionIds: [], blankAnswers },
      explanation: '（模拟数据）为每个空生成占位答案，仅用于联调回填流程。',
    };
  }

  return {
    questionId: question.questionId,
    type: question.type,
    status: RESULT_STATUS.FAILED,
    answer: { optionIds: [], blankAnswers: [] },
    explanation: '（模拟数据）不支持的题型。',
  };
}

/** 入口：返回与后端一致的 AnswerBatchResponse。 */
export function solveWithMock(request) {
  const results = request.questions.map(buildResult).reverse(); // 故意乱序

  return {
    requestId: request.requestId,
    pageId: request.pageId,
    snapshotVersion: request.snapshotVersion,
    results,
    errors: [],
  };
}
