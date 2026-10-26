package com.work1.backend.model;

import com.work1.backend.dto.OptionDto;

import java.util.List;

/**
 * 标准化之后的题目：只包含调用模型所需的字段，DOM 相关内容一概没有。
 */
public record NormalizedQuestion(
        String questionId,
        QuestionType type,
        String stem,
        List<OptionDto> options,
        int blankCount,
        boolean hasImage
) {
    public NormalizedQuestion {
        options = options == null ? List.of() : List.copyOf(options);
    }

    public String typeName() {
        return type.name();
    }
}
