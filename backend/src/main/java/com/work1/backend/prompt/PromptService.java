package com.work1.backend.prompt;

import com.work1.backend.ai.LlmRequest;
import com.work1.backend.model.NormalizedQuestion;
import com.work1.backend.model.QuestionType;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * Prompt 编排服务：按题型分组，控制单次请求的题目范围与上下文。
 *
 * 分组的意义：不同题型的输出约束不同（单选只能一个标签、填空只能填空数组），
 * 混在一个 prompt 里容易让模型串格式。
 */
@Service
public class PromptService {

    private final PromptBuilder promptBuilder;

    public PromptService(PromptBuilder promptBuilder) {
        this.promptBuilder = promptBuilder;
    }

    public Map<QuestionType, List<NormalizedQuestion>> groupByType(List<NormalizedQuestion> questions) {
        Map<QuestionType, List<NormalizedQuestion>> groups = new EnumMap<>(QuestionType.class);
        for (NormalizedQuestion question : questions) {
            groups.computeIfAbsent(question.type(), key -> new ArrayList<>()).add(question);
        }
        return groups;
    }

    public LlmRequest build(QuestionType type, List<NormalizedQuestion> questions) {
        return new LlmRequest(
                promptBuilder.systemPrompt(),
                promptBuilder.userPrompt(type, questions),
                questions
        );
    }
}
