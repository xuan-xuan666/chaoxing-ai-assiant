package com.work1.backend.ai;

/**
 * 模型响应（内部结构）。content 是模型返回的原始文本，解析在 LlmResponseParser 中完成。
 */
public record LlmResponse(
        String content,
        String model
) {
}
