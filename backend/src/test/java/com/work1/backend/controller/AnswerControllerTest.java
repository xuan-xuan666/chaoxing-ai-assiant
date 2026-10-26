package com.work1.backend.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 接口级测试：走完整 Spring MVC 链路，模型客户端使用默认的模拟实现。
 */
@SpringBootTest
@AutoConfigureMockMvc
class AnswerControllerTest {

    @Autowired
    private MockMvc mockMvc;

    private static final String VALID_BODY = """
            {
              "schemaVersion": "1.0",
              "pageId": "page-test",
              "snapshotVersion": 1,
              "requestId": "req-test",
              "questions": [
                {
                  "questionId": "q1",
                  "type": "SINGLE_CHOICE",
                  "stem": "Java 中哪个关键字用于继承类？",
                  "options": [
                    {"optionId": "q1-a", "label": "A", "text": "implements"},
                    {"optionId": "q1-b", "label": "B", "text": "extends"}
                  ],
                  "blanks": []
                }
              ]
            }
            """;

    @Test
    void solvesBatchAndEchoesRequestIdentity() throws Exception {
        mockMvc.perform(post("/api/v1/answers/solve")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_BODY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.requestId").value("req-test"))
                .andExpect(jsonPath("$.pageId").value("page-test"))
                .andExpect(jsonPath("$.snapshotVersion").value(1))
                .andExpect(jsonPath("$.results[0].questionId").value("q1"))
                .andExpect(jsonPath("$.results[0].type").value("SINGLE_CHOICE"))
                .andExpect(jsonPath("$.results[0].status").value("ANSWERED"))
                .andExpect(jsonPath("$.results[0].answer.optionIds[0]").value("q1-b"));
    }

    @Test
    void rejectsEmptyQuestionList() throws Exception {
        String body = """
                {"schemaVersion":"1.0","pageId":"p","snapshotVersion":1,"questions":[]}
                """;

        mockMvc.perform(post("/api/v1/answers/solve")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    @Test
    void rejectsUnsupportedSchemaVersion() throws Exception {
        String body = VALID_BODY.replace("\"1.0\"", "\"2.0\"");

        mockMvc.perform(post("/api/v1/answers/solve")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("UNSUPPORTED_SCHEMA_VERSION"));
    }

    @Test
    void rejectsMalformedJson() throws Exception {
        mockMvc.perform(post("/api/v1/answers/solve")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{not-json"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_JSON"));
    }

    @Test
    void healthEndpointIsUp() throws Exception {
        mockMvc.perform(get("/api/v1/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"));
    }
}
