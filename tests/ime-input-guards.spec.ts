import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * IME 合成期守卫契约（R18 全生态专项 / R19 固化为回归保护）：
 * 输入框挂载的 Enter/Escape/Arrow 键盘流必须在 isComposing || keyCode === 229 时
 * 整体让路给输入法，防止拼音候选确认键被误判为提交/判定 (8 处)。
 */
describe('IME Input Guard Contracts (R18/R19)', () => {
  const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
  const guard = /(?:e|event)\.isComposing\s*\|\|\s*(?:e|event)\.keyCode === 229/g;
  const count = (src: string) => (src.match(guard) || []).length;

  it('deck-manager: 卡包创建与改名输入让路 (2 处)', () => {
    expect(count(read('src/ui/deck-manager.svelte'))).toBe(2);
  });

  it('deck-picker: 挂载级 Enter 确认让路', () => {
    expect(count(read('src/ui/deck-picker.svelte'))).toBe(1);
  });

  it('goals-page: 编辑模式保存/取消让路', () => {
    expect(count(read('src/ui/goals-page.svelte'))).toBe(1);
  });

  it('manager: 批量卡组命名让路', () => {
    expect(count(read('src/ui/manager.svelte'))).toBe(1);
  });

  it('relations-panel: 关联目标提交让路', () => {
    expect(count(read('src/ui/relations-panel.svelte'))).toBe(1);
  });

  it('ReviewAnswerSection: 打字题判定让路', () => {
    expect(count(read('src/ui/review/ReviewAnswerSection.svelte'))).toBe(1);
  });

  it('ReviewInteractiveQuiz: 填空题判定让路', () => {
    expect(count(read('src/ui/review/ReviewInteractiveQuiz.svelte'))).toBe(1);
  });
});
