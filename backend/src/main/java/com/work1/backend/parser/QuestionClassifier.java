package com.work1.backend.parser;

import com.work1.backend.dto.QuestionDto;
import com.work1.backend.model.QuestionType;
import org.springframework.stereotype.Component;

import java.util.Optional;

/**
 * 题型分类器。
 *
 * 只根据请求里显式声明的 type 判断，不猜测页面意图；
 * 无法识别的题型返回 empty，由标准化层标记 INVALID_INPUT。
 */
@Component
public class QuestionClassifier {

    public Optional<QuestionType> classify(QuestionDto question) {
        if (question == null) {
            return Optional.empty();
        }
        return QuestionType.from(question.type());
    }
}
