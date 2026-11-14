// 当日ポジション配置の純粋ロジック（UI非依存・テスト可能）
// AdminLinePage からロジックを切り出し、確定シフトとの整合化（reconcile）を一元化する。

export type PositionRow = {
  id: string;
  position: string;
  positionCustom: string;     // other1 の自由記入名
  selectedMembers: string[];  // チップ選択したメンバー名（確定シフト＋固定メンバーに紐づく）
  freeInputName: string;      // 直接入力（急な交代・未登録者。確定シフトに紐づかない手動上書き）
};

// 配置行1つから「送信対象の人名リスト」を解決する。
// selectedMembers（チップ）＋ freeInputName（, / 、区切り）を結合。
export function resolveRowPersons(row: PositionRow): string[] {
  const persons: string[] = [...row.selectedMembers];
  row.freeInputName
    .split(/[,、]/)
    .map((n) => n.trim())
    .filter(Boolean)
    .forEach((n) => persons.push(n));
  return persons;
}

// グループ送信用のポジション配置メッセージを組み立てる（純粋関数）。
// place は表示用に解決済みの文字列（指定なしなら ''）を渡す。
export function buildPositionMessage(input: {
  dateLabel: string;
  place: string;
  rows: PositionRow[];
  memo: string;
}): string {
  let msg = `📅 ${input.dateLabel} ポジション配置`;
  if (input.place) msg += `\n📍 ${input.place}`;
  msg += '\n';
  for (const row of input.rows) {
    const posName = row.position === 'other1' ? row.positionCustom.trim() : row.position;
    if (!posName) continue;
    const persons = resolveRowPersons(row);
    if (persons.length === 0) continue;
    msg += `\n▸ ${posName}: ${persons.join('、')}`;
  }
  if (input.memo.trim()) msg += `\n\n${input.memo.trim()}`;
  return msg;
}

// 選択済みメンバー（チップ）を、現在有効なメンバー集合 allowed に整合化する。
// 確定が取り消された（否認・復元などで allowed から消えた）メンバーを selectedMembers から除去する。
// freeInputName（手動上書き）は確定シフトに紐づかないため対象外。
export function pruneSelectedMembers(
  rows: PositionRow[],
  allowed: ReadonlySet<string>,
): { rows: PositionRow[]; removed: string[]; changed: boolean } {
  const removed: string[] = [];
  let changed = false;
  const nextRows = rows.map((r) => {
    const kept = r.selectedMembers.filter((n) => allowed.has(n));
    if (kept.length === r.selectedMembers.length) return r;
    changed = true;
    for (const n of r.selectedMembers) {
      if (!allowed.has(n) && !removed.includes(n)) removed.push(n);
    }
    return { ...r, selectedMembers: kept };
  });
  return { rows: changed ? nextRows : rows, removed, changed };
}
