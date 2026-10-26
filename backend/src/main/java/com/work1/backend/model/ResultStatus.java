package com.work1.backend.model;

import java.util.Locale;
import java.util.Optional;

/**
 * 逐题结果状态。
 *
 * 后端只会产出前四个；STALE 是前端的快照失效状态，不由服务端返回。
 */
public enum ResultStatus {

    ANSWERED,
    UNCERTAIN,
    INVALID_INPUT,
    FAILED;

    public static Optional<ResultStatus> from(String value) {
        if (value == null || value.isBlank()) {
            return Optional.empty();
        }
        try {
            return Optional.of(ResultStatus.valueOf(value.trim().toUpperCase(Locale.ROOT)));
        } catch (IllegalArgumentException ex) {
            return Optional.empty();
        }
    }
}
