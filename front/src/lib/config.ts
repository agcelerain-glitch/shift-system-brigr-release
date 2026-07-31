// 店舗・件名などサイト固有の設定値。変更時はここだけ修正すればOK
// TemplateCode型もここで定義し、types.tsから参照する設計（循環参照なし）

// ---- テンプレートコード（A〜D帯） ----
export type TemplateCode = 'A' | 'B' | 'C' | 'D';

// ---- 場所選択肢（「指定なし」はUI側で先頭に追加） ----
export const PLACE_OPTIONS = ['本店', '支店A', '支店B', '倉庫'] as const;
export type PlaceOption = typeof PLACE_OPTIONS[number];

// ---- テンプレートA〜Dの表示ラベル ----
export const TEMPLATE_LABELS: Record<TemplateCode, string> = {
  A: 'A帯',
  B: 'B帯',
  C: 'C帯',
  D: 'D帯',
};

// ---- テンプレートA〜Dの目安時間（26:00=翌2:00、LAST=閉店）----
export const TEMPLATE_TIMES: Record<TemplateCode, { start: string; end: string }> = {
  A: { start: '20:00', end: 'LAST' },
  B: { start: '20:30', end: '26:00' },
  C: { start: '21:30', end: 'LAST' },
  D: { start: '22:00', end: '26:00' },
};

// ---- シフト申請フォームの件名選択肢（ラベルにTEMPLATE_TIMESの時間帯を自動表示）----
export const SUBJECT_OPTIONS: { value: TemplateCode | 'time'; label: string; hasTime: boolean }[] = [
  { value: 'A', label: `${TEMPLATE_LABELS.A}（${TEMPLATE_TIMES.A.start}〜${TEMPLATE_TIMES.A.end}）`, hasTime: false },
  { value: 'B', label: `${TEMPLATE_LABELS.B}（${TEMPLATE_TIMES.B.start}〜${TEMPLATE_TIMES.B.end}）`, hasTime: false },
  { value: 'C', label: `${TEMPLATE_LABELS.C}（${TEMPLATE_TIMES.C.start}〜${TEMPLATE_TIMES.C.end}）`, hasTime: false },
  { value: 'D', label: `${TEMPLATE_LABELS.D}（${TEMPLATE_TIMES.D.start}〜${TEMPLATE_TIMES.D.end}）`, hasTime: false },
  { value: 'time', label: '時間指定', hasTime: true },
];
