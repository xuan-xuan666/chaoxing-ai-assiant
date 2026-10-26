package com.work1.backend.dto;

import com.work1.backend.model.ResultStatus;

import java.util.List;

/**
 * 结果对象工厂。
 *
 * 集中构造 QuestionResultDto，保证状态与载荷组合在所有分支上一致：
 * 只有 ANSWERED 才携带选项/填空答案，其余状态一律不携带可用答案。
 */
public final class QuestionResults {

    private QuestionResults() {
    }

    public static QuestionResultDto answered(String questionId,
                                             String type,
                                             List<String> optionIds,
                                             List<String> blankAnswers,
                                             String explanation) {
        return new QuestionResultDto(
                questionId,
                type,
                ResultStatus.ANSWERED.name(),
                new AnswerDto(optionIds, blankAnswers),
                explanation,
                null
        );
    }

    public static QuestionResultDto uncertain(String questionId, String type, String explanation) {
        return simple(questionId, type, ResultStatus.UNCERTAIN, explanation);
    }

    public static QuestionResultDto invalid(String questionId, String type, String explanation) {
        return simple(questionId, type, ResultStatus.INVALID_INPUT, explanation);
    }

    public static QuestionResultDto failed(String questionId, String type, String explanation) {
        return simple(questionId, type, ResultStatus.FAILED, explanation);
    }

    private static QuestionResultDto simple(String questionId,
                                            String type,
                                            ResultStatus status,
                                            String explanation) {
        return new QuestionResultDto(
                questionId,
                type,
                status.name(),
                AnswerDto.empty(),
                explanation,
                null
        );
    }
}
