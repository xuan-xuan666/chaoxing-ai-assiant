import { QUESTION_TYPES } from '../../shared/protocol.js';
import { AnswerFiller, optionIndex } from './base-filler.js';
import { clickControl, fail, isChecked, nextTick, ok } from './control-utils.js';

/**
 * 单选题填充器。
 * 只点一次、点完回读，未选中就报失败——不做“多试几次直到选上”的猜测。
 */
export class SingleChoiceFiller extends AnswerFiller {
  supports(question, result) {
    return (
      question.type === QUESTION_TYPES.SINGLE &&
      result.type === QUESTION_TYPES.SINGLE
    );
  }

  describe(question, result) {
    const index = optionIndex(question, result.answer.optionIds[0]);
    if (index < 0) return '答案选项不存在';
    const option = question.options[index];
    return `${option.label}. ${option.text}`;
  }

  async applyConfirmed(question, result, refs) {
    const index = optionIndex(question, result.answer.optionIds[0]);
    if (index < 0) return fail('答案中的选项不在当前页面');

    const control = refs.optionControls[index];
    if (!control) return fail('未找到对应的选项控件，页面结构可能已变化');

    // 已经选中就不要重复点击，避免某些页面把再次点击当作取消。
    if (!isChecked(control)) clickControl(control);

    await nextTick();
    if (!isChecked(control)) {
      return fail('点击后选项仍未选中，可能需要手动选择');
    }
    return ok(`已选择 ${question.options[index].label}`);
  }
}
