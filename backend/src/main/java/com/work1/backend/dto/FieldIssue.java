package com.work1.backend.dto;

/**
 * 字段级校验问题。
 */
public record FieldIssue(
        String field,
        String message
) {
}
