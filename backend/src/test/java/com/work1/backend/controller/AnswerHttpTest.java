package com.work1.backend.controller;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 真实 HTTP 测试：启动内嵌 Tomcat（随机端口），验证 JSON 编解码与路由，
 * 比 MockMvc 更接近扩展实际调用后端的方式。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AnswerHttpTest {

    @Autowired
    private TestRestTemplate restTemplate;

    private static final String BODY = """
            {
              "schemaVersion": "1.0",
              "pageId": "page-http",
              "snapshotVersion": 2,
              "requestId": "req-http",
              "questions": [
                {
                  "questionId": "q1",
                  "type": "SINGLE_CHOICE",
                  "stem": "哪个关键字用于继承类？",
                  "options": [
                    {"optionId": "q1-a", "label": "A", "text": "implements"},
                    {"optionId": "q1-b", "label": "B", "text": "extends"}
                  ],
                  "blanks": []
                },
                {
                  "questionId": "q2",
                  "type": "FILL_BLANK",
                  "stem": "入口方法是 ____，返回类型是 ____。",
                  "options": [],
                  "blanks": [{"blankIndex": 0}, {"blankIndex": 1}]
                }
              ]
            }
            """;

    @Test
    void solveOverRealHttp() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);

        ResponseEntity<JsonNode> response = restTemplate.postForEntity(
                "/api/v1/answers/solve",
                new HttpEntity<>(BODY, headers),
                JsonNode.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        JsonNode json = response.getBody();
        assertThat(json).isNotNull();
        assertThat(json.path("requestId").asText()).isEqualTo("req-http");
        assertThat(json.path("pageId").asText()).isEqualTo("page-http");
        assertThat(json.path("snapshotVersion").asInt()).isEqualTo(2);

        JsonNode results = json.path("results");
        assertThat(results).hasSize(2);
        assertThat(results.get(0).path("questionId").asText()).isEqualTo("q1");
        assertThat(results.get(0).path("status").asText()).isEqualTo("ANSWERED");
        // 模拟客户端固定选 B，验证 label → optionId 的映射确实发生。
        assertThat(results.get(0).path("answer").path("optionIds").get(0).asText())
                .isEqualTo("q1-b");
        assertThat(results.get(1).path("answer").path("blankAnswers")).hasSize(2);
        // 中文经过 JSON 编解码后必须仍然正确，避免平台默认编码把提示信息变成乱码。
        assertThat(results.get(0).path("explanation").asText()).contains("模拟数据");
    }

    @Test
    void healthOverRealHttp() {
        ResponseEntity<JsonNode> response = restTemplate.getForEntity("/api/v1/health", JsonNode.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().path("status").asText()).isEqualTo("UP");
    }
}
