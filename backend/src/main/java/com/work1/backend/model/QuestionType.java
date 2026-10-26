package com.work1.backend.model;

import java.util.Locale;
import java.util.Optional;

/**
 * 题型枚举。
 *
 * 字符串值与前端 shared/protocol.js 完全一致，禁止在别处硬编码字面量。
 */
public enum QuestionType {

    SINGLE_CHOICE,
    MULTIPLE_CHOICE,
    FILL_BLANK;

    /** 宽松解析：去空白、转大写；无法识别时返回 empty，交由上层标记 INVALID_INPUT。 */
    public static Optional<QuestionType> from(String value) {
        if (value == null || value.isBlank()) {
            return Optional.empty();
        }
        try {
            return Optional.of(QuestionType.valueOf(value.trim().toUpperCase(Locale.ROOT)));
        } catch (IllegalArgumentException ex) {
            return Optional.empty();
        }
    }

    public boolean isChoice() {
        return this != FILL_BLANK;
    }
}
