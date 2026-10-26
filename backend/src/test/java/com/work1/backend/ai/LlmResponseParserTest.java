package com.work1.backend.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.work1.backend.model.ModelAnswer;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class LlmResponseParserTest {

    private final LlmResponseParser parser = new LlmResponseParser(new ObjectMapper());

    @Test
    void parsesPlainJsonArray() {
        ParsedAnswers parsed = parser.parse("""
                [
                  {"questionId":"q1","status":"ANSWERED","selectedOptionLabels":["B"],"blankAnswers":[],"explanation":"ok"}
                ]
                """);

        ModelAnswer answer = parsed.answers().get("q1");
        assertThat(answer).isNotNull();
        assertThat(answer.selectedOptionLabels()).containsExactly("B");
        assertThat(parsed.errors()).isEmpty();
    }

    @Test
    void parsesJsonWrappedInCodeFence() {
        ParsedAnswers parsed = parser.parse("""
                ```json
                [{"questionId":"q2","status":"UNCERTAIN","selectedOptionLabels":[],"blankAnswers":[]}]
                ```
                """);

        assertThat(parsed.answers()).containsKey("q2");
    }

    @Test
    void rejectsOutputWithExtraProse() {
        // 严格解析：散文里夹 JSON 也不接受，避免从不确定的文本里“抠答案”。
        assertThatThrownBy(() -> parser.parse("好的，答案如下：\n[{\"questionId\":\"q1\"}]"))
                .isInstanceOf(LlmParseException.class);
    }

    @Test
    void rejectsNonJsonOutput() {
        assertThatThrownBy(() -> parser.parse("I cannot answer that."))
                .isInstanceOf(LlmParseException.class);
    }

    @Test
    void rejectsBlankOutput() {
        assertThatThrownBy(() -> parser.parse("   "))
                .isInstanceOf(LlmParseException.class);
    }

    @Test
    void keepsFirstDuplicateAndRecordsError() {
        ParsedAnswers parsed = parser.parse("""
                [
                  {"questionId":"q1","status":"ANSWERED","selectedOptionLabels":["A"]},
                  {"questionId":"q1","status":"ANSWERED","selectedOptionLabels":["C"]}
                ]
                """);

        assertThat(parsed.answers().get("q1").selectedOptionLabels()).containsExactly("A");
        assertThat(parsed.errors())
                .anyMatch(error -> "DUPLICATE_MODEL_RESULT".equals(error.code()));
    }

    @Test
    void recordsMissingQuestionId() {
        ParsedAnswers parsed = parser.parse("""
                [{"status":"ANSWERED","selectedOptionLabels":["A"]}]
                """);

        assertThat(parsed.answers()).isEmpty();
        assertThat(parsed.errors())
                .anyMatch(error -> "MISSING_QUESTION_ID".equals(error.code()));
    }
}
