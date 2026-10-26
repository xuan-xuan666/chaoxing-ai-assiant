package com.work1.backend.ai.provider;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.work1.backend.ai.LlmClient;
import com.work1.backend.ai.LlmException;
import com.work1.backend.ai.LlmRequest;
import com.work1.backend.ai.LlmResponse;
import com.work1.backend.config.AiProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * OpenAI 兼容接口客户端（Chat Completions）。
 *
 * 兼容性说明：只依赖 /chat/completions 的最小字段（model、messages、temperature、max_tokens），
 * 因此同样适用于各类兼容网关。
 *
 * 安全：密钥只存在配置里，不写日志、不回传前端；错误信息只保留异常类型。
 */
public class OpenAiCompatibleLlmClient implements LlmClient {

    private static final Logger log = LoggerFactory.getLogger(OpenAiCompatibleLlmClient.class);

    private final AiProperties properties;
    private final ObjectMapper objectMapper;
    private final RestTemplate restTemplate;

    public OpenAiCompatibleLlmClient(AiProperties properties,
                                     ObjectMapper objectMapper,
                                     RestTemplate restTemplate) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.restTemplate = restTemplate;
    }

    @Override
    public LlmResponse generate(LlmRequest request) {
        String url = trimTrailingSlash(properties.getBaseUrl()) + "/chat/completions";

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", properties.getModel());
        body.put("temperature", 0.2);
        body.put("max_tokens", properties.getMaxOutputTokens());
        body.put("messages", List.of(
                Map.of("role", "system", "content", request.systemPrompt()),
                Map.of("role", "user", "content", request.userPrompt())
        ));

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(properties.getApiKey());

        long startedAt = System.currentTimeMillis();

        try {
            ResponseEntity<JsonNode> response = restTemplate.postForEntity(
                    url, new HttpEntity<>(body, headers), JsonNode.class);

            JsonNode root = response.getBody();
            JsonNode contentNode = root == null ? null : root.path("choices").path(0).path("message").path("content");
            String content = contentNode == null || contentNode.isMissingNode() ? null : contentNode.asText();

            if (content == null || content.isBlank()) {
                throw new LlmException("模型响应中没有可用内容");
            }

            log.info("模型调用完成：model={} 耗时={}ms 输出长度={}",
                    properties.getModel(),
                    System.currentTimeMillis() - startedAt,
                    content.length());

            return new LlmResponse(content, properties.getModel());
        } catch (RestClientException ex) {
            // 不打印请求体与密钥，只保留异常类型，避免日志泄露题目内容或凭据。
            log.warn("模型调用失败：{}", ex.getClass().getSimpleName());
            throw new LlmException("模型调用失败，请稍后重试", ex);
        }
    }

    private String trimTrailingSlash(String value) {
        if (value == null || value.isBlank()) {
            throw new LlmException("未配置 app.ai.base-url");
        }
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }
}
