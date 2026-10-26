package com.work1.backend.dto;

/**
 * 填空位置。blankIndex 与响应中的 blankAnswers 下标一一对应。
 */
public record BlankDto(
        Integer blankIndex
) {
    public int indexOrZero() {
        return blankIndex == null ? 0 : blankIndex;
    }
}
