import test from 'node:test';
import assert from 'node:assert/strict';

import { SnapshotManager } from '../content/snapshot-manager.js';

function entry(questionId) {
  return { question: { questionId }, refs: { node: null }, issues: [] };
}

test('提交采集结果会生成新版本并保存题目映射', () => {
  const manager = new SnapshotManager({ pageId: 'page-fixed' });
  const meta = manager.commit([entry('q1'), entry('q2')]);

  assert.equal(meta.pageId, 'page-fixed');
  assert.equal(meta.snapshotVersion, 1);
  assert.equal(meta.questionCount, 2);
  assert.deepEqual(
    manager.questions.map((question) => question.questionId),
    ['q1', 'q2'],
  );
  assert.equal(manager.find('q2').question.questionId, 'q2');
});

test('重新采集会让旧版本结果过期', () => {
  const manager = new SnapshotManager({ pageId: 'page-fixed' });
  manager.commit([entry('q1')]);

  const oldResponse = { pageId: 'page-fixed', snapshotVersion: 1 };
  assert.equal(manager.isStale(oldResponse), false);

  manager.commit([entry('q1')]);

  // 版本已升到 2，基于版本 1 的结果必须作废。
  assert.equal(manager.isStale(oldResponse), true);
  assert.equal(
    manager.isStale({ pageId: 'page-fixed', snapshotVersion: 2 }),
    false,
  );
});

test('翻页后换新 pageId 并清空映射', () => {
  const manager = new SnapshotManager({ pageId: 'page-old' });
  manager.commit([entry('q1')]);

  const newPageId = manager.rotatePage();

  assert.notEqual(newPageId, 'page-old');
  assert.equal(manager.pageId, newPageId);
  assert.equal(manager.entries.size, 0);
  assert.equal(manager.isStale({ pageId: 'page-old', snapshotVersion: 1 }), true);
});
