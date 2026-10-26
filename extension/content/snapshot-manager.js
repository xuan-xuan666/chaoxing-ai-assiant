import { shortId } from '../shared/text.js';

/**
 * 快照管理：维护 pageId、snapshotVersion 与题目/DOM 引用映射。
 *
 * 这层解决文档 3.4 的核心问题：请求发出后页面可能已经翻页或重新渲染，
 * 回来的答案不能再往新页面上填。判定依据只有“批次 + 版本”，
 * 任何不匹配都标记过期，绝不按“最相似题目”兜底。
 */
export class SnapshotManager {
  constructor({ pageId = `page-${shortId()}` } = {}) {
    this.pageId = pageId;
    this.version = 0;
    this.capturedAt = 0;
    /** @type {Map<string, { question: object, refs: object, issues: string[] }>} */
    this.entries = new Map();
  }

  /** 题目数组，顺序与采集顺序一致；发送请求时使用。 */
  get questions() {
    return [...this.entries.values()].map((entry) => entry.question);
  }

  /**
   * 提交一批新采集结果。
   * 每次提交都会让 version 自增，使之前发出的请求结果全部失效。
   */
  commit(entries) {
    this.version += 1;
    this.entries = new Map(
      entries.map((entry) => [entry.question.questionId, entry]),
    );
    this.capturedAt = Date.now();
    return {
      pageId: this.pageId,
      snapshotVersion: this.version,
      questionCount: this.entries.size,
    };
  }

  /** 按 questionId 找采集记录（含 DOM 引用）。 */
  find(questionId) {
    return this.entries.get(questionId) ?? null;
  }

  /** 判断后端结果是否仍对应当前页面快照。 */
  isStale(response) {
    if (!response) return true;
    if (response.pageId !== this.pageId) return true;
    return Number(response.snapshotVersion) !== this.version;
  }

  /** 翻页或整页重新渲染时调用：换一个新的 pageId，并清空旧映射。 */
  rotatePage() {
    this.pageId = `page-${shortId()}`;
    this.version = 0;
    this.capturedAt = 0;
    this.entries.clear();
    return this.pageId;
  }
}
