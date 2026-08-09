// 店舗・件名などサイト固有の設定値。変更時はここだけ修正すればOK
// TemplateCode型もここで定義し、types.tsから参照する設計（循環参照なし）

// ---- テンプレートコード（A〜D帯） ----
export type TemplateCode = 'A' | 'B' | 'C' | 'D';

// ---- 場所選択肢（「指定なし」はUI側で先頭に追加） ----
export const PLACE_OPTIONS = ['ブリジャール', 'ルチア', 'セラス', 'ルミ・ベガ'] as const;
export type PlaceOption = typeof PLACE_OPTIONS[number];

// ---- 場所ごとの定員（平日・休日。休日=土日） ----
export const PLACE_CAPACITY: Record<string, { weekday: number; weekend: number }> = {
  'ブリジャール': { weekday: 5, weekend: 7 },
  'ルチア': { weekday: 3, weekend: 4 },
  'セラス': { weekday: 1, weekend: 1 },
};

// ---- 超過バッジ用略称 ----
export const PLACE_SHORT: Record<string, string> = {
  'ブリジャール': 'ブ',
  'ルチア': 'ル',
  'セラス': 'チ',
};

// ---- テンプレートA〜Dの表示ラベル ----
export const TEMPLATE_LABELS: Record<TemplateCode, string> = {
  A: 'A帯',
  B: 'B帯',
  C: 'C帯',
  D: 'D帯',
};

// ---- テンプレートA〜Dの目安時間（翌日時刻は00:00形式で保存、表示は displayTime() で「翌」付与）----
export const TEMPLATE_TIMES: Record<TemplateCode, { start: string; end: string }> = {
  A: { start: '20:00', end: 'LAST' },
  B: { start: '20:30', end: '02:00' },
  C: { start: '21:30', end: 'LAST' },
  D: { start: '22:00', end: '02:00' },
};

// 翌日時刻（h < 9）に「翌」を付ける（config内ラベル用ヘルパー）
const fmtEnd = (t: string): string => {
  if (t === 'LAST') return t;
  const h = parseInt(t.split(':')[0], 10);
  return h < 9 ? `翌${t}` : t;
};

// ---- シフト申請フォームの件名選択肢（ラベルにTEMPLATE_TIMESの時間帯を自動表示）----
export const SUBJECT_OPTIONS: { value: TemplateCode | 'time'; label: string; hasTime: boolean }[] = [
  { value: 'A', label: `${TEMPLATE_LABELS.A}（${TEMPLATE_TIMES.A.start}〜${fmtEnd(TEMPLATE_TIMES.A.end)}）`, hasTime: false },
  { value: 'B', label: `${TEMPLATE_LABELS.B}（${TEMPLATE_TIMES.B.start}〜${fmtEnd(TEMPLATE_TIMES.B.end)}）`, hasTime: false },
  { value: 'C', label: `${TEMPLATE_LABELS.C}（${TEMPLATE_TIMES.C.start}〜${fmtEnd(TEMPLATE_TIMES.C.end)}）`, hasTime: false },
  { value: 'D', label: `${TEMPLATE_LABELS.D}（${TEMPLATE_TIMES.D.start}〜${fmtEnd(TEMPLATE_TIMES.D.end)}）`, hasTime: false },
  { value: 'time', label: '時間指定', hasTime: true },
];
