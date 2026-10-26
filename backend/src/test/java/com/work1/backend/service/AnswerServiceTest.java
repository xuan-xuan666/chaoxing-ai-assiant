package com.work1.backend.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.work1.backend.ai.LlmClient;
import com.work1.backend.ai.LlmException;
import com.work1.backend.ai.LlmResponse;
import com.work1.backend.ai.LlmResponseParser;
import com.work1.backend.config.AiProperties;
import com.work1.backend.dto.AnswerBatchResponse;
import com.work1.backend.dto.BlankDto;
import com.work1.backend.dto.MediaDto;
import com.work1.backend.dto.OptionDto;
import com.work1.backend.dto.QuestionBatchRequest;
import com.work1.backend.dto.QuestionDto;
import com.work1.backend.dto.QuestionResultDto;
import com.work1.backend.exception.BusinessException;
import com.work1.backend.matcher.AnswerValidator;
import com.work1.backend.model.NormalizedQuestion;
import com.work1.backend.model.QuestionType;
import com.work1.backend.parser.QuestionClassifier;
import com.work1.backend.parser.QuestionNormalizer;
import com.work1.backend.prompt.PromptBuilder;
import com.work1.backend.prompt.PromptService;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.DefaultResourceLoader;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AnswerServiceTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final AiProperties properties = new AiProperties();

    private AnswerService serviceWith(LlmClient client) {
        return new AnswerService(
                new QuestionService(new QuestionClassifier(), new QuestionNormalizer()),
                new PromptService(new PromptBuilder(new DefaultResourceLoader(), objectMapper)),
                client,
                new LlmResponseParser(objectMapper),
                new AnswerValidator(),
                properties
        );
    }

    /** 一个按题型给出确定答案的假客户端；reversed=true 时故意倒序返回。 */
    private LlmClient fixedClient(AtomicInteger counter, boolean reversed) {
        return request -> {
            counter.incrementAndGet();
            List<Map<String, Object>> items = new ArrayList<>();

            for (NormalizedQuestion question : request.questions()) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("questionId", question.questionId());
                item.put("status", "ANSWERED");

                if (question.type() == QuestionType.FILL_BLANK) {
                    item.put("selectedOptionLabels", List.of());
                    item.put("blankAnswers", IntStream.range(0, question.blankCount())
                            .mapToObj(index -> "答案" + (index + 1))
                            .toList());
                } else if (question.type() == QuestionType.SINGLE_CHOICE) {
                    item.put("selectedOptionLabels", List.of("B"));
                    item.put("blankAnswers", List.of());
                } else {
                    item.put("selectedOptionLabels", List.of("A", "C"));
                    item.put("blankAnswers", List.of());
                }
                item.put("explanation", "测试解释");
                items.add(item);
            }

            if (reversed) {
                Collections.reverse(items);
            }

            try {
                return new LlmResponse(objectMapper.writeValueAsString(items), "stub");
            } catch (JsonProcessingException ex) {
                throw new LlmException("测试数据序列化失败", ex);
            }
        };
    }

    private QuestionDto single(String id) {
        return new QuestionDto(id, "SINGLE_CHOICE", "题干" + id,
                List.of(new OptionDto(id + "-a", "A", "甲"), new OptionDto(id + "-b", "B", "乙")),
                List.of(), null);
    }

    private QuestionDto multiple(String id) {
        return new QuestionDto(id, "MULTIPLE_CHOICE", "题干" + id,
                List.of(
                        new OptionDto(id + "-a", "A", "甲"),
                        new OptionDto(id + "-b", "B", "乙"),
                        new OptionDto(id + "-c", "C", "丙")),
                List.of(), null);
    }

    private QuestionDto fill(String id) {
        return new QuestionDto(id, "FILL_BLANK", "题干" + id, List.of(),
                List.of(new BlankDto(0), new BlankDto(1)), null);
    }

    private QuestionBatchRequest request(QuestionDto... questions) {
        return new QuestionBatchRequest("1.0", "page-1", 3, "req-1", List.of(questions));
    }

    @Test
    void solvesAllTypesAndEchoesBatchIdentity() {
        AnswerBatchResponse response = serviceWith(fixedClient(new AtomicInteger(), false))
                .solve(request(single("q1"), multiple("q2"), fill("q3")));

        assertThat(response.requestId()).isEqualTo("req-1");
        assertThat(response.pageId()).isEqualTo("page-1");
        assertThat(response.snapshotVersion()).isEqualTo(3);
        assertThat(response.results()).hasSize(3);
        assertThat(response.results()).extracting(QuestionResultDto::status)
                .containsOnly("ANSWERED");

        assertThat(response.results().get(0).answer().optionIds()).containsExactly("q1-b");
        assertThat(response.results().get(1).answer().optionIds()).containsExactly("q2-a", "q2-c");
        assertThat(response.results().get(2).answer().blankAnswers()).containsExactly("答案1", "答案2");
    }

    @Test
    void resultOrderFollowsRequestEvenIfModelReverses() {
        AnswerBatchResponse response = serviceWith(fixedClient(new AtomicInteger(), true))
                .solve(request(multiple("q1"), multiple("q2")));

        assertThat(response.results()).extracting(QuestionResultDto::questionId)
                .containsExactly("q1", "q2");
    }

    @Test
    void llmFailureMarksEveryQuestionFailed() {
        LlmClient failing = request -> {
            throw new LlmException("模型超时");
        };

        AnswerBatchResponse response = serviceWith(failing).solve(request(single("q1"), fill("q2")));

        assertThat(response.results()).extracting(QuestionResultDto::status)
                .containsOnly("FAILED");
        assertThat(response.results()).allSatisfy(result ->
                assertThat(result.explanation()).contains("模型超时"));
    }

    @Test
    void imageQuestionBecomesUncertainWithoutCallingModel() {
        AtomicInteger calls = new AtomicInteger();
        QuestionDto imageQuestion = new QuestionDto(
                "q1", "SINGLE_CHOICE", "看图选择",
                List.of(new OptionDto("q1-a", "A", "甲"), new OptionDto("q1-b", "B", "乙")),
                List.of(),
                new MediaDto(true, false, false));

        AnswerBatchResponse response = serviceWith(fixedClient(calls, false))
                .solve(request(imageQuestion));

        assertThat(calls.get()).isZero();
        assertThat(response.results().get(0).status()).isEqualTo("UNCERTAIN");
    }

    @Test
    void invalidQuestionDoesNotBlockOthers() {
        QuestionDto broken = new QuestionDto(
                "q1", "ESSAY", "论述题",
                List.of(new OptionDto("q1-a", "A", "甲"), new OptionDto("q1-b", "B", "乙")),
                List.of(), null);

        AnswerBatchResponse response = serviceWith(fixedClient(new AtomicInteger(), false))
                .solve(request(broken, single("q2")));

        assertThat(response.results()).hasSize(2);
        assertThat(response.results().get(0).status()).isEqualTo("INVALID_INPUT");
        assertThat(response.results().get(1).status()).isEqualTo("ANSWERED");
    }

    @Test
    void rejectsBatchLargerThanConfiguredLimit() {
        properties.setMaxQuestionsPerBatch(1);
        QuestionBatchRequest tooLarge = request(single("q1"), single("q2"));

        assertThatThrownBy(() -> serviceWith(fixedClient(new AtomicInteger(), false)).solve(tooLarge))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("最多处理");
    }

    @Test
    void rejectsUnsupportedSchemaVersion() {
        QuestionBatchRequest wrongSchema =
                new QuestionBatchRequest("2.0", "page-1", 1, "req-1", List.of(single("q1")));

        assertThatThrownBy(() -> serviceWith(fixedClient(new AtomicInteger(), false)).solve(wrongSchema))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("schemaVersion");
    }
}
