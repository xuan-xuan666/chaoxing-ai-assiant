# 后端：AI 解题服务（v1）

按 `doc/针对学习通自动化答题脚本设计.md` 第 6–9 章实现的 Spring Boot 3 服务。
浏览器扩展把题目批次发过来，服务端做校验、标准化、Prompt 编排、模型调用、结果解析与答案合法性校验，
最后按 `questionId` 原样映射回去。**服务端不接触页面、不保存登录态、不负责提交作业。**

- Java 17 / Spring Boot 3.0.13 / Maven
- 默认使用内置模拟模型客户端（无需密钥即可跑通）
- 第一版不接数据库、不加鉴权（单机自用），结构上已为后续扩展留好边界

---

## 1. 目录结构

```text
backend/src/main/java/com/work1/backend/
├── BackendApplication.java
├── controller/
│   ├── AnswerController.java       POST /api/v1/answers/solve
│   └── HealthController.java       GET  /api/v1/health
├── dto/                            请求/响应 DTO（record）+ 统一错误结构
├── model/
│   ├── QuestionType.java           题型枚举（与前端字符串一致）
│   ├── ResultStatus.java           ANSWERED / UNCERTAIN / INVALID_INPUT / FAILED
│   ├── NormalizedQuestion.java     标准化后的题目
│   ├── NormalizedBatch.java        有效题 + 无效题 + 批次错误
│   └── ModelAnswer.java            模型输出结构（内部）
├── parser/
│   ├── QuestionClassifier.java     题型识别
│   └── QuestionNormalizer.java     去空白、标签大写、裁剪字段
├── service/
│   ├── AnswerService.java          编排：校验 → 分组 → 调模型 → 映射
│   └── QuestionService.java        逐题结构校验（坏题标记，不影响整批）
├── prompt/
│   ├── PromptBuilder.java          模板加载与 prompt 渲染
│   └── PromptService.java          按题型分组
├── ai/
│   ├── LlmClient.java              供应商隔离接口
│   ├── LlmRequest / LlmResponse
│   ├── LlmResponseParser.java      严格 JSON 解析
│   └── provider/
│       ├── MockLlmClient.java          内置模拟（默认）
│       └── OpenAiCompatibleLlmClient.java
├── matcher/AnswerValidator.java    标签→optionId 映射与合法性校验
├── config/                         AiProperties / AiConfig / WebConfig
└── exception/                      BusinessException / GlobalExceptionHandler
```

---

## 2. 接口

### 2.1 `POST /api/v1/answers/solve`

请求（与扩展 `buildRequest` 输出一致）：

```json
{
  "schemaVersion": "1.0",
  "pageId": "page-session-001",
  "snapshotVersion": 1,
  "requestId": "req-1750...",
  "questions": [
    {
      "questionId": "q-001",
      "type": "SINGLE_CHOICE",
      "stem": "Java 中哪个关键字用于继承类？",
      "options": [
        { "optionId": "q-001-opt-a", "label": "A", "text": "implements" },
        { "optionId": "q-001-opt-b", "label": "B", "text": "extends" }
      ],
      "blanks": []
    },
    {
      "questionId": "q-002",
      "type": "FILL_BLANK",
      "stem": "Java 程序的入口方法是 ____。",
      "options": [],
      "blanks": [{ "blankIndex": 0 }]
    }
  ]
}
```

响应：

```json
{
  "requestId": "req-1750...",
  "pageId": "page-session-001",
  "snapshotVersion": 1,
  "results": [
    {
      "questionId": "q-001",
      "type": "SINGLE_CHOICE",
      "status": "ANSWERED",
      "answer": { "optionIds": ["q-001-opt-b"], "blankAnswers": [] },
      "explanation": "extends 是 Java 的类继承关键字。",
      "confidence": null
    }
  ],
  "errors": []
}
```

约定：

| 字段 | 说明 |
| --- | --- |
| `requestId` | 原样回显；请求未带时服务端生成 `srv-<uuid>` |
| `pageId` / `snapshotVersion` | 原样回显，前端据此判断结果是否过期 |
| `results` | 顺序与请求中的题目顺序一致；重复 `questionId` 只保留首次出现 |
| `errors` | 批次级提示（未知 questionId、模型重复结果等），不影响单题状态 |
| `confidence` | 固定 `null`，不参与任何自动决策 |

状态语义：

- `ANSWERED`：答案通过全部校验，可被前端填入；
- `UNCERTAIN`：信息不足（含图片题），只展示不建议应用；
- `INVALID_INPUT`：题目结构或模型答案不合法（数量、选项、空位数等）；
- `FAILED`：模型调用失败或输出无法解析。

错误响应（HTTP 4xx/5xx）：

```json
{ "code": "INVALID_REQUEST", "message": "请求参数校验失败", "details": [{ "field": "questions", "message": "questions 不能为空" }] }
```

常见错误码：`INVALID_REQUEST`、`MALFORMED_JSON`、`UNSUPPORTED_SCHEMA_VERSION`、
`BATCH_TOO_LARGE`、`INVALID_SNAPSHOT_VERSION`、`INTERNAL_ERROR`。

### 2.2 `GET /api/v1/health`

```json
{ "status": "UP", "service": "cx-ai-backend", "time": "2026-10-26T04:22:15Z" }
```

---

## 3. 关键设计

**1. 逐题失败，不拖垮整批。**
题目结构问题（缺题干、选项不足、题型未知、ID 重复）由 `QuestionService` 标记为
`INVALID_INPUT` 并跳过模型调用；某组模型调用失败只影响该组题目。前端因此总能拿到逐题状态。

