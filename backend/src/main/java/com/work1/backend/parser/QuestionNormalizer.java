package com.work1.backend.parser;

import com.work1.backend.dto.OptionDto;
import com.work1.backend.dto.QuestionDto;
import com.work1.backend.model.NormalizedQuestion;
import com.work1.backend.model.QuestionType;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Locale;

/**
 * 题目标准化器。
 *
 * 前置条件：调用方已经完成结构校验（字段非空、选项数量合法等）。
 * 这里只做确定性转换：去空白、选项标签统一大写、按题型裁掉无关字段。
 */
@Component
public class QuestionNormalizer {

    public NormalizedQuestion normalize(QuestionDto dto, QuestionType type) {
        String stem = dto.stem().trim();

        List<OptionDto> options = type.isChoice()
                ? dto.optionsOrEmpty().stream()
                        .map(option -> new OptionDto(
                                option.optionId().trim(),
                                option.label().trim().toUpperCase(Locale.ROOT),
                                option.text().trim()))
                        .toList()
                : List.of();

        // 填空数量以 blanks 数组长度为准，响应中的 blankAnswers 按同样顺序对应。
        int blankCount = type == QuestionType.FILL_BLANK ? dto.blanksOrEmpty().size() : 0;

        return new NormalizedQuestion(
                dto.questionId().trim(),
                type,
                stem,
                options,
                blankCount,
                dto.imageRisk()
        );
    }
}
