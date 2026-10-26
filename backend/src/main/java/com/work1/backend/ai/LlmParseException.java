package com.work1.backend.ai;

/**
 * 模型输出无法解析（不是 JSON 数组、字段缺失等）。
 * 调用方应把对应分组的题目标记为 FAILED，而不是猜测答案。
 */
public class LlmParseException extends RuntimeException {

    public LlmParseException(String message) {
        super(message);
    }

    public LlmParseException(String message, Throwable cause) {
        super(message, cause);
    }
}
