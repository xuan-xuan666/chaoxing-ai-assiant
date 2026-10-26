/**
 * 经典内容脚本（Classic Script）引导文件。
 *
 * MV3 的 content_scripts 不支持直接声明 ES Module，因此这里保持经典脚本，
 * 再用动态 import 加载 ESM 入口。好处：
 *   1. 业务模块可以正常使用 import/export，也能在 Node 下被单元测试引用；
 *   2. 所有模块都通过 web_accessible_resources 暴露，加载路径可预期。
 */
(async () => {
  try {
    const entry = chrome.runtime.getURL('content/main.js');
    // 动态 import 的模块会被浏览器缓存，重复注入 boot.js 不会重复执行入口逻辑。
    await import(entry);
  } catch (error) {
    // 加载失败通常意味着 manifest 里 web_accessible_resources 配置不完整。
    console.error('[AI-A] 内容脚本模块加载失败：', error);
  }
})();
