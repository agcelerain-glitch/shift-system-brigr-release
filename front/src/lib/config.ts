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

// ---- テンプレートA〜Dの目安時間 ----
export const TEMPLATE_TIMES: Record<TemplateCode, { start: string; end: string }> = {
  A: { start: '09:00', end: '13:00' },
  B: { start: '13:00', end: '17:00' },
  C: { start: '17:00', end: '21:00' },
  D: { start: '21:00', end: '25:00' },
};

// ---- シフト申請フォームの件名選択肢 ----
export const SUBJECT_OPTIONS: { value: TemplateCode | 'time'; label: string; hasTime: boolean }[] = [
  { value: 'A', label: TEMPLATE_LABELS.A, hasTime: false },
  { value: 'B', label: TEMPLATE_LABELS.B, hasTime: false },
  { value: 'C', label: TEMPLATE_LABELS.C, hasTime: false },
  { value: 'D', label: TEMPLATE_LABELS.D, hasTime: false },
  { value: 'time', label: '時間指定', hasTime: true },
];
