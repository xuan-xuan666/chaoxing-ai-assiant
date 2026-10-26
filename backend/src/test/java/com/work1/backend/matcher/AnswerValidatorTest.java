package com.work1.backend.matcher;

import com.work1.backend.dto.OptionDto;
import com.work1.backend.dto.QuestionResultDto;
import com.work1.backend.model.ModelAnswer;
import com.work1.backend.model.NormalizedQuestion;
import com.work1.backend.model.QuestionType;
import com.work1.backend.model.ResultStatus;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class AnswerValidatorTest {

    private final AnswerValidator validator = new AnswerValidator();

    private NormalizedQuestion single() {
        return new NormalizedQuestion(
                "q1",
                QuestionType.SINGLE_CHOICE,
                "哪个关键字用于继承？",
                List.of(
                        new OptionDto("q1-opt-a", "A", "implements"),
                        new OptionDto("q1-opt-b", "B", "extends")),
                0,
                false);
    }

    private NormalizedQuestion multiple() {
        return new NormalizedQuestion(
                "q2",
                QuestionType.MULTIPLE_CHOICE,
                "哪些是集合接口？",
                List.of(
                        new OptionDto("q2-opt-a", "A", "List"),
                        new OptionDto("q2-opt-b", "B", "HashMap"),
                        new OptionDto("q2-opt-c", "C", "Set")),
                0,
                false);
    }

    private NormalizedQuestion fill() {
        return new NormalizedQuestion(
                "q3",
                QuestionType.FILL_BLANK,
                "入口方法是 ____，返回类型是 ____。",
                List.of(),
                2,
                false);
    }

    private ModelAnswer answer(String questionId, String status, List<String> labels, List<String> blanks) {
        return new ModelAnswer(questionId, status, labels, blanks, "解析");
    }

    @Test
    void singleChoiceMapsLabelToOptionId() {
        QuestionResultDto result = validator.toResult(
                single(), answer("q1", "ANSWERED", List.of("b."), List.of()));

        assertThat(result.status()).isEqualTo(ResultStatus.ANSWERED.name());
        assertThat(result.answer().optionIds()).containsExactly("q1-opt-b");
        assertThat(result.answer().blankAnswers()).isEmpty();
    }

    @Test
    void singleChoiceWithTwoLabelsIsInvalid() {
        QuestionResultDto result = validator.toResult(
                single(), answer("q1", "ANSWERED", List.of("A", "B"), List.of()));

        assertThat(result.status()).isEqualTo(ResultStatus.INVALID_INPUT.name());
        assertThat(result.answer().optionIds()).isEmpty();
        assertThat(result.explanation()).contains("单选题");
    }

    @Test
    void singleChoiceWithUnknownLabelIsInvalid() {
        QuestionResultDto result = validator.toResult(
                single(), answer("q1", "ANSWERED", List.of("Z"), List.of()));

        assertThat(result.status()).isEqualTo(ResultStatus.INVALID_INPUT.name());
        assertThat(result.explanation()).contains("不存在的选项标签");
    }

    @Test
    void multipleChoiceMapsAllLabels() {
        QuestionResultDto result = validator.toResult(
                multiple(), answer("q2", "ANSWERED", List.of("A", "C"), List.of()));

        assertThat(result.status()).isEqualTo(ResultStatus.ANSWERED.name());
        assertThat(result.answer().optionIds()).containsExactly("q2-opt-a", "q2-opt-c");
    }

    @Test
    void multipleChoiceWithDuplicateOptionIsInvalid() {
        QuestionResultDto result = validator.toResult(
                multiple(), answer("q2", "ANSWERED", List.of("A", "A"), List.of()));

        assertThat(result.status()).isEqualTo(ResultStatus.INVALID_INPUT.name());
        assertThat(result.explanation()).contains("重复选项");
    }

    @Test
    void fillBlankKeepsOrderAndRequiresMatchingCount() {
        QuestionResultDto ok = validator.toResult(
                fill(), answer("q3", "ANSWERED", List.of(), List.of("main", "void")));
        assertThat(ok.status()).isEqualTo(ResultStatus.ANSWERED.name());
        assertThat(ok.answer().blankAnswers()).containsExactly("main", "void");

        QuestionResultDto tooFew = validator.toResult(
                fill(), answer("q3", "ANSWERED", List.of(), List.of("main")));
        assertThat(tooFew.status()).isEqualTo(ResultStatus.INVALID_INPUT.name());
        assertThat(tooFew.explanation()).contains("空位数");
    }

    @Test
    void emptyBlankAnswerIsInvalid() {
        QuestionResultDto result = validator.toResult(
                fill(), answer("q3", "ANSWERED", List.of(), List.of("main", " ")));

        assertThat(result.status()).isEqualTo(ResultStatus.INVALID_INPUT.name());
        assertThat(result.explanation()).contains("空白答案");
    }

    @Test
    void missingModelAnswerBecomesFailed() {
        QuestionResultDto result = validator.toResult(single(), null);

        assertThat(result.status()).isEqualTo(ResultStatus.FAILED.name());
        assertThat(result.explanation()).contains("未返回");
    }

    @Test
    void uncertainKeepsExplanationAndNoAnswer() {
        QuestionResultDto result = validator.toResult(
                single(), answer("q1", "UNCERTAIN", List.of(), List.of()));

        assertThat(result.status()).isEqualTo(ResultStatus.UNCERTAIN.name());
        assertThat(result.answer().optionIds()).isEmpty();
        assertThat(result.explanation()).isEqualTo("解析");
    }

    @Test
    void unknownStatusFallsBackToUncertain() {
        QuestionResultDto result = validator.toResult(
                single(), answer("q1", "SOMETHING_ELSE", List.of("B"), List.of()));

        assertThat(result.status()).isEqualTo(ResultStatus.UNCERTAIN.name());
    }
}
