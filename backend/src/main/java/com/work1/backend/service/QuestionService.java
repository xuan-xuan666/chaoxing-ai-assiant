package com.work1.backend.service;

import com.work1.backend.dto.BatchErrorDto;
import com.work1.backend.dto.OptionDto;
import com.work1.backend.dto.QuestionBatchRequest;
import com.work1.backend.dto.QuestionDto;
import com.work1.backend.dto.QuestionResultDto;
import com.work1.backend.dto.QuestionResults;
import com.work1.backend.model.NormalizedBatch;
import com.work1.backend.model.NormalizedQuestion;
import com.work1.backend.model.QuestionType;
import com.work1.backend.parser.QuestionClassifier;
import com.work1.backend.parser.QuestionNormalizer;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * 题目校验与标准化服务。
 *
 * 关键取舍：题目级的问题不抛异常、不让整个请求 400，
 * 而是给这道题一个 INVALID_INPUT 结果并跳过模型调用。
 * 这样一批题里坏一条，其余仍然可用（文档 7.6）。
 */
@Service
public class QuestionService {

    private static final int MAX_STEM_LENGTH = 8000;
    private static final int MAX_OPTIONS = 10;
    private static final int MAX_OPTION_TEXT_LENGTH = 500;
    private static final int MAX_BLANKS = 20;

    private final QuestionClassifier classifier;
    private final QuestionNormalizer normalizer;

    public QuestionService(QuestionClassifier classifier, QuestionNormalizer normalizer) {
        this.classifier = classifier;
        this.normalizer = normalizer;
    }

    public NormalizedBatch normalize(QuestionBatchRequest request) {
        Map<String, QuestionResultDto> invalid = new LinkedHashMap<>();
        List<NormalizedQuestion> valid = new ArrayList<>();
        List<BatchErrorDto> errors = new ArrayList<>();
        Set<String> seenIds = new HashSet<>();

        for (QuestionDto dto : request.questions()) {
            if (dto == null) {
                errors.add(new BatchErrorDto("NULL_QUESTION", null, "题目为空，已忽略"));
                continue;
            }

            String questionId = trimToNull(dto.questionId());
            if (questionId == null) {
                errors.add(new BatchErrorDto("MISSING_QUESTION_ID", null, "题目缺少 questionId，已忽略"));
                continue;
            }

            if (!seenIds.add(questionId)) {
                // 不覆盖首次出现的结果，只记录批次级错误；最终输出按首次出现去重。
                errors.add(new BatchErrorDto(
                        "DUPLICATE_QUESTION_ID", questionId, "批次内 questionId 重复，已忽略重复项"));
                continue;
            }

            Optional<QuestionType> type = classifier.classify(dto);
            if (type.isEmpty()) {
                invalid.put(questionId, QuestionResults.invalid(
                        questionId,
                        safeType(dto.type()),
                        "无法识别的题型：" + dto.type()));
                continue;
            }

            List<String> issues = validateShape(dto, type.get());
            if (!issues.isEmpty()) {
                invalid.put(questionId, QuestionResults.invalid(
                        questionId,
                        type.get().name(),
                        "题目结构不合法：" + String.join("；", issues)));
                continue;
            }

            valid.add(normalizer.normalize(dto, type.get()));
        }

        return new NormalizedBatch(valid, invalid, errors);
    }

    private List<String> validateShape(QuestionDto dto, QuestionType type) {
        List<String> issues = new ArrayList<>();

        String stem = trimToNull(dto.stem());
        if (stem == null) {
            issues.add("题干为空");
        } else if (stem.length() > MAX_STEM_LENGTH) {
            issues.add("题干超过 " + MAX_STEM_LENGTH + " 字");
        }

        if (type == QuestionType.FILL_BLANK) {
            int blankCount = dto.blanksOrEmpty().size();
            if (blankCount == 0) {
                issues.add("填空题缺少空位");
            }
            if (blankCount > MAX_BLANKS) {
                issues.add("空位超过 " + MAX_BLANKS + " 个");
            }
            return issues;
        }

        List<OptionDto> options = dto.optionsOrEmpty();
        if (options.size() < 2) {
            issues.add("选择题至少需要两个选项");
        }
        if (options.size() > MAX_OPTIONS) {
            issues.add("选项超过 " + MAX_OPTIONS + " 个");
        }

        Set<String> optionIds = new HashSet<>();
        Set<String> labels = new HashSet<>();
        for (OptionDto option : options) {
            if (option == null) {
                issues.add("存在空选项");
                continue;
            }

            String optionId = trimToNull(option.optionId());
            if (optionId == null) {
                issues.add("选项缺少 optionId");
            } else if (!optionIds.add(optionId)) {
                issues.add("选项 optionId 重复：" + optionId);
            }

            String label = trimToNull(option.label());
            if (label == null) {
                issues.add("选项缺少 label");
            } else if (!labels.add(label.toUpperCase(Locale.ROOT))) {
                issues.add("选项 label 重复：" + label);
            }

            String text = trimToNull(option.text());
            if (text == null) {
                issues.add("选项文本为空");
            } else if (text.length() > MAX_OPTION_TEXT_LENGTH) {
                issues.add("选项文本过长");
            }
        }

        return issues;
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String safeType(String type) {
        return type == null || type.isBlank() ? "UNKNOWN" : type;
    }
}
