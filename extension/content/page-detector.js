import { findQuestionNodes } from './dom-adapter.js';

/**
 * 页面检测器：只回答“这个页面能不能处理”，不做任何采集。
 * 检测失败时返回明确原因，让 popup 显示可理解的提示（文档 9.1）。
 */
export function detectPage(root = document) {
  if (!root || typeof root.querySelectorAll !== 'function') {
    return {
      supported: false,
      count: 0,
      reason: '当前上下文没有可访问的 DOM，请确认页面已加载完成。',
    };
  }

  const nodes = findQuestionNodes(root);
  if (nodes.length === 0) {
    return {
      supported: false,
      count: 0,
      reason:
        '未识别到题目区域。可能是页面尚未异步加载完成，或当前页面结构不受支持。',
    };
  }

  return {
    supported: true,
    count: nodes.length,
    reason: `识别到 ${nodes.length} 道题目。`,
    nodes,
  };
}
