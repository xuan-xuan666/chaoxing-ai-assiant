import test from 'node:test';
import assert from 'node:assert/strict';

import { QUESTION_TYPES, RESULT_STATUS } from '../shared/protocol.js';
import { validateAndMap } from '../content/answer-mapper.js';

const SINGLE = {
  questionId: 'q1',
  type: QUESTION_TYPES.SINGLE,
  stem: '哪个关键字用于继承？',
  options: [
    { optionId: 'q1-opt-a', label: 'A', text: 'implements' },
    { optionId: 'q1-opt-b', label: 'B', text: 'extends' },
  ],
  blanks: [],
  media: {},
};

const MULTI = {
  questionId: 'q2',
  type: QUESTION_TYPES.MULTIPLE,
  stem: '哪些是集合接口？',
  options: [
    { optionId: 'q2-opt-a', label: 'A', text: 'List' },
    { optionId: 'q2-opt-b', label: 'B', text: 'HashMap' },
    { optionId: 'q2-opt-c', label: 'C', text: 'Set' },
  ],
  blanks: [],
  media: {},
};

const FILL = {
  questionId: 'q3',
  type: QUESTION_TYPES.FILL,
  stem: '入口方法是 ____，返回类型是 ____。',
  options: [],
  blanks: [{ blankIndex: 0 }, { blankIndex: 1 }],
  media: {},
};

const QUESTIONS = [SINGLE, MULTI, FILL];
const PAGE = { pageId: 'page-1', snapshotVersion: 2, requestId: 'req-1' };

function answered(questionId, type, answer) {
  return {
    questionId,
    type,
    status: RESULT_STATUS.ANSWERED,
    answer,
    explanation: '测试数据',
  };
}

function baseResults() {
  return [
    answered('q1', QUESTION_TYPES.SINGLE, {
      optionIds: ['q1-opt-b'],
      blankAnswers: [],
    }),
    answered('q2', QUESTION_TYPES.MULTIPLE, {
      optionIds: ['q2-opt-a', 'q2-opt-c'],
      blankAnswers: [],
    }),
    answered('q3', QUESTION_TYPES.FILL, {
      optionIds: [],
      blankAnswers: ['main', 'void'],
    }),
  ];
}

function response(overrides = {}) {
  return {
    requestId: 'req-1',
    pageId: 'page-1',
    snapshotVersion: 2,
    results: baseResults(),
    errors: [],
    ...overrides,
  };
}

function run(resp, extra = {}) {
  return validateAndMap({ response: resp, questions: QUESTIONS, ...PAGE, ...extra });
}

test('模型结果乱序返回时，仍按 questionId 正确映射', () => {
  const resp = response({ results: [...baseResults()].reverse() });
  const { results, errors } = run(resp);

  assert.deepEqual(errors, []);
  // 输出顺序始终跟随当前题目顺序，而不是响应顺序。
  assert.deepEqual(
    results.map((result) => result.questionId),
    ['q1', 'q2', 'q3'],
  );
  assert.deepEqual(results[0].answer.optionIds, ['q1-opt-b']);
  assert.deepEqual(results[1].answer.optionIds, ['q2-opt-a', 'q2-opt-c']);
  assert.deepEqual(results[2].answer.blankAnswers, ['main', 'void']);
  assert.ok(results.every((result) => result.applicable));
});

test('pageId 不一致时整批标记 STALE，且不可应用', () => {
  const { stale, results } = run(response({ pageId: 'page-2' }));

  assert.equal(stale, true);
  assert.ok(results.every((result) => result.status === RESULT_STATUS.STALE));
  assert.ok(results.every((result) => result.applicable === false));
});

test('snapshotVersion 不一致时标记 STALE', () => {
  const { stale } = run(response({ snapshotVersion: 1 }));
  assert.equal(stale, true);
});

test('requestId 不一致时拒绝应用（防止串批）', () => {
  const { stale, errors } = run(response({ requestId: 'req-other' }));

  assert.equal(stale, true);
  assert.deepEqual(errors, [{ code: 'REQUEST_MISMATCH' }]);
});

