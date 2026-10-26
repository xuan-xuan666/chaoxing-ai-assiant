package com.work1.backend.matcher;

import com.work1.backend.dto.OptionDto;
import com.work1.backend.dto.QuestionResultDto;
import com.work1.backend.dto.QuestionResults;
import com.work1.backend.model.ModelAnswer;
import com.work1.backend.model.NormalizedQuestion;
import com.work1.backend.model.ResultStatus;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;

/**
 * 答案校验与映射。
 *
 * 模型只能返回选项标签（A/B/C），由这里映射回采集阶段生成的 optionId；
 * 任何数量、存在性、重复性问题都会降级为 INVALID_INPUT，绝不“修一修继续用”。
 */
@Component
public class AnswerValidator {

    public QuestionResultDto toResult(NormalizedQuestion question, ModelAnswer answer) {
        if (answer == null) {
            return QuestionResults.failed(question.questionId(), question.typeName(), "模型未返回该题结果");
        }

        ResultStatus status = ResultStatus.from(answer.status()).orElse(ResultStatus.UNCERTAIN);

        return switch (status) {
            case ANSWERED -> validateAnswered(question, answer);
            case UNCERTAIN -> QuestionResults.uncertain(
                    question.questionId(), question.typeName(), explanationOr(answer, "模型认为信息不足"));
            case INVALID_INPUT -> QuestionResults.invalid(
                    question.questionId(), question.typeName(), explanationOr(answer, "模型标记为无效输入"));
            case FAILED -> QuestionResults.failed(
                    question.questionId(), question.typeName(), explanationOr(answer, "模型未能给出答案"));
        };
    }

    private QuestionResultDto validateAnswered(NormalizedQuestion question, ModelAnswer answer) {
        return switch (question.type()) {
            case SINGLE_CHOICE -> validateSingle(question, answer);
            case MULTIPLE_CHOICE -> validateMultiple(question, answer);
            case FILL_BLANK -> validateFill(question, answer);
        };
    }

    private QuestionResultDto validateSingle(NormalizedQuestion question, ModelAnswer answer) {
        List<String> labels = labelsOf(answer);
        if (labels.size() != 1) {
            return invalid(question, "单选题必须且只能返回一个选项，实际返回 " + labels.size() + " 个");
        }

        OptionDto option = findByLabel(question, labels.get(0));
        if (option == null) {
            return invalid(question, "返回了不存在的选项标签：" + labels.get(0));
        }

        return QuestionResults.answered(
                question.questionId(),
                question.typeName(),
                List.of(option.optionId()),
                List.of(),
                explanationOr(answer, ""));
    }

    private QuestionResultDto validateMultiple(NormalizedQuestion question, ModelAnswer answer) {
        List<String> labels = labelsOf(answer);
        if (labels.isEmpty()) {
            return invalid(question, "多选题没有返回任何选项");
        }
        if (new HashSet<>(labels).size() != labels.size()) {
            return invalid(question, "多选题返回了重复选项");
        }

        List<String> optionIds = new ArrayList<>();
        for (String label : labels) {
            OptionDto option = findByLabel(question, label);
            if (option == null) {
                return invalid(question, "返回了不存在的选项标签：" + label);
            }
            optionIds.add(option.optionId());
        }

        return QuestionResults.answered(
                question.questionId(),
                question.typeName(),
                optionIds,
                List.of(),
                explanationOr(answer, ""));
    }

    private QuestionResultDto validateFill(NormalizedQuestion question, ModelAnswer answer) {
        List<String> blanks = answer.blankAnswers() == null
                ? List.of()
                : answer.blankAnswers().stream()
                        .filter(Objects::nonNull)
                        .map(String::trim)
                        .toList();

        if (blanks.size() != question.blankCount()) {
            return invalid(question,
                    "填空答案数量（" + blanks.size() + "）与空位数（" + question.blankCount() + "）不一致");
        }
        if (blanks.stream().anyMatch(String::isEmpty)) {
            return invalid(question, "存在空白答案");
        }

        return QuestionResults.answered(
                question.questionId(),
                question.typeName(),
                List.of(),
                blanks,
                explanationOr(answer, ""));
    }

    private List<String> labelsOf(ModelAnswer answer) {
        if (answer.selectedOptionLabels() == null) {
            return List.of();
        }
        return answer.selectedOptionLabels().stream()
                .filter(Objects::nonNull)
                .map(this::normalizeLabel)
                .filter(label -> !label.isEmpty())
                .toList();
    }

    /** 宽松处理 "B." / "b" / " B " 这类写法，但不会把 "BC" 拆成两个选项。 */
    private String normalizeLabel(String raw) {
        String value = raw.trim().toUpperCase(Locale.ROOT);
        return value.replaceAll("[.、．:：)）\\s]+$", "");
    }

    private OptionDto findByLabel(NormalizedQuestion question, String label) {
        return question.options().stream()
                .filter(option -> label.equalsIgnoreCase(option.label()))
                .findFirst()
                .orElse(null);
    }

    private QuestionResultDto invalid(NormalizedQuestion question, String reason) {
        return QuestionResults.invalid(
                question.questionId(),
                question.typeName(),
                "答案校验未通过：" + reason);
    }

    private String explanationOr(ModelAnswer answer, String fallback) {
        return answer.explanation() == null || answer.explanation().isBlank()
                ? fallback
                : answer.explanation();
    }
}
