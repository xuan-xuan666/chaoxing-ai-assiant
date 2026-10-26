package com.work1.backend.dto;

/**
 * 题目选项。
 *
 * optionId 由前端采集阶段生成；label 是展示标签（A/B/C），
 * 模型只允许返回 label，由服务端映射回 optionId，避免模型编造 ID。
 */
public record OptionDto(
        String optionId,
        String label,
        String text
) {
}
