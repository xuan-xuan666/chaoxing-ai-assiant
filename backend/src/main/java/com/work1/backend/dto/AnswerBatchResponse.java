package com.work1.backend.dto;

import java.util.List;

/**
 * 批次响应。
 *
 * requestId / pageId / snapshotVersion 必须原样回显：前端据此判断结果是否已经过期，
 * 任一不一致都会把整批标记为 STALE 并拒绝回填。
 */
public record AnswerBatchResponse(
        String requestId,
        String pageId,
        Integer snapshotVersion,
        List<QuestionResultDto> results,
        List<BatchErrorDto> errors
) {
    public AnswerBatchResponse {
        results = results == null ? List.of() : List.copyOf(results);
        errors = errors == null ? List.of() : List.copyOf(errors);
    }
}
