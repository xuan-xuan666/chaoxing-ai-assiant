package com.work1.backend.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.work1.backend.ai.LlmClient;
import com.work1.backend.ai.provider.MockLlmClient;
import com.work1.backend.ai.provider.OpenAiCompatibleLlmClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

/**
 * 模型客户端装配。
 *
 * app.ai.mock=true（默认）→ 模拟客户端，开箱即用；
 * app.ai.mock=false        → OpenAI 兼容客户端，缺少密钥时启动即失败（fail fast），
 *                            避免运行到一半才发现配置漏了。
 */
@Configuration
public class AiConfig {

    private static final Logger log = LoggerFactory.getLogger(AiConfig.class);

    @Bean
    @ConditionalOnProperty(prefix = "app.ai", name = "mock", havingValue = "true", matchIfMissing = true)
    public LlmClient mockLlmClient(ObjectMapper objectMapper) {
        log.info("AI 客户端：内置模拟模式（app.ai.mock=true）");
        return new MockLlmClient(objectMapper);
    }

    @Bean
    @ConditionalOnProperty(prefix = "app.ai", name = "mock", havingValue = "false")
    public LlmClient openAiCompatibleLlmClient(AiProperties properties, ObjectMapper objectMapper) {
        if (properties.getApiKey() == null || properties.getApiKey().isBlank()) {
            throw new IllegalStateException(
                    "app.ai.mock=false 时必须配置 app.ai.api-key（建议用环境变量 AI_API_KEY 注入）");
        }

        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(properties.getTimeoutMs());
        factory.setReadTimeout(properties.getTimeoutMs());

        log.info("AI 客户端：OpenAI 兼容接口，model={} baseUrl={}",
                properties.getModel(), properties.getBaseUrl());

        return new OpenAiCompatibleLlmClient(properties, objectMapper, new RestTemplate(factory));
    }
}
