package com.work1.backend.service;

import com.work1.backend.ai.LlmClient;
import com.work1.backend.ai.LlmException;
import com.work1.backend.ai.LlmParseException;
import com.work1.backend.ai.LlmRequest;
import com.work1.backend.ai.LlmResponse;
import com.work1.backend.ai.LlmResponseParser;
import com.work1.backend.ai.ParsedAnswers;
import com.work1.backend.config.AiProperties;
import com.work1.backend.dto.AnswerBatchResponse;
import com.work1.backend.dto.BatchErrorDto;
import com.work1.backend.dto.QuestionBatchRequest;
import com.work1.backend.dto.QuestionDto;
import com.work1.backend.dto.QuestionResultDto;
import com.work1.backend.dto.QuestionResults;
import com.work1.backend.exception.BusinessException;
import com.work1.backend.matcher.AnswerValidator;
import com.work1.backend.model.NormalizedBatch;
import com.work1.backend.model.NormalizedQuestion;
import com.work1.backend.model.QuestionType;
import com.work1.backend.model.ResultStatus;
import com.work1.backend.prompt.PromptService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * 解题编排服务。
 *
 * 流程（文档 7.3）：
 *   请求校验 → 标准化（坏题单独标记）→ 按题型分组 → 调模型 → 严格解析
 *   → 按 questionId 映射并校验 → 按原始顺序返回。
 *
 * 失败隔离：某一组模型调用失败只影响该组题目，其余题目照常返回。
 */
@Service
public class AnswerService {

    private static final Logger log = LoggerFactory.getLogger(AnswerService.class);

    private final QuestionService questionService;
    private final PromptService promptService;
    private final LlmClient llmClient;
    private final LlmResponseParser responseParser;
    private final AnswerValidator answerValidator;
    private final AiProperties properties;

    public AnswerService(QuestionService questionService,
                         PromptService promptService,
                         LlmClient llmClient,
                         LlmResponseParser responseParser,
                         AnswerValidator answerValidator,
                         AiProperties properties) {
        this.questionService = questionService;
        this.promptService = promptService;
        this.llmClient = llmClient;
        this.responseParser = responseParser;
        this.answerValidator = answerValidator;
        this.properties = properties;
    }

    public AnswerBatchResponse solve(QuestionBatchRequest request) {
        validateEnvelope(request);
        long startedAt = System.currentTimeMillis();

        NormalizedBatch batch = questionService.normalize(request);

        Map<String, QuestionResultDto> byId = new LinkedHashMap<>(batch.invalidResults());
        List<BatchErrorDto> errors = new ArrayList<>(batch.errors());

        // 图片题当前无法理解，直接降级为 UNCERTAIN，不把残缺题干丢给模型硬猜。
        List<NormalizedQuestion> promptable = new ArrayList<>();
        for (NormalizedQuestion question : batch.validQuestions()) {
            if (question.hasImage()) {
                byId.put(question.questionId(), QuestionResults.uncertain(
                        question.questionId(),
                        question.typeName(),
                        "题目包含图片，当前版本无法解析图片内容，请人工确认。"));
            } else {
                promptable.add(question);
            }
        }

        Map<QuestionType, List<NormalizedQuestion>> groups = promptService.groupByType(promptable);
        for (Map.Entry<QuestionType, List<NormalizedQuestion>> entry : groups.entrySet()) {
            solveGroup(entry.getKey(), entry.getValue(), byId, errors);
        }

        List<QuestionResultDto> results = orderResults(request, byId);

        String requestId = trimToNull(request.requestId()) != null
                ? request.requestId().trim()
                : "srv-" + UUID.randomUUID();

        logSummary(request, results, errors, startedAt);

        return new AnswerBatchResponse(
                requestId,
                request.pageId(),
                request.snapshotVersion(),
                results,
                errors
        );
    }

