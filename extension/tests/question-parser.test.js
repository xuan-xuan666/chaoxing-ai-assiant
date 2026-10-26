import test from 'node:test';
import assert from 'node:assert/strict';

import { QUESTION_TYPES, RESULT_STATUS } from '../shared/protocol.js';
import { assembleQuestion, detectType } from '../content/question-parser.js';

const singleRaw = {
  domId: 'q1',
  stem: '  Java 中哪个关键字用于继承类？ ',
  options: [
    { label: 'A', text: 'implements' },
    { label: 'B', text: 'extends' },
  ],
  blanks: [],
  typeHint: QUESTION_TYPES.SINGLE,
};

test('选择题：清理题干、按顺序生成 optionId', () => {
  const { question, issues, fatal } = assembleQuestion(singleRaw, { index: 0 });

  assert.equal(fatal, false);
  assert.deepEqual(issues, []);
  assert.equal(question.questionId, 'q1');
  // 首尾空格必须被归一化，否则同一题干会被当成不同题。
  assert.equal(question.stem, 'Java 中哪个关键字用于继承类？');
  assert.deepEqual(
    question.options.map((option) => option.optionId),
    ['q1-opt-a', 'q1-opt-b'],
  );
});

test('重复的页面 ID 会自动加后缀，保证批次内唯一', () => {
  const usedIds = new Set();
  const first = assembleQuestion(singleRaw, { index: 0, usedIds });
  const second = assembleQuestion(singleRaw, { index: 1, usedIds });

  assert.equal(first.question.questionId, 'q1');
  assert.equal(second.question.questionId, 'q1-1');
  assert.notEqual(
    first.question.options[0].optionId,
    second.question.options[0].optionId,
  );
});

test('题干为空是致命问题，不产出题目对象', () => {
  const { question, issues, fatal } = assembleQuestion(
    { ...singleRaw, stem: '   ' },
    { index: 0 },
  );

  assert.equal(question, null);
  assert.equal(fatal, true);
  assert.ok(issues.includes('MISSING_STEM'));
});

test('没有 typeHint 且结构无法判断时返回 UNKNOWN_TYPE', () => {
  const { fatal, issues } = assembleQuestion(
    { stem: '某道题', options: [{ label: 'A', text: 'x' }], blanks: [] },
    { index: 0 },
  );

  assert.equal(fatal, true);
  assert.ok(issues.includes('UNKNOWN_TYPE'));
});

test('填空题：没有 typeHint 时可由“只有空位”推断', () => {
  const type = detectType({
    options: [],
    blanks: [{ blankIndex: 0 }, { blankIndex: 1 }],
  });
  assert.equal(type, QUESTION_TYPES.FILL);
});

test('填空题没有空位时报 NO_BLANK_POSITION', () => {
  const { fatal, issues } = assembleQuestion(
    { stem: '入口方法是 ____', options: [], blanks: [], typeHint: QUESTION_TYPES.FILL },
    { index: 0 },
  );

  assert.equal(fatal, true);
  assert.ok(issues.includes('NO_BLANK_POSITION'));
});

test('选项不足两个的选择题被标记为致命问题', () => {
  const { fatal, issues } = assembleQuestion(
    {
      stem: '只有一个选项的题',
      options: [{ label: 'A', text: '唯一选项' }],
      blanks: [],
      typeHint: QUESTION_TYPES.SINGLE,
    },
    { index: 0 },
  );

  assert.equal(fatal, true);
  assert.ok(issues.includes('NOT_ENOUGH_OPTIONS'));
});

test('空文本选项会被丢弃，不参与后续映射', () => {
  const { question } = assembleQuestion(
    {
      stem: '带空选项的题',
      options: [
        { label: 'A', text: '  ' },
        { label: 'B', text: 'extends' },
        { label: 'C', text: 'super' },
      ],
      blanks: [],
      typeHint: QUESTION_TYPES.SINGLE,
    },
    { index: 0 },
  );

  assert.equal(question.options.length, 2);
});