test('响应中出现未知 questionId 时记录错误并忽略', () => {
  const extra = answered('q-unknown', QUESTION_TYPES.SINGLE, {
    optionIds: ['q-unknown-opt-a'],
    blankAnswers: [],
  });
  const { errors } = run(response({ results: [...baseResults(), extra] }));

  assert.ok(
    errors.some(
      (error) =>
        error.code === 'UNKNOWN_QUESTION_ID' && error.questionId === 'q-unknown',
    ),
  );
});

test('同一题目出现重复结果时只保留第一条', () => {
  const duplicated = answered('q1', QUESTION_TYPES.SINGLE, {
    optionIds: ['q1-opt-a'],
    blankAnswers: [],
  });
  const { results, errors } = run(
    response({ results: [...baseResults(), duplicated] }),
  );

  assert.ok(errors.some((error) => error.code === 'DUPLICATE_RESULT'));
  assert.deepEqual(results[0].answer.optionIds, ['q1-opt-b']);
});

test('缺少某题结果时显式标记 FAILED，不静默丢弃', () => {
  const { results, errors } = run(
    response({ results: baseResults().slice(0, 2) }),
  );

  assert.ok(errors.some((error) => error.code === 'MISSING_RESULT'));
  assert.equal(results[2].status, RESULT_STATUS.FAILED);
  assert.deepEqual(results[2].issues, ['MISSING_RESULT']);
});

test('单选题返回两个选项时判为非法', () => {
  const bad = answered('q1', QUESTION_TYPES.SINGLE, {
    optionIds: ['q1-opt-a', 'q1-opt-b'],
    blankAnswers: [],
  });
  const { results } = run(response({ results: [bad, ...baseResults().slice(1)] }));

  assert.equal(results[0].status, RESULT_STATUS.INVALID_INPUT);
  assert.ok(results[0].issues.includes('SINGLE_OPTION_COUNT'));
  assert.equal(results[0].applicable, false);
});

test('模型编造不存在的 optionId 会被拦截', () => {
  const bad = answered('q1', QUESTION_TYPES.SINGLE, {
    optionIds: ['q1-opt-z'],
    blankAnswers: [],
  });
  const { results } = run(response({ results: [bad, ...baseResults().slice(1)] }));

  assert.equal(results[0].status, RESULT_STATUS.INVALID_INPUT);
  assert.ok(results[0].issues.includes('UNKNOWN_OPTION'));
});

test('多选题重复选项会被拦截', () => {
  const bad = answered('q2', QUESTION_TYPES.MULTIPLE, {
    optionIds: ['q2-opt-a', 'q2-opt-a'],
    blankAnswers: [],
  });
  const { results } = run(
    response({ results: [baseResults()[0], bad, baseResults()[2]] }),
  );

  assert.ok(results[1].issues.includes('DUPLICATE_OPTION'));
  assert.equal(results[1].applicable, false);
});

test('填空答案数量与空位数不一致时拦截', () => {
  const bad = answered('q3', QUESTION_TYPES.FILL, {
    optionIds: [],
    blankAnswers: ['main'],
  });
  const { results } = run(
    response({ results: [...baseResults().slice(0, 2), bad] }),
  );

  assert.ok(results[2].issues.includes('BLANK_COUNT_MISMATCH'));
  assert.equal(results[2].applicable, false);
});

test('题型与采集结果不一致时拦截', () => {
  const bad = answered('q1', QUESTION_TYPES.MULTIPLE, {
    optionIds: ['q1-opt-b'],
    blankAnswers: [],
  });
  const { results } = run(response({ results: [bad, ...baseResults().slice(1)] }));

  assert.ok(results[0].issues.includes('TYPE_MISMATCH'));
  assert.equal(results[0].status, RESULT_STATUS.INVALID_INPUT);
});

test('UNCERTAIN 结果会保留展示，但不可应用', () => {
  const uncertain = {
    questionId: 'q1',
    type: QUESTION_TYPES.SINGLE,
    status: RESULT_STATUS.UNCERTAIN,
    answer: { optionIds: [], blankAnswers: [] },
    explanation: '信息不足',
  };
  const { results } = run(
    response({ results: [uncertain, ...baseResults().slice(1)] }),
  );

  assert.equal(results[0].status, RESULT_STATUS.UNCERTAIN);
  assert.equal(results[0].applicable, false);
  assert.equal(results[0].explanation, '信息不足');
});