    private void solveGroup(QuestionType type,
                            List<NormalizedQuestion> group,
                            Map<String, QuestionResultDto> byId,
                            List<BatchErrorDto> errors) {
        try {
            LlmRequest llmRequest = promptService.build(type, group);
            LlmResponse response = llmClient.generate(llmRequest);
            ParsedAnswers parsed = responseParser.parse(response.content());
            errors.addAll(parsed.errors());

            for (NormalizedQuestion question : group) {
                byId.put(question.questionId(),
                        answerValidator.toResult(question, parsed.answers().get(question.questionId())));
            }
        } catch (LlmParseException | LlmException ex) {
            // 模型不可用或输出不可解析：整组标记 FAILED，保留原因给用户看。
            log.warn("模型分组处理失败：type={} count={} reason={}", type, group.size(), ex.getMessage());
            for (NormalizedQuestion question : group) {
                byId.put(question.questionId(),
                        QuestionResults.failed(question.questionId(), question.typeName(), ex.getMessage()));
            }
        } catch (RuntimeException ex) {
            log.error("模型分组处理出现未预期异常：type={}", type, ex);
            for (NormalizedQuestion question : group) {
                byId.put(question.questionId(),
                        QuestionResults.failed(question.questionId(), question.typeName(), "服务内部错误"));
            }
        }
    }

    /** 结果按请求中的题目顺序输出，并按首次出现的 questionId 去重。 */
    private List<QuestionResultDto> orderResults(QuestionBatchRequest request,
                                                 Map<String, QuestionResultDto> byId) {
        List<QuestionResultDto> results = new ArrayList<>();
        Set<String> emitted = new HashSet<>();

        for (QuestionDto dto : request.questions()) {
            if (dto == null) {
                continue;
            }
            String questionId = trimToNull(dto.questionId());
            if (questionId == null || !emitted.add(questionId)) {
                continue;
            }

            QuestionResultDto result = byId.get(questionId);
            results.add(result != null
                    ? result
                    : QuestionResults.failed(questionId, "UNKNOWN", "服务未能生成该题结果"));
        }
        return results;
    }

    private void validateEnvelope(QuestionBatchRequest request) {
        if (request == null || request.questions() == null || request.questions().isEmpty()) {
            throw BusinessException.badRequest("EMPTY_BATCH", "questions 不能为空");
        }
        if (request.schemaVersion() == null || !request.schemaVersion().trim().startsWith("1.")) {
            throw BusinessException.badRequest("UNSUPPORTED_SCHEMA_VERSION", "仅支持 schemaVersion 1.x");
        }
        if (request.snapshotVersion() == null || request.snapshotVersion() < 0) {
            throw BusinessException.badRequest("INVALID_SNAPSHOT_VERSION", "snapshotVersion 必须是非负整数");
        }
        if (trimToNull(request.pageId()) == null) {
            throw BusinessException.badRequest("MISSING_PAGE_ID", "pageId 不能为空");
        }
        if (request.questions().size() > properties.getMaxQuestionsPerBatch()) {
            throw BusinessException.badRequest(
                    "BATCH_TOO_LARGE",
                    "单次最多处理 " + properties.getMaxQuestionsPerBatch() + " 道题，请分页调用");
        }
    }

    private void logSummary(QuestionBatchRequest request,
                            List<QuestionResultDto> results,
                            List<BatchErrorDto> errors,
                            long startedAt) {
        long answered = count(results, ResultStatus.ANSWERED);
        long uncertain = count(results, ResultStatus.UNCERTAIN);
        long invalid = count(results, ResultStatus.INVALID_INPUT);
        long failed = count(results, ResultStatus.FAILED);

        // 只记录统计信息，不记录题干内容，避免日志沉淀题目文本。
        log.info("解题完成：pageId={} requestId={} 题目={} answered={} uncertain={} invalid={} failed={} errors={} 耗时={}ms",
                request.pageId(),
                request.requestId(),
                results.size(),
                answered,
                uncertain,
                invalid,
                failed,
                errors.size(),
                System.currentTimeMillis() - startedAt);
    }

    private long count(List<QuestionResultDto> results, ResultStatus status) {
        return results.stream().filter(result -> status.name().equals(result.status())).count();
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
