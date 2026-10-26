package com.work1.backend.ai;

import com.work1.backend.dto.BatchErrorDto;
import com.work1.backend.model.ModelAnswer;

import java.util.List;
import java.util.Map;

/**
 * 解析结果：按 questionId 建索引，避免依赖模型返回顺序。
 */
public record ParsedAnswers(
        Map<String, ModelAnswer> answers,
        List<BatchErrorDto> errors
) {
    public ParsedAnswers {
        answers = answers == null ? Map.of() : Map.copyOf(answers);
        errors = errors == null ? List.of() : List.copyOf(errors);
    }
}
