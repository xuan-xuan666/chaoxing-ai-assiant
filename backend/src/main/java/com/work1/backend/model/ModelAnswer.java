package com.work1.backend.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;

/**
 * 模型返回的单题答案（内部结构）。
 *
 * 只接受 selectedOptionLabels（选项标签），不接受 optionId：
 * 选项 ID 必须来自采集阶段，模型无权生成。
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record ModelAnswer(
        String questionId,
        String status,
        List<String> selectedOptionLabels,
        List<String> blankAnswers,
        String explanation
) {
}
