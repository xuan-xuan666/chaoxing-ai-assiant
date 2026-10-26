import { QUESTION_TYPES } from '../../shared/protocol.js';
import { AnswerFiller, optionIndex } from './base-filler.js';
import { clickControl, fail, isChecked, nextTick, ok } from './control-utils.js';

/**
 * 多选题填充器。
 *
 * 多选的关键是“对齐状态”而不是“只点答案”：
 * 页面上可能残留用户之前勾选的选项，如果只补点答案里的项，
 * 最终提交的集合会比答案多。因此这里对每个选项都做一次状态收敛。
 */
export class MultipleChoiceFiller extends AnswerFiller {
  supports(question, result) {
    return (
      question.type === QUESTION_TYPES.MULTIPLE &&
      result.type === QUESTION_TYPES.MULTIPLE
    );
  }

  describe(question, result) {
    return result.answer.optionIds
      .map((optionId) => {
        const index = optionIndex(question, optionId);
        if (index < 0) return '未知选项';
        const option = question.options[index];
        return `${option.label}. ${option.text}`;
      })
      .join('；');
  }

  async applyConfirmed(question, result, refs) {
    const wanted = new Set(result.answer.optionIds);
    const problems = [];
    let changed = 0;

    for (let index = 0; index < question.options.length; index += 1) {
      const option = question.options[index];
      const control = refs.optionControls[index];
      if (!control) {
        problems.push(`${option.label} 未找到控件`);
        continue;
      }

      const shouldCheck = wanted.has(option.optionId);
      const checked = isChecked(control);

      // 需要选但没选 → 点；不需要选但被选 → 再点一次取消。
      if (shouldCheck !== checked) {
        clickControl(control);
        changed += 1;
      }
    }

    if (changed > 0) await nextTick();

    // 回读全部选项，确保页面状态与答案集合完全一致。
    for (let index = 0; index < question.options.length; index += 1) {
      const option = question.options[index];
      const control = refs.optionControls[index];
      if (!control) continue;
      if (isChecked(control) !== wanted.has(option.optionId)) {
        problems.push(`${option.label} 状态未生效`);
      }
    }

    if (problems.length > 0) {
      return fail(`部分选项未能填入：${problems.join('，')}`);
    }
    return ok(`已选择 ${wanted.size} 个选项`);
  }
}
