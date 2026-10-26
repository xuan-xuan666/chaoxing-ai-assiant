/**
 * 纯文本处理工具。
 * 这一层不接触 DOM，方便在 Node 里直接做单元测试。
 */

/** 选项前的标签前缀，例如 "A."、"B、"、"C)"、"D："。 */
export const OPTION_LABEL_RE = /^\s*([A-Za-z])\s*[.、．:：)）]\s*/;

/**
 * 归一化文本：
 *  - 不换行空格（\u00a0）在网页里很常见，必须先换成普通空格再做比较；
 *  - 连续空格与制表符合并，避免同一题干因为空白差异被当成两道题；
 *  - 保留换行，因为换行在填空题题干里通常有语义。
 */
export function normalizeText(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

/**
 * 把 "B. extends" 拆成 { label: "B", text: "extends" }。
 * 没有前缀时 label 返回 null，交给调用方用序号兜底。
 */
export function splitLabel(raw) {
  const source = normalizeText(raw);
  const matched = OPTION_LABEL_RE.exec(source);
  if (!matched) {
    return { label: null, text: source };
  }
  return {
    label: matched[1].toUpperCase(),
    text: normalizeText(source.slice(matched[0].length)),
  };
}

/**
 * 生成短随机标识。
 * 扩展运行在浏览器里，优先用 crypto.randomUUID；测试环境降级到 Math.random，
 * 只要求“同一批次内不重复”，不要求密码学强度。
 */
export function shortId() {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.randomUUID) {
    return cryptoObj.randomUUID().replace(/-/g, '').slice(0, 12);
  }
  return Math.random().toString(36).slice(2, 10).padEnd(8, '0');
}
