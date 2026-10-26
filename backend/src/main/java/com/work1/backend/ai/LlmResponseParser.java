package com.work1.backend.ai;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.work1.backend.dto.BatchErrorDto;
import com.work1.backend.model.ModelAnswer;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 模型输出解析器。
 *
 * 策略是“严格解析”：只接受纯 JSON 数组（允许外层被 Markdown 代码块包裹），
 * 出现额外说明文字、字段类型错误或非数组结构时直接抛异常，
 * 由调用方把该组题目标记为 FAILED——绝不尝试从散文里抠答案。
 */
@Component
public class LlmResponseParser {

    private final ObjectMapper objectMapper;

    public LlmResponseParser(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public ParsedAnswers parse(String content) {
        if (content == null || content.isBlank()) {
            throw new LlmParseException("模型返回内容为空");
        }

        String json = stripCodeFence(content.trim());
        if (!json.startsWith("[") || !json.endsWith("]")) {
            throw new LlmParseException("模型输出不是 JSON 数组");
        }

        List<ModelAnswer> raw;
        try {
            raw = objectMapper.readValue(json, new TypeReference<List<ModelAnswer>>() {
            });
        } catch (IOException ex) {
            throw new LlmParseException("模型输出不是合法的 JSON 数组", ex);
        }

        Map<String, ModelAnswer> answers = new LinkedHashMap<>();
        List<BatchErrorDto> errors = new ArrayList<>();

        for (ModelAnswer answer : raw) {
            if (answer == null || answer.questionId() == null || answer.questionId().isBlank()) {
                errors.add(new BatchErrorDto("MISSING_QUESTION_ID", null, "模型结果缺少 questionId，已忽略"));
                continue;
            }
            // 同一题出现多次时保留第一条，并记录错误，避免不确定的结果覆盖确定结果。
            if (answers.containsKey(answer.questionId())) {
                errors.add(new BatchErrorDto("DUPLICATE_MODEL_RESULT", answer.questionId(), "模型返回了重复结果，已忽略后者"));
                continue;
            }
            answers.put(answer.questionId(), answer);
        }

        return new ParsedAnswers(answers, errors);
    }

    /**
     * 去掉 ```json ... ``` 包裹。
     * 只处理代码块这一种“包装”，其余多余文字一律视为解析失败。
     */
    private String stripCodeFence(String value) {
        if (!value.startsWith("```")) {
            return value;
        }
        int firstLineBreak = value.indexOf('\n');
        if (firstLineBreak < 0) {
            return value;
        }
        String body = value.substring(firstLineBreak + 1);
        if (body.endsWith("```")) {
            body = body.substring(0, body.length() - 3);
        }
        return body.trim();
    }
}
