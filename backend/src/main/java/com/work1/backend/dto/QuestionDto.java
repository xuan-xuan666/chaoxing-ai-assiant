package com.work1.backend.dto;

import java.util.List;

/**
 * 单道题目的请求结构。
 *
 * 注意：这里刻意不加 @Valid 级联校验。题目级的问题应当在服务层被标记为
 * 单题 INVALID_INPUT，而不是让整批请求 400 失败（详见设计文档 7.6 的说明）。
 */
public record QuestionDto(
        String questionId,
        String type,
        String stem,
        List<OptionDto> options,
        List<BlankDto> blanks,
        MediaDto media
) {
    public List<OptionDto> optionsOrEmpty() {
        return options == null ? List.of() : options;
    }

    public List<BlankDto> blanksOrEmpty() {
        return blanks == null ? List.of() : blanks;
    }

    public boolean imageRisk() {
        return media != null && media.imageRisk();
    }
}
