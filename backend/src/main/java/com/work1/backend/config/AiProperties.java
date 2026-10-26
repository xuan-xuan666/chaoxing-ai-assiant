package com.work1.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * AI 相关配置（app.ai.*）。
 *
 * mock=true 时使用内置模拟客户端，保证没有模型密钥也能跑通整条链路；
 * 切到真实模型只需要把 mock 改成 false 并配置 api-key。
 */
@ConfigurationProperties(prefix = "app.ai")
public class AiProperties {

    /** 是否使用内置模拟模型客户端。 */
    private boolean mock = true;

    /** OpenAI 兼容接口的 base url，例如 https://api.openai.com/v1。 */
    private String baseUrl = "https://api.openai.com/v1";

    /** 模型密钥，只允许通过环境变量或本地配置注入，禁止提交到仓库。 */
    private String apiKey = "";

    /** 模型名称。 */
    private String model = "gpt-4o-mini";

    /** 单次模型调用超时（毫秒）。 */
    private int timeoutMs = 20000;

    /** 单批最多题目数，防止误采集整页导致请求过大。 */
    private int maxQuestionsPerBatch = 50;

    /** 单次模型输出上限，避免异常长的响应拖垮解析。 */
    private int maxOutputTokens = 2000;

    public boolean isMock() {
        return mock;
    }

    public void setMock(boolean mock) {
        this.mock = mock;
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public void setBaseUrl(String baseUrl) {
        this.baseUrl = baseUrl;
    }

    public String getApiKey() {
        return apiKey;
    }

    public void setApiKey(String apiKey) {
        this.apiKey = apiKey;
    }

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public int getTimeoutMs() {
        return timeoutMs;
    }

    public void setTimeoutMs(int timeoutMs) {
        this.timeoutMs = timeoutMs;
    }

    public int getMaxQuestionsPerBatch() {
        return maxQuestionsPerBatch;
    }

    public void setMaxQuestionsPerBatch(int maxQuestionsPerBatch) {
        this.maxQuestionsPerBatch = maxQuestionsPerBatch;
    }

    public int getMaxOutputTokens() {
        return maxOutputTokens;
    }

    public void setMaxOutputTokens(int maxOutputTokens) {
        this.maxOutputTokens = maxOutputTokens;
    }
}
