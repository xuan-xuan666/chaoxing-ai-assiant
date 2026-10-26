import { QUESTION_TYPES } from '../../shared/protocol.js';
import { AnswerFiller } from './base-filler.js';
import {
  fail,
  ok,
  readValue,
  setEditableText,
  setNativeValue,
} from './control-utils.js';

/**
 * 填空题填充器。
 *
 * 两个易错点：
 *   1. 输入框数量与答案数量必须一致，否则宁可失败也不要把答案错位填进去；
 *   2. 富文本填空（contenteditable）不能设 value，必须写 textContent 并派发 input。
 */
export class FillBlankFiller extends AnswerFiller {
  supports(question, result) {
    return question.type === QUESTION_TYPES.FILL && result.type === QUESTION_TYPES.FILL;
  }

  describe(_question, result) {
    return result.answer.blankAnswers
      .map((answer, index) => `第 ${index + 1} 空：${answer}`)
      .join('；');
  }

  async applyConfirmed(question, result, refs) {
    const answers = result.answer.blankAnswers;
    const controls = refs.blankControls ?? [];

    // 数量不一致时直接放弃：错位填入比不填更危险。
    if (answers.length !== controls.length) {
      return fail(
        `答案数量（${answers.length}）与页面填空数量（${controls.length}）不一致，已跳过`,
      );
    }
    if (controls.length === 0) return fail('未找到填空控件');

    const problems = [];

    for (let index = 0; index < controls.length; index += 1) {
      const control = controls[index];
      const answer = answers[index];
      if (!control?.el) {
        problems.push(`第 ${index + 1} 空无控件`);
        continue;
      }

      if (control.kind === 'contenteditable' || control.el.isContentEditable) {
        setEditableText(control.el, answer);
      } else {
        setNativeValue(control.el, answer);
      }

      // 回读校验：框架没接住事件时这里会暴露出来。
      if (String(readValue(control.el)).trim() !== String(answer).trim()) {
        problems.push(`第 ${index + 1} 空未写入`);
      }
    }

    if (problems.length > 0) return fail(problems.join('，'));
    return ok(`已填入 ${controls.length} 个空`);
  }
}
