package com.work1.backend.service;

import com.work1.backend.dto.MediaDto;
import com.work1.backend.dto.OptionDto;
import com.work1.backend.dto.QuestionBatchRequest;
import com.work1.backend.dto.QuestionDto;
import com.work1.backend.model.NormalizedBatch;
import com.work1.backend.model.NormalizedQuestion;
import com.work1.backend.parser.QuestionClassifier;
import com.work1.backend.parser.QuestionNormalizer;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class QuestionServiceTest {

    private final QuestionService service =
            new QuestionService(new QuestionClassifier(), new QuestionNormalizer());

    private QuestionBatchRequest request(QuestionDto... questions) {
        return new QuestionBatchRequest("1.0", "page-1", 1, "req-1", List.of(questions));
    }

    private QuestionDto single(String id, String type) {
        return new QuestionDto(
                id,
                type,
                "题干" + id,
                List.of(
                        new OptionDto(id + "-a", "a", " 甲 "),
                        new OptionDto(id + "-b", "b", "乙")),
                List.of(),
                null);
    }

    @Test
    void normalizesLabelsAndTrimsText() {
        NormalizedBatch batch = service.normalize(request(single("q1", "SINGLE_CHOICE")));

        assertThat(batch.validQuestions()).hasSize(1);
        NormalizedQuestion question = batch.validQuestions().get(0);
        assertThat(question.stem()).isEqualTo("题干q1");
        assertThat(question.options().get(0).label()).isEqualTo("A");
        assertThat(question.options().get(0).text()).isEqualTo("甲");
        assertThat(batch.invalidResults()).isEmpty();
    }

    @Test
    void unknownTypeIsMarkedInvalidWithoutThrowing() {
        NormalizedBatch batch = service.normalize(request(single("q1", "ESSAY")));

        assertThat(batch.validQuestions()).isEmpty();
        assertThat(batch.invalidResults().get("q1").status()).isEqualTo("INVALID_INPUT");
        assertThat(batch.invalidResults().get("q1").explanation()).contains("无法识别的题型");
    }

    @Test
    void duplicateQuestionIdKeepsFirstAndRecordsError() {
        NormalizedBatch batch = service.normalize(request(
                single("q1", "SINGLE_CHOICE"),
                single("q1", "SINGLE_CHOICE")));

        assertThat(batch.validQuestions()).hasSize(1);
        assertThat(batch.errors()).anyMatch(error -> "DUPLICATE_QUESTION_ID".equals(error.code()));
    }

    @Test
    void choiceWithOneOptionIsInvalid() {
        QuestionDto broken = new QuestionDto(
                "q1",
                "SINGLE_CHOICE",
                "只有一个选项",
                List.of(new OptionDto("q1-a", "A", "甲")),
                List.of(),
                null);

        NormalizedBatch batch = service.normalize(request(broken));

        assertThat(batch.validQuestions()).isEmpty();
        assertThat(batch.invalidResults().get("q1").explanation()).contains("至少需要两个选项");
    }

    @Test
    void fillBlankCountsPositions() {
        QuestionDto fill = new QuestionDto(
                "q3",
                "FILL_BLANK",
                "入口是 ____，返回 ____",
                List.of(),
                List.of(new com.work1.backend.dto.BlankDto(0),
                        new com.work1.backend.dto.BlankDto(1)),
                null);

        NormalizedBatch batch = service.normalize(request(fill));

        assertThat(batch.validQuestions()).hasSize(1);
        assertThat(batch.validQuestions().get(0).blankCount()).isEqualTo(2);
    }

    @Test
    void imageFlagIsCarriedThrough() {
        QuestionDto withImage = new QuestionDto(
                "q1",
                "SINGLE_CHOICE",
                "看图作答",
                List.of(new OptionDto("q1-a", "A", "甲"), new OptionDto("q1-b", "B", "乙")),
                List.of(),
                new MediaDto(true, false, false));

        NormalizedBatch batch = service.normalize(request(withImage));

        assertThat(batch.validQuestions().get(0).hasImage()).isTrue();
    }
}
