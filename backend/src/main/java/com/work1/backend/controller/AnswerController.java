package com.work1.backend.controller;

import com.work1.backend.dto.AnswerBatchResponse;
import com.work1.backend.dto.QuestionBatchRequest;
import com.work1.backend.service.AnswerService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 解题接口。
 *
 * 控制器只负责协议接入与参数校验，编排逻辑全部在 AnswerService，
 * 这样后续加异步任务或鉴权时不需要动业务代码。
 */
@RestController
@RequestMapping("/api/v1/answers")
public class AnswerController {

    private final AnswerService answerService;

    public AnswerController(AnswerService answerService) {
        this.answerService = answerService;
    }

    @PostMapping("/solve")
    public AnswerBatchResponse solve(@Valid @RequestBody QuestionBatchRequest request) {
        return answerService.solve(request);
    }
}
