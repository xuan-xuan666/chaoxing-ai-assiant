package com.work1.backend.dto;

import java.util.List;

/**
 * 答案载荷。选择题填 optionIds，填空题填 blankAnswers，二者互斥。
 */
public record AnswerDto(
        List<String> optionIds,
        List<String> blankAnswers
) {
    public AnswerDto {
        optionIds = optionIds == null ? List.of() : List.copyOf(optionIds);
        blankAnswers = blankAnswers == null ? List.of() : List.copyOf(blankAnswers);
    }

    public static AnswerDto empty() {
        return new AnswerDto(List.of(), List.of());
    }
}
