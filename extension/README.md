# AI 学习助手 · Chrome 扩展（v0.1）

按 `doc/针对学习通自动化答题脚本设计.md` 实现的**前端部分**。当前版本不需要后端即可完整跑通：
内置模拟解题服务会返回与真实接口一致的结构，方便先验证「采集 → 请求 → 校验 → 预览 → 确认填入」这条链路。

> 边界：扩展只负责**把建议答案填入表单**，不会点击提交按钮，不读取 Cookie/账号信息，
> 不绕过任何平台访问控制。是否提交由使用者自己决定。

---

## 1. 目录结构

```text
extension/
├── manifest.json              MV3 配置：最小权限，仅允许 localhost 演示页
├── package.json               仅用于 node --test，不影响扩展加载
├── background/
│   ├── service-worker.js      跨域请求后端 / 读写设置
│   └── mock-solver.js         内置模拟服务（后端未就绪时使用）
├── content/
│   ├── boot.js                经典脚本入口，动态 import ESM 主模块
│   ├── main.js                主流程编排与 popup 消息处理
│   ├── page-detector.js       页面是否可识别
│   ├── dom-adapter.js         唯一接触页面结构的地方（选择器集中于此）
│   ├── question-parser.js     统一题目对象、ID 分配、字段校验（纯逻辑，可测）
│   ├── snapshot-manager.js    pageId / snapshotVersion / 题目映射
│   ├── answer-mapper.js       响应校验与按 ID 映射（纯逻辑，可测）
│   ├── api-client.js          构建请求、经 background 调后端
│   ├── result-renderer.js     Shadow DOM 结果面板
│   └── fillers/
│       ├── base-filler.js     填充器基类
│       ├── answer-filler.js   按题型分发
│       ├── single-choice-filler.js
│       ├── multiple-choice-filler.js
│       ├── fill-blank-filler.js
│       └── control-utils.js   勾选判定、原生 setter、事件派发、回读
├── popup/                     采集/请求/设置界面
├── shared/
│   ├── protocol.js            题型、状态、消息动作、协议版本
│   └── text.js                文本归一化、选项标签拆分、短 ID
└── tests/                     node:test 单元测试（24 项）
demo/
└── mock-quiz.html             本地靶场：单选 / 多选 / 填空 + 动态追加题目
```

---

## 2. 安装与运行

### 2.1 启动演示页

在**仓库根目录**起一个静态服务（内容脚本只匹配 `http://localhost/*`）：

```bash
python -m http.server 8080
# 或者 npx serve -l 8080
```

打开 `http://localhost:8080/demo/mock-quiz.html`。

### 2.2 加载扩展

1. 打开 `chrome://extensions`，开启右上角「开发者模式」；
2. 点「加载已解压的扩展程序」，选择本仓库的 `extension/` 目录；
3. **刷新演示页**（扩展安装后已打开的页面不会自动注入内容脚本）。

### 2.3 使用

1. 点工具栏图标 → 「1. 采集题目」，弹窗会列出题型与题干摘要；
2. 点「2. 获取 AI 建议」，默认走内置模拟服务，约 250ms 返回；
3. 页面右下角出现结果面板，逐题查看建议答案与解析；
4. 点「应用本题」或「应用全部」——这一步就是人工确认；
5. 自己核对无误后，**由你手动点击页面上的提交按钮**。

演示页的「提交作业」按钮只会弹一个 alert，用来确认扩展确实没有自动提交。

### 2.4 切换真实后端

在弹窗「设置」里取消勾选「使用内置模拟服务」，填入接口地址（默认
`http://localhost:8080/api/v1/answers/solve`），保存。后端需要返回设计文档 5.4 的结构。

跨域请求由 service worker 发出，因此后端地址的 origin 必须出现在 `manifest.json`
的 `host_permissions` 中，否则会被浏览器拦截。

---

## 3. 数据协议（与设计文档第 5 章一致）

请求：

```json
{
  "schemaVersion": "1.0",
  "pageId": "page-3f2a…",
  "snapshotVersion": 1,
  "requestId": "req-1750…",
  "questions": [
    {
      "questionId": "demo-q1",
      "type": "SINGLE_CHOICE",
      "stem": "Java 中哪个关键字用于继承类？",
      "options": [
        { "optionId": "demo-q1-opt-a", "label": "A", "text": "implements" },
        { "optionId": "demo-q1-opt-b", "label": "B", "text": "extends" }
      ],
      "blanks": []
    }
  ]
}
```

响应：`requestId` / `pageId` / `snapshotVersion` 必须原样回显；`results[]` 中每题带
`questionId`、`type`、`status`、`answer.optionIds`、`answer.blankAnswers`、`explanation`。

字段约定：

