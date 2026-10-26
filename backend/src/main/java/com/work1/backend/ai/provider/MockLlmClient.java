package com.work1.backend.ai.provider;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.work1.backend.ai.LlmClient;
import com.work1.backend.ai.LlmException;
import com.work1.backend.ai.LlmRequest;
import com.work1.backend.ai.LlmResponse;
import com.work1.backend.model.NormalizedQuestion;
import com.work1.backend.model.QuestionType;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 内置模拟模型客户端。
 *
 * 用途：没有模型密钥时也能跑通完整链路，并让前端联调不受外部 API 影响。
 * 输出格式与真实模型完全一致（JSON 数组 + selectedOptionLabels），
 * 因此解析、校验、映射这些代码路径都会被真实执行。
 *
 * 注意：它不具备任何解题能力，答案只是占位。
 */
public class MockLlmClient implements LlmClient {

    private final ObjectMapper objectMapper;

    public MockLlmClient(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Override
    public LlmResponse generate(LlmRequest request) {
        List<Map<String, Object>> answers = new ArrayList<>();
        for (NormalizedQuestion question : request.questions()) {
            answers.add(answerFor(question));
        }

        try {
            return new LlmResponse(objectMapper.writeValueAsString(answers), "mock");
        } catch (JsonProcessingException ex) {
            throw new LlmException("模拟模型输出序列化失败", ex);
        }
    }

    private Map<String, Object> answerFor(NormalizedQuestion question) {
        Map<String, Object> answer = new LinkedHashMap<>();
        answer.put("questionId", question.questionId());

        if (question.type() == QuestionType.FILL_BLANK) {
            List<String> blanks = new ArrayList<>();
            for (int index = 0; index < question.blankCount(); index++) {
                blanks.add("示例答案" + (index + 1));
            }
            answer.put("status", "ANSWERED");
            answer.put("selectedOptionLabels", List.of());
            answer.put("blankAnswers", blanks);
            answer.put("explanation", "模拟数据：为每个空生成占位答案，仅用于联调。");
            return answer;
        }

        List<String> labels = new ArrayList<>();
        if (question.type() == QuestionType.SINGLE_CHOICE) {
            labels.add(preferredLabel(question));
        } else {
            // 多选题固定取前两个选项，保证结果是确定的、可复现的。
            question.options().stream().limit(2).forEach(option -> labels.add(option.label()));
        }

        answer.put("status", labels.isEmpty() ? "UNCERTAIN" : "ANSWERED");
        answer.put("selectedOptionLabels", labels);
        answer.put("blankAnswers", List.of());
        answer.put("explanation", "模拟数据：按固定规则选择选项，仅用于联调。");
        return answer;
    }

    private String preferredLabel(NormalizedQuestion question) {
        return question.options().stream()
                .map(option -> option.label())
                .filter(label -> "B".equalsIgnoreCase(label))
                .findFirst()
                .orElseGet(() -> question.options().isEmpty() ? "" : question.options().get(0).label());
    }
}
