// 実行: node --test --experimental-strip-types front/src/lib/position.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  type PositionRow,
  resolveRowPersons,
  buildPositionMessage,
  pruneSelectedMembers,
} from './position.ts';

const row = (over: Partial<PositionRow>): PositionRow => ({
  id: 'p',
  position: 'フロント',
  positionCustom: '',
  selectedMembers: [],
  freeInputName: '',
  ...over,
});

test('resolveRowPersons: チップ選択と自由入力（, / 、区切り）を結合する', () => {
  const r = row({ selectedMembers: ['田中'], freeInputName: '佐藤、鈴木, 高橋' });
  assert.deepEqual(resolveRowPersons(r), ['田中', '佐藤', '鈴木', '高橋']);
});

test('buildPositionMessage: 選択者が居る行のみ出力し、空行はスキップ', () => {
  const msg = buildPositionMessage({
    dateLabel: '11月14日(金)',
    place: 'ブリジャール',
    rows: [
      row({ id: 'a', position: 'フロント', selectedMembers: ['田中'] }),
      row({ id: 'b', position: 'ホール', selectedMembers: [] }), // 空 → スキップ
      row({ id: 'c', position: 'other1', positionCustom: '受付', freeInputName: '山田' }),
    ],
    memo: '遅番は21時集合',
  });
  assert.match(msg, /📍 ブリジャール/);
  assert.match(msg, /▸ フロント: 田中/);
  assert.doesNotMatch(msg, /ホール/); // 空行は出ない
  assert.match(msg, /▸ 受付: 山田/);
  assert.match(msg, /遅番は21時集合/);
});

// ★ ユーザー報告バグの核心: 承認後に否認/復元で確定が取り消されたメンバーは、
//   当日ポジション配置の選択からも自動で外れていなければならない。
test('pruneSelectedMembers: 確定取消メンバーを除去する（固定・在籍確定メンバーは保持）', () => {
  const rows: PositionRow[] = [
    row({ id: 'a', position: 'フロント', selectedMembers: ['田中', '佐藤'] }),
    row({ id: 'b', position: 'ホール', selectedMembers: ['松村'], freeInputName: '外部ヘルプ' }),
  ];
  // 田中の確定が否認/復元で取り消された → allowed から消える
  const allowed = new Set(['佐藤', '松村']); // 固定メンバー松村＋まだ確定の佐藤
  const res = pruneSelectedMembers(rows, allowed);

  assert.equal(res.changed, true);
  assert.deepEqual(res.removed, ['田中']);
  assert.deepEqual(res.rows[0].selectedMembers, ['佐藤']);   // 田中が除去
  assert.deepEqual(res.rows[1].selectedMembers, ['松村']);   // 固定メンバーは保持
  assert.equal(res.rows[1].freeInputName, '外部ヘルプ');     // 手動上書きは不変
});

test('pruneSelectedMembers: 変更が無ければ changed=false かつ同一参照を返す', () => {
  const rows: PositionRow[] = [row({ selectedMembers: ['松村'] })];
  const res = pruneSelectedMembers(rows, new Set(['松村', '田中']));
  assert.equal(res.changed, false);
  assert.deepEqual(res.removed, []);
  assert.equal(res.rows, rows); // 不要な再生成をしない
});
