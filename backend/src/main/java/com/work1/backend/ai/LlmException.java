package com.work1.backend.ai;

/**
 * 模型调用异常（超时、限流、鉴权失败等）。
 * 消息面向最终用户，不包含密钥与请求体。
 */
public class LlmException extends RuntimeException {

    public LlmException(String message) {
        super(message);
    }

    public LlmException(String message, Throwable cause) {
        super(message, cause);
    }
}
