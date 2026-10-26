/**
 * DOM 控件操作的公共工具。
 *
 * 这里是整个项目“最容易踩坑”的一层，原因不是选择器难写，而是：
 *   - 现代前端框架（Vue/React）的输入框是受控组件，直接赋 value 不会触发框架的 onChange；
 *   - 选项经常被隐藏，真正可点的是包裹它的 label；
 *   - 自定义控件没有 input.checked，只能读 aria-checked 或状态类名。
 * 所以所有写入操作后都要“回读校验”，失败就明确返回失败，不做静默处理。
 */

/** 等待一帧，给框架的异步渲染留出时间。 */
export function nextTick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** 读取选项是否已选中：原生控件 → aria → 状态类名，逐级降级。 */
export function isChecked(control) {
  if (!control) return false;
  if (control.input) return Boolean(control.input.checked);

  const target = control.clickTarget;
  const aria = target?.getAttribute?.('aria-checked');
  if (aria != null) return aria === 'true';

  return Boolean(
    target?.classList?.contains('checked') ||
      target?.classList?.contains('is-checked') ||
      target?.classList?.contains('selected'),
  );
}

/** 触发一次真实点击；点 label 比点被隐藏的 input 更可靠。 */
export function clickControl(control) {
  const target = control?.clickTarget || control?.input;
  if (!target) return false;
  target.click();
  return true;
}

/**
 * 以“原生 setter + 事件派发”的方式写入输入框。
 *
 * 关键点：React 会劫持 input.value 的 setter，直接 `el.value = x` 只会改 DOM，
 * 组件的 state 不会更新，提交时拿到的仍是旧值。必须调用原型链上的原生 setter，
 * 再手动派发 input/change 事件，框架才会感知到变化。
 */
export function setNativeValue(element, value) {
  const prototype =
    element.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;

  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  if (descriptor?.set) {
    descriptor.set.call(element, value);
  } else {
    element.value = value;
  }

  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

/** 写入 contenteditable 区域（富文本填空常见）。 */
export function setEditableText(element, value) {
  element.textContent = value;
  element.dispatchEvent(new InputEvent('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

/** 回读输入框当前值。 */
export function readValue(element) {
  if (element.isContentEditable) return element.textContent ?? '';
  return element.value ?? '';
}

/** 统一的成功/失败返回结构，交给 UI 展示。 */
export function ok(message = '已填入') {
  return { ok: true, message };
}

export function fail(message) {
  return { ok: false, message };
}
