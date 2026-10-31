'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isAutoDenyTarget, buildBeforeState, toMs, toDateStr, todayJST } = require('../src/auto-deny');

const CUTOFF = '2026-11-01';

test('isAutoDenyTarget: plan かつ 過去日 → true', () => {
  assert.equal(isAutoDenyTarget({ status: 'plan', date: '2026-10-31' }, CUTOFF), true);
});
test('isAutoDenyTarget: plan かつ 当日 → false（当日は対象外）', () => {
  assert.equal(isAutoDenyTarget({ status: 'plan', date: '2026-11-01' }, CUTOFF), false);
});
test('isAutoDenyTarget: plan かつ 未来日 → false', () => {
  assert.equal(isAutoDenyTarget({ status: 'plan', date: '2026-11-02' }, CUTOFF), false);
});
test('isAutoDenyTarget: confirmed は過去でも false', () => {
  assert.equal(isAutoDenyTarget({ status: 'confirmed', date: '2026-10-31' }, CUTOFF), false);
});
test('isAutoDenyTarget: reviewed は過去でも false', () => {
  assert.equal(isAutoDenyTarget({ status: 'reviewed', date: '2026-10-31' }, CUTOFF), false);
});
test('isAutoDenyTarget: delete_requested は過去でも false', () => {
  assert.equal(isAutoDenyTarget({ status: 'delete_requested', date: '2026-10-31' }, CUTOFF), false);
});

test('toMs: number はそのまま返す', () => {
  assert.equal(toMs(1700000000000), 1700000000000);
});
test('toMs: Timestamp(toMillis) を ms に変換', () => {
  assert.equal(toMs({ toMillis: () => 1700000000000 }), 1700000000000);
});
test('toMs: _seconds 形式を ms に変換', () => {
  assert.equal(toMs({ _seconds: 1700000000 }), 1700000000000);
});
test('toMs: null/undefined は undefined', () => {
  assert.equal(toMs(null), undefined);
  assert.equal(toMs(undefined), undefined);
});

test('buildBeforeState: undefined フィールドを除去する', () => {
  const bs = buildBeforeState('abc', {
    memberName: '山田', date: '2026-10-31', status: 'plan', timeType: 'none',
    subject: '不可', version: 3,
    // timeStart/timeEnd/template/place/headcount は未定義（不可シフト）
  });
  assert.equal('timeStart' in bs, false);
  assert.equal('template' in bs, false);
  assert.equal('place' in bs, false);
  assert.equal(bs.id, 'abc');
  assert.equal(bs.version, 3);
  assert.equal(bs.status, 'plan');
});
test('buildBeforeState: version 未設定なら 1 を補完', () => {
  const bs = buildBeforeState('x', { memberName: 'a', date: '2026-10-31', status: 'plan', timeType: 'time', subject: 's' });
  assert.equal(bs.version, 1);
});

test('toDateStr: 1桁の月日をゼロ埋めして YYYY-MM-DD を返す', () => {
  assert.equal(toDateStr(new Date(Date.UTC(2026, 0, 5))), '2026-01-05');
  assert.equal(toDateStr(new Date(Date.UTC(2026, 11, 31))), '2026-12-31');
});

test('todayJST: UTC 0時に正規化された Date を返す', () => {
  const d = todayJST();
  assert.ok(d instanceof Date);
  assert.equal(d.getUTCHours(), 0);
  assert.equal(d.getUTCMinutes(), 0);
  assert.equal(d.getUTCSeconds(), 0);
  assert.equal(d.getUTCMilliseconds(), 0);
});

test('buildBeforeState: 0 など falsy だが undefined でない値は保持する', () => {
  const bs = buildBeforeState('h', {
    memberName: 'a', date: '2026-10-31', status: 'plan', timeType: 'time',
    subject: 's', headcount: 0, version: 2,
  });
  assert.equal('headcount' in bs, true);
  assert.equal(bs.headcount, 0);
});
