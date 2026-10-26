package com.work1.backend.dto;

/**
 * 批次级错误（非致命）。例如模型返回了未知 questionId、缺少 questionId 等。
 * 单题失败不会放到这里，而是体现在该题的 status 上。
 */
public record BatchErrorDto(
        String code,
        String questionId,
        String message
) {
}
