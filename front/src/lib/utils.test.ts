// 実行: node --test --experimental-strip-types front/src/lib/utils.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { approvalLogRestoreState } from './utils.ts';

const DAY = 24 * 60 * 60 * 1000;
const now = 1_700_000_000_000;

test('approvalLogRestoreState: 7日以内・未復元・スナップショット有り → restorable', () => {
  assert.equal(
    approvalLogRestoreState({ beforeState: { id: 's1' }, createdAt: now - 1 * DAY }, now),
    'restorable',
  );
});

test('approvalLogRestoreState: 7日超 → expired', () => {
  assert.equal(
    approvalLogRestoreState({ beforeState: { id: 's1' }, createdAt: now - 8 * DAY }, now),
    'expired',
  );
});

test('approvalLogRestoreState: restoredAt あり → consumed（復元済みは最優先、期限切れでもconsumed）', () => {
  assert.equal(
    approvalLogRestoreState({ beforeState: { id: 's1' }, createdAt: now - 1 * DAY, restoredAt: now - 1000 }, now),
    'consumed',
  );
  assert.equal(
    approvalLogRestoreState({ beforeState: { id: 's1' }, createdAt: now - 9 * DAY, restoredAt: now - 1000 }, now),
    'consumed',
  );
});

test('approvalLogRestoreState: beforeState なし → no_snapshot', () => {
  assert.equal(
    approvalLogRestoreState({ beforeState: null, createdAt: now - 1 * DAY }, now),
    'no_snapshot',
  );
});
