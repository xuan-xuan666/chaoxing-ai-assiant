package com.work1.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * 题目批次请求。
 *
 * 这里只校验“信封”结构；题目数量上限、schema 版本等业务规则在 AnswerService 中校验，
 * 以便返回带业务错误码的响应而不是笼统的 400。
 */
public record QuestionBatchRequest(

        @NotBlank(message = "schemaVersion 不能为空")
        @Size(max = 16, message = "schemaVersion 过长")
        String schemaVersion,

        @NotBlank(message = "pageId 不能为空")
        @Size(max = 128, message = "pageId 过长")
        String pageId,

        @NotNull(message = "snapshotVersion 不能为空")
        Integer snapshotVersion,

        @Size(max = 128, message = "requestId 过长")
        String requestId,

        @NotEmpty(message = "questions 不能为空")
        List<QuestionDto> questions
) {
}