| 字段 | 说明 |
| --- | --- |
| `questionId` | 页面自带 ID 优先，否则生成 `q-{序号}-{随机}`；重复 ID 自动加后缀 |
| `optionId` | 采集阶段生成 `${questionId}-opt-a/b/c`，**模型不得自由生成** |
| `type` | `SINGLE_CHOICE` / `MULTIPLE_CHOICE` / `FILL_BLANK` |
| `blanks[].blankIndex` | 同题内填空序号，与 `blankAnswers` 下标对应 |
| `media` | 可选；`hasImage` / `hasCode` / `hasTable`，用于后端判断是否降级为人工 |

---

## 4. 两个关键难点的实现方式

### 4.1 如何采集页面内容

- **不读 `body.innerText`**：先由 `page-detector` 找到题目容器，再逐题解析；
- `dom-adapter` 按「语义类名 → 控件类型 → 向上回溯」三级策略定位，选择器全部集中在该文件；
- 题型由控件类型判定：`radio → 单选`、`checkbox → 多选`、只有输入框 → 填空；
  判断不出来时返回 `UNKNOWN_TYPE` 并跳过，**不猜**；
- 题干跳过选项容器内部节点，图片追加 `[图片: alt]` 文本；
- 解析不出有效题目时提示「页面结构不支持」，不发送空批次。

### 4.2 如何保证答案填到正确题目

三层保障：

1. **ID 驱动**：结果按 `questionId` 映射，响应顺序被打乱也不会错位（模拟服务故意倒序返回，测试里专门覆盖）；
2. **快照校验**：`pageId` + `snapshotVersion` + `requestId` 任一不符 → 整批 `STALE`，不应用；
3. **回填校验**：填完立即回读 DOM（`checked` / `value`），不一致就报失败并提示人工处理。

回填细节：

- 单选点 `label`（不是隐藏的 input），点完回读；
- 多选做「状态收敛」：该选的选上、不该选的取消，避免残留勾选导致答案集合偏大；
- 填空用**原生 setter + input/change 事件**写入，否则 React/Vue 受控组件拿不到新值；
- 填空数量与答案数量不一致时直接跳过，宁可不填也不填错位。

---

## 5. 测试

```bash
cd extension
npm test
```

等价于：

```bash
node --test --test-isolation=none tests/answer-mapper.test.js tests/question-parser.test.js tests/snapshot-manager.test.js
```

`--test-isolation=none` 让所有用例在单进程内执行：默认模式下 `node --test` 会为每个文件
spawn 子进程并接管管道，在限制子进程/管道的环境里会报 `EPERM`。

覆盖的边界：结果乱序、快照过期、requestId 串批、未知/重复/缺失结果、单选多答案、
编造 optionId、多选重复、填空数量不符、题型不一致、重复 domId、空题干、空选项。

DOM 解析与填充属于浏览器行为，目前通过演示页人工验证；后续可接入 Playwright 做端到端回归。

---

## 6. 与设计文档的对应关系

| 设计文档 | 实现位置 |
| --- | --- |
| 4.1 目录结构 | 见上方目录（新增 `shared/` 存放协议与文本工具） |
| 4.3 通信方式 | popup ↔ content 用 `chrome.tabs.sendMessage`；content ↔ background 仅跨域请求 |
| 4.4 题型适配器 | `fillers/`，基类 + 三个子类 + 工厂 |
| 5.x 协议 | `shared/protocol.js`、`api-client.js` |
| 6.1 / 6.2 映射与校验 | `answer-mapper.js` |
| 3.4 页面变化 | `snapshot-manager.js` + `main.js` 中 URL 变化时 `rotatePage()` |
| 9.1 异常清单 | 各模块返回 `{ok:false, code, message}`，UI 明确展示 |
| 11.2 必测边界 | `tests/` |
| 12 第 1–2 周 | 已完成采集、协议、预览、映射、回填与测试 |

### 尚未实现（按文档属于后续阶段）

- Spring Boot 后端与真实 LLM 调用（当前由 mock 顶替，接口契约已固定）；
- 历史记录 / MySQL / 异步任务（文档列为 P2）；
- 图片题、公式题的语义理解（当前只透传标记，模拟服务直接返回 `UNCERTAIN`）；
- 针对某个具体站点的专用 adapter（需要你确认有权访问的测试页面后再补选择器）；
- Playwright 端到端测试。

---

## 7. 已知限制

- **选择器是启发式的**：真实页面结构差异较大时可能识别不到，需要在 `dom-adapter.js`
  里补一条候选选择器，不建议在业务代码里散写 `querySelector`；
- 扩展只匹配 `localhost`，这是刻意的最小权限设计；接入自有测试环境时，
  同时修改 `content_scripts.matches`、`host_permissions` 与 `web_accessible_resources.matches`；
- 动态渲染页面在新增题目后需要重新点「采集」，旧结果会随快照版本失效；
- 页面整页刷新后 content script 会重新初始化，需要重新采集。
