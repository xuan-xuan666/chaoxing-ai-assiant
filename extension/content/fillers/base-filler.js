/**
 * 填充器基类与共享工具。
 *
 * 独立成文件是为了避免循环依赖：
 * answer-filler.js 需要用工厂创建各题型子类，而子类又要继承基类，
 * 若基类写在工厂文件里就会形成 ESM 循环引用（类在初始化前被 extends）。
 */

export class AnswerFiller {
  supports(_question, _result) {
    return false;
  }

  preview(question, result) {
    return {
      questionId: question.questionId,
      text: this.describe(question, result),
    };
  }

  describe(_question, _result) {
    return '';
  }

  /**
   * 只有在用户明确确认、且页面适配经过验证时才实现受控交互。
   * 约定：本方法只填写答案，永远不点击提交。
   */
  async applyConfirmed(_question, _result, _refs) {
    throw new Error('由具体题型适配器实现');
  }
}

/** 在题目选项里找到 optionId 对应的下标，找不到返回 -1。 */
export function optionIndex(question, optionId) {
  return question.options.findIndex((option) => option.optionId === optionId);
}
