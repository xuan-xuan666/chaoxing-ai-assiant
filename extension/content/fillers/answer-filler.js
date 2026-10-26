import { QUESTION_TYPES } from '../../shared/protocol.js';
import { MultipleChoiceFiller } from './multiple-choice-filler.js';
import { FillBlankFiller } from './fill-blank-filler.js';
import { SingleChoiceFiller } from './single-choice-filler.js';

export { AnswerFiller, optionIndex } from './base-filler.js';

/**
 * 填充器工厂：按题型分发到独立适配器。
 * 新增题型只需要加一个子类并在这里注册，不用改内容脚本主流程。
 */
export function createFiller(type) {
  switch (type) {
    case QUESTION_TYPES.SINGLE:
      return new SingleChoiceFiller();
    case QUESTION_TYPES.MULTIPLE:
      return new MultipleChoiceFiller();
    case QUESTION_TYPES.FILL:
      return new FillBlankFiller();
    default:
      throw new Error(`不支持的题型：${type}`);
  }
}
