// 日付・文字列ユーティリティ

// toISOString()はUTC変換するためJSTで日付がズレる。ローカル日付文字列を返す
const toDateStr = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const todayStr = (): string => toDateStr(new Date());

export const addDays = (date: string, delta: number): string => {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return toDateStr(d);
};

export const formatDateJP = (date: string): string => {
  const d = new Date(date + 'T00:00:00');
  const w = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  return `${d.getMonth() + 1}月${d.getDate()}日(${w})`;
};

export const formatDateTimeJP = (ms: number): string => {
  const d = new Date(ms);
  const w = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()}(${w}) ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
};

export const isPast7Days = (ms: number): boolean => Date.now() - ms < 7 * 24 * 60 * 60 * 1000;

// 月のカレンダーグリッド(6週=42日)を返す（UTCズレ修正済み）
export const getMonthGrid = (year: number, month: number): string[] => {
  const first = new Date(year, month, 1);
  const startOffset = first.getDay(); // 0=日曜
  const days: string[] = [];
  for (let i = 0; i < 42; i++) {
    days.push(toDateStr(new Date(year, month, 1 - startOffset + i)));
  }
  return days;
};

export const getMonthLabel = (year: number, month: number): string => `${year}年${month + 1}月`;

// 指定日が属する週の日曜日を返す
export const getWeekStart = (date: string): string => {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() - d.getDay());
  return toDateStr(d);
};

// 2週間分（14日）の日付配列を返す
export const getTwoWeekGrid = (weekStart: string): string[] =>
  Array.from({ length: 14 }, (_, i) => addDays(weekStart, i));

// 週ラベル「8/2の週」
export const getWeekLabel = (weekStart: string): string => {
  const d = new Date(weekStart + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}の週`;
};

export const weekdayJP = (date: string): string => {
  const d = new Date(date + 'T00:00:00');
  return ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
};

export const weekdayColor = (date: string): string => {
  const d = new Date(date + 'T00:00:00');
  const w = d.getDay();
  if (w === 0) return 'text-red-500';
  if (w === 6) return 'text-blue-500';
  return 'text-gray-700';
};

export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};
