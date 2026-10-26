package com.work1.backend.ai;

import com.work1.backend.model.NormalizedQuestion;

import java.util.List;

/**
 * 模型请求（内部结构）。
 *
 * 同时携带渲染好的 prompt 与结构化题目：
 *   - 真实供应商用 prompt；
 *   - 模拟客户端直接用 questions，避免反向解析自己拼的字符串。
 */
public record LlmRequest(
        String systemPrompt,
        String userPrompt,
        List<NormalizedQuestion> questions
) {
    public LlmRequest {
        questions = questions == null ? List.of() : List.copyOf(questions);
    }
}
