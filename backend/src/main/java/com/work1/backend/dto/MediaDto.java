package com.work1.backend.dto;

/**
 * 题目辅助内容标记。
 *
 * 当前版本无法理解图片内容，后端据此把题目降级为 UNCERTAIN，
 * 而不是让模型对着缺失的题干硬猜。
 */
public record MediaDto(
        Boolean hasImage,
        Boolean hasCode,
        Boolean hasTable
) {
    public boolean imageRisk() {
        return Boolean.TRUE.equals(hasImage);
    }
}
