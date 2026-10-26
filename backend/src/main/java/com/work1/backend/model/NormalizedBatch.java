package com.work1.backend.model;

import com.work1.backend.dto.BatchErrorDto;
import com.work1.backend.dto.QuestionResultDto;

import java.util.List;
import java.util.Map;

/**
 * 标准化结果：
 *   validQuestions —— 可以送模型的题目；
 * invalidResults —— 采集数据本身有问题的题目，直接给 INVALID_INPUT，不浪费模型调用；
 *         errors —— 批次级提示（例如重复 ID）。
 */
public record NormalizedBatch(
        List<NormalizedQuestion> validQuestions,
        Map<String, QuestionResultDto> invalidResults,
        List<BatchErrorDto> errors
) {
    public NormalizedBatch {
        validQuestions = validQuestions == null ? List.of() : List.copyOf(validQuestions);
        invalidResults = invalidResults == null ? Map.of() : Map.copyOf(invalidResults);
        errors = errors == null ? List.of() : List.copyOf(errors);
    }
}
