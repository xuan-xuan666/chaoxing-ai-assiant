package com.work1.backend.exception;

import org.springframework.http.HttpStatus;

/**
 * 业务异常：由请求内容或配置导致的、可以直接告诉调用方的错误。
 * 消息面向用户，不包含堆栈与内部细节。
 */
public class BusinessException extends RuntimeException {

    private final String code;
    private final HttpStatus status;

    public BusinessException(String code, String message, HttpStatus status) {
        super(message);
        this.code = code;
        this.status = status;
    }

    public static BusinessException badRequest(String code, String message) {
        return new BusinessException(code, message, HttpStatus.BAD_REQUEST);
    }

    public String getCode() {
        return code;
    }

    public HttpStatus getStatus() {
        return status;
    }
}
