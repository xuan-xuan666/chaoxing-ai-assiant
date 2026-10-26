package com.work1.backend.dto;

/**
 * 单题结果。字段顺序与设计文档 5.4 一致。
 *
 * confidence 固定为 null：模型自报置信度不等于真实正确率，第一版不依赖它做任何决策。
 */
public record QuestionResultDto(
        String questionId,
        String type,
        String status,
        AnswerDto answer,
        String explanation,
        Double confidence
) {
    public QuestionResultDto {
        answer = answer == null ? AnswerDto.empty() : answer;
        explanation = explanation == null ? "" : explanation;
    }
}