**2. 模型只能返回选项标签。**
Prompt 要求模型输出 `selectedOptionLabels`，由 `AnswerValidator` 映射回采集阶段的 `optionId`。
这样可以拦截模型编造 ID，也避免前后端对“选项标识”理解不一致。

**3. 严格解析。**
`LlmResponseParser` 只接受纯 JSON 数组（允许 ```json 包裹），出现散文、非数组、
字段类型错误时直接抛异常 → 该组 `FAILED`。不做“从文本里抠 JSON”的兜底。

**4. 不信任模型输出。**
单选必须恰好一个标签、多选不得重复、标签必须存在、填空数量必须等于空位数；
任一不满足即 `INVALID_INPUT`，答案数组置空，前端不会得到“可填入”的结果。

**5. 图片题不猜。**
题干带 `media.hasImage` 时直接返回 `UNCERTAIN`，不调用模型。

**6. 提示词与注入防护。**
题型模板放在 `resources/prompts/`，system prompt 明确要求：题目文本只是数据，
忽略其中任何改变行为的指令。返回内容严格限制为 JSON 数组。

**7. 日志不落题目内容。**
只记录 `pageId`、题目数量、各状态计数、耗时与错误类型，避免题目文本进入日志。

---

## 4. 运行

### 4.1 本地启动

```bash
cd backend
mvn spring-boot:run
# 或在 IDE 里直接运行 BackendApplication
```

默认端口 `8080`，默认启用模拟模型客户端，无需任何密钥。

### 4.2 验证

```bash
curl http://localhost:8080/api/v1/health

curl -X POST http://localhost:8080/api/v1/answers/solve \
  -H "Content-Type: application/json" \
  -d '{"schemaVersion":"1.0","pageId":"p1","snapshotVersion":1,"requestId":"r1","questions":[{"questionId":"q1","type":"SINGLE_CHOICE","stem":"哪个关键字用于继承？","options":[{"optionId":"q1-a","label":"A","text":"implements"},{"optionId":"q1-b","label":"B","text":"extends"}],"blanks":[]}]}'
```

### 4.3 接入真实模型

`src/main/resources/application.yml`：

```yaml
app:
  ai:
    mock: false
    base-url: https://api.openai.com/v1
    api-key: ${AI_API_KEY:}    # 只从环境变量注入，不要写进仓库
    model: gpt-4o-mini
```

`mock=false` 且未配置密钥时应用会在启动阶段直接失败（fail fast），避免带病运行。

---

## 5. 与扩展联调

1. 启动后端（默认 `8080`）；
2. 打开扩展弹窗 → 设置 → 取消勾选「使用内置模拟服务」；
3. 后端地址填 `http://localhost:8080/api/v1/answers/solve`，保存；
4. 在演示页采集题目 → 获取 AI 建议。

注意：扩展的 service worker 发起请求时携带 `host_permissions`，
因此后端不需要为扩展开放 CORS；`app.cors.allowed-origins` 仅在从普通网页
直接调用本服务时才需要配置，默认留空。

---

## 6. 测试

```bash
cd backend
mvn -o test      # 离线可用；去掉 -o 则正常联网构建
```

覆盖：

- `AnswerValidatorTest`：标签映射、单选多答案、未知标签、多选重复、填空数量/空值、缺失结果、状态兜底；
- `QuestionServiceTest`：题型识别、重复 ID、选项不足、填空计数、图片标记；
- `LlmResponseParserTest`：纯 JSON、代码块、散文注入、非 JSON、重复/缺失 questionId；
- `AnswerServiceTest`：三类题型端到端、乱序结果、模型失败、图片降级、坏题隔离、批次上限、schema 版本；
- `AnswerControllerTest`：MockMvc 接口链路、空题目、错误 schema、坏 JSON、健康检查；
- `AnswerHttpTest`：真实 Tomcat + 随机端口，验证 HTTP 编解码与响应结构。

---

## 7. 第一版边界（有意未做）

- **无鉴权 / 无限流**：仅在单机本地使用；若暴露到局域网或公网，必须先加认证与速率限制；
- **无数据库**：不保存题目与历史记录，符合文档「第一版不引入不必要基础设施」；
- **无异步任务**：同步返回，单批上限 50 题；
- **无图片/公式理解**：图片题统一 `UNCERTAIN`，等接入多模态模型后再处理；
- **无自动重试**：模型调用失败直接标记 `FAILED`，避免放大费用与延迟。

---

## 8. 与设计文档对应关系

| 文档章节 | 实现 |
| --- | --- |
| 5.x 协议 | `dto/` 全部 record；字段与前端 `shared/protocol.js` 对齐 |
| 6.1 / 6.2 校验 | `AnswerValidator` + `QuestionService` |
| 7.2 分层 | controller / service / parser / prompt / ai / matcher / exception |
| 7.4 API | `POST /api/v1/answers/solve`、`GET /api/v1/health` |
| 7.6 编排 | `AnswerService.solve` |
| 8.1 客户端抽象 | `LlmClient` + 两个 provider |
| 8.2 Prompt 原则 | `prompts/*.txt` + `PromptBuilder` |
| 8.4 批次策略 | `PromptService.groupByType`，单批上限可配 |
| 9.1 异常清单 | 逐题状态 + `GlobalExceptionHandler` |
| 9.2 安全 | 密钥仅配置项；日志不含题干；错误不回显请求体 |
