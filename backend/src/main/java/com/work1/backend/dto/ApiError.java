package com.work1.backend.dto;

import java.util.List;

/**
 * 统一错误响应。不包含堆栈、密钥或完整请求体，避免信息泄露。
 */
public record ApiError(
        String code,
        String message,
        List<FieldIssue> details
) {
    public static ApiError of(String code, String message) {
        return new ApiError(code, message, null);
    }
}
