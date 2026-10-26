package com.work1.backend.prompt;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.work1.backend.model.NormalizedQuestion;
import com.work1.backend.model.QuestionType;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Prompt 构建器。
 *
 * 模板统一放在 resources/prompts 下，避免提示词散落在 Java 字符串里；
 * 题型说明单独成文件，修改提示词不需要重新编译代码。
 */
@Component
public class PromptBuilder {

    private static final String PROMPT_DIR = "classpath:prompts/";

    private final ObjectMapper objectMapper;
    private final String systemPrompt;
    private final Map<QuestionType, String> typeInstructions;

    public PromptBuilder(ResourceLoader resourceLoader, ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        this.systemPrompt = load(resourceLoader, "system.txt");

        Map<QuestionType, String> instructions = new EnumMap<>(QuestionType.class);
        instructions.put(QuestionType.SINGLE_CHOICE, load(resourceLoader, "single-choice.txt"));
        instructions.put(QuestionType.MULTIPLE_CHOICE, load(resourceLoader, "multiple-choice.txt"));
        instructions.put(QuestionType.FILL_BLANK, load(resourceLoader, "fill-blank.txt"));
        this.typeInstructions = Map.copyOf(instructions);
    }

    public String systemPrompt() {
        return systemPrompt;
    }

    /**
     * 构造单次请求的用户提示词。
     * 题目以 JSON 传入，明确标记为“数据”，配合 system prompt 里的注入防护一起生效。
     */
    public String userPrompt(QuestionType type, List<NormalizedQuestion> questions) {
        String instruction = typeInstructions.get(type);
        if (instruction == null) {
            throw new IllegalArgumentException("缺少题型提示词模板: " + type);
        }

        return instruction.trim()
                + "\n\n待解答题目（JSON 数组）：\n"
                + toJson(questions)
                + "\n\n请只返回 JSON 数组，不要输出任何其他内容。";
    }

    private String toJson(List<NormalizedQuestion> questions) {
        List<Map<String, Object>> payload = questions.stream().map(question -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("questionId", question.questionId());
            item.put("type", question.typeName());
            item.put("stem", question.stem());

            if (question.type().isChoice()) {
                List<Map<String, String>> options = question.options().stream()
                        .map(option -> Map.of("label", option.label(), "text", option.text()))
                        .toList();
                item.put("options", options);
            } else {
                item.put("blankCount", question.blankCount());
            }
            return item;
        }).toList();

        try {
            return objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException ex) {
            // 题目都来自受控 DTO，这里失败说明存在程序错误，不应继续调用模型。
            throw new IllegalStateException("题目序列化失败", ex);
        }
    }

    private String load(ResourceLoader resourceLoader, String fileName) {
        String location = PROMPT_DIR + fileName;
        try {
            return resourceLoader.getResource(location).getContentAsString(StandardCharsets.UTF_8);
        } catch (IOException ex) {
            throw new IllegalStateException("无法加载提示词模板: " + location, ex);
        }
    }
}
