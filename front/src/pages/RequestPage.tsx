// /request シフト申請: 不可（複数日）/ 申請（テンプレA-D帯 or 時間指定、複数申請対応）/ その他

import { useState } from 'react';
import { UserLayout } from '../components/UserLayout';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useToast } from '../contexts/ToastContext';
import { Card, Button, Input, Select, Badge, EmptyState } from '../components/ui';
import { FilePlus, Ban, Clock, Wallet, CheckCircle2, AlertTriangle, Trash2, Plus } from 'lucide-react';
import { formatDateJP, weekdayJP, displayTime } from '../lib/utils';
import { createShift, findShiftByMemberDate, cancelShift } from '../lib/db';
import { SUBJECT_OPTIONS, TEMPLATE_LABELS, TEMPLATE_TIMES } from '../lib/config';
import type { TemplateCode } from '../lib/config';

type Mode = 'none' | 'apply' | 'other';
type SubjectMode = TemplateCode | 'time';

// ベース時間: 09:00〜23:45（15分刻み）
const BASE_OPTIONS: string[] = [];
for (let h = 9; h < 24; h++) {
  for (const m of [0, 15, 30, 45]) {
    BASE_OPTIONS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
}
// 翌日時間: 翌0:00〜翌8:45（内部値 00:00〜08:45、h<9で「翌」表示）
// 翌日の時刻でも日付は当日のまま保存
const NEXT_DAY_OPTIONS: string[] = [];
for (let h = 0; h <= 8; h++) {
  for (const m of [0, 15, 30, 45]) {
    NEXT_DAY_OPTIONS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
}

// 開始・終了ともに09:00〜翌8:45（同じ範囲）
const START_OPTIONS: string[] = [...BASE_OPTIONS, ...NEXT_DAY_OPTIONS];
const END_OPTIONS: string[] = [...BASE_OPTIONS, ...NEXT_DAY_OPTIONS];

// 終了時刻のバリデーション（h<9は翌日として+24h換算）
const toMinutes = (t: string): number => { const [h, m] = t.split(':').map(Number); const adj = h < 9 ? h + 24 : h; return adj * 60 + m; };
const isTimeInvalid = (start: string, end: string): boolean => toMinutes(start) >= toMinutes(end);

type ApplyEntry = {
  id: string;
  date: string;
  subjectMode: SubjectMode;
  timeAdjust: boolean; // テンプレート選択時に時間を手動調整するフラグ
  timeStart: string;
  timeEnd: string;
  dupWarning: string | null;
};

function newEntry(): ApplyEntry {
  return {
    id: Math.random().toString(36).slice(2),
    date: '',
    subjectMode: 'A',
    timeAdjust: false,
    timeStart: TEMPLATE_TIMES.A.start,
    timeEnd: '02:00',
    dupWarning: null,
  };
}

function dayColor(d: string) {
  const w = weekdayJP(d);
  return w === '日' ? 'text-red-500' : w === '土' ? 'text-blue-500' : 'text-gray-500';
}

export function RequestPage() {
  const { name } = useAuth();
  const { shifts, firestoreError } = useData();
  const toast = useToast();

  const [mode, setMode] = useState<Mode>('apply');
  const [submitting, setSubmitting] = useState(false);
  const [canceling, setCanceling] = useState<string | null>(null);

  const [applyEntries, setApplyEntries] = useState<ApplyEntry[]>([newEntry()]);
  const [noneDates, setNoneDates] = useState<string[]>(['']);
  const [otherDate, setOtherDate] = useState('');

  const myRecent = [...shifts.filter((s) => s.memberName === name)]
    .sort((a, b) => b.date.localeCompare(a.date));

  // --- apply entry helpers ---
  const addApplyEntry = () => setApplyEntries((prev) => [...prev, newEntry()]);
  const removeApplyEntry = (id: string) => setApplyEntries((prev) => prev.filter((e) => e.id !== id));
  const updateApplyEntry = (id: string, patch: Partial<ApplyEntry>) =>
    setApplyEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  // テンプレート変更時: 時間調整をリセットし、デフォルト開始時刻をそのテンプレートに合わせる
  const handleSubjectModeChange = (id: string, mode: SubjectMode) => {
    if (mode === 'time') {
      updateApplyEntry(id, { subjectMode: mode, timeAdjust: false });
    } else {
      const tCode = mode as TemplateCode;
      updateApplyEntry(id, {
        subjectMode: mode,
        timeAdjust: false,
        timeStart: TEMPLATE_TIMES[tCode].start,
        timeEnd: '02:00',
      });
    }
  };

  const checkDupForEntry = async (id: string, date: string) => {

    updateApplyEntry(id, { date, dupWarning: null });
    if (!date || !name) return;
    const existing = await findShiftByMemberDate(name, date);
    updateApplyEntry(id, {
      dupWarning: existing ? `${formatDateJP(date)} は既に申請済みです（${existing.subject}）` : null,
    });
  };

  const entrySubjectLabel = (e: ApplyEntry) =>
    e.subjectMode === 'time'
      ? `時間指定 ${name ?? ''}`
      : `${TEMPLATE_LABELS[e.subjectMode as TemplateCode]} ${name ?? ''}`;

  // --- none date helpers ---
  const addNoneDate = () => setNoneDates((prev) => [...prev, '']);
  const removeNoneDate = (idx: number) => setNoneDates((prev) => prev.filter((_, i) => i !== idx));
  const updateNoneDate = (idx: number, val: string) =>
    setNoneDates((prev) => prev.map((d, i) => (i === idx ? val : d)));
  const validNoneDates = () => [...new Set(noneDates.filter((d) => d !== ''))];

  const resetForm = () => {
    setApplyEntries([newEntry()]);
    setNoneDates(['']);
    setOtherDate('');
  };

  const handleSubmit = async () => {
    if (!name) return;

    if (mode === 'none') {
      const dates = validNoneDates();
      if (dates.length === 0) { toast.show('日付を1つ以上選択してください', 'error'); return; }
      setSubmitting(true);
      try {
        await Promise.all(
          dates.map((d) =>
            createShift({ memberName: name, date: d, timeType: 'none', subject: `不可（シフトなし） ${name}`.trim() })
          )
        );
        toast.show(`${dates.length}日分を「不可」で申請しました`, 'success');
        resetForm();
      } catch (e) { toast.show(`申請に失敗しました: ${(e as Error).message}`, 'error'); }
      finally { setSubmitting(false); }
      return;
    }

    if (mode === 'other') {
      if (!otherDate) { toast.show('日付を選択してください', 'error'); return; }
      setSubmitting(true);
      try {
        await createShift({ memberName: name, date: otherDate, timeType: 'other', subject: `給料受取など ${name}`.trim() });
        toast.show('「その他（給料受取など）」を申請しました', 'success');
        resetForm();
      } catch (e) { toast.show(`申請に失敗しました: ${(e as Error).message}`, 'error'); }
      finally { setSubmitting(false); }
      return;
    }

    const validEntries = applyEntries.filter((e) => e.date !== '');
    if (validEntries.length === 0) { toast.show('日付を1つ以上入力してください', 'error'); return; }
    if (validEntries.some((e) => e.dupWarning)) {
      toast.show('重複申請があります。確認してください', 'error'); return;
    }
    // 時間指定 or テンプレート+時間調整のバリデーション（翌日時刻は常に有効）
    const hasInvalidTime = validEntries.some((e) => {
      const needsTime = e.subjectMode === 'time' || e.timeAdjust;
      return needsTime && isTimeInvalid(e.timeStart, e.timeEnd);
    });
    if (hasInvalidTime) { toast.show('終了時刻は開始時刻より後にしてください', 'error'); return; }

    setSubmitting(true);
    try {
      await Promise.all(
        validEntries.map((e) => {
          if (e.subjectMode === 'time') {
            // 時間指定モード（場所は管理者が承認時に設定）
            return createShift({
              memberName: name,
              date: e.date,
              timeType: 'time',
              timeStart: e.timeStart,
              timeEnd: e.timeEnd,
              subject: entrySubjectLabel(e),
            });
          } else if (e.timeAdjust) {
            // テンプレートだが時間を手動調整 → timeTypeをtimeとして保存（件名はテンプレート名のまま）
            return createShift({
              memberName: name,
              date: e.date,
              timeType: 'time',
              timeStart: e.timeStart,
              timeEnd: e.timeEnd,
              subject: entrySubjectLabel(e),
            });
          } else {
            // 通常テンプレート（場所は管理者が承認時に設定）
            return createShift({
              memberName: name,
              date: e.date,
              timeType: 'template',
              template: e.subjectMode as TemplateCode,
              subject: entrySubjectLabel(e),
            });
          }
        })
      );
      toast.show(`${validEntries.length}件のシフトを申請しました`, 'success');
      resetForm();
    } catch (e) { toast.show(`申請に失敗しました: ${(e as Error).message}`, 'error'); }
    finally { setSubmitting(false); }
  };

  const handleCancel = async (shiftId: string, shiftVersion: number, label: string) => {
    if (!window.confirm(`「${label}」の申請を取り消しますか？`)) return;
    setCanceling(shiftId);
    try {
      const result = await cancelShift(shiftId, shiftVersion);
      if (result === 'forbidden') { toast.show('確定済みのシフトは取り消せません', 'error'); return; }
      if (result === 'conflict') { toast.show('データが更新されました。再度お試しください', 'error'); return; }
      toast.show('申請を取り消しました', 'success');
    } catch { toast.show('取り消しに失敗しました', 'error'); }
    finally { setCanceling(null); }
  };

  const modeCards: { id: Mode; label: string; desc: string; icon: typeof Ban; color: string }[] = [
    { id: 'apply', label: 'シフト申請', desc: '件名・時間を指定して申請（複数可）', icon: Clock, color: 'border-brand-200 hover:border-brand-400' },
    { id: 'none', label: '不可（シフトなし）', desc: '複数日指定で入れない日を申請', icon: Ban, color: 'border-gray-200 hover:border-gray-400' },
    { id: 'other', label: 'その他（給料受取など）', desc: '出勤せず給料のみ受取', icon: Wallet, color: 'border-amber-200 hover:border-amber-400' },
  ];

  const validApplyCount = applyEntries.filter((e) => e.date !== '').length;
  const hasAnyDup = applyEntries.some((e) => e.dupWarning !== null);

  return (
    <UserLayout>
      <div className="mb-4">
        <h1 className="text-lg font-bold text-gray-900">シフト申請</h1>
        <p className="text-sm text-gray-500">まず申請の種類を選んでください</p>
        {firestoreError && (
          <p className="mt-2 text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{firestoreError}</p>
        )}
      </div>

      {/* モード選択カード */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        {modeCards.map((m) => (
          <button
            key={m.id}
            onClick={() => { setMode(m.id); resetForm(); }}
            className={`text-left p-4 rounded-2xl border-2 bg-white transition-all ${mode === m.id ? `${m.color} ring-2 ring-brand-200` : `${m.color} shadow-card`}`}
          >
            <m.icon className={`w-6 h-6 mb-2 ${mode === m.id ? 'text-brand-600' : 'text-gray-400'}`} />
            <p className={`font-medium ${mode === m.id ? 'text-brand-700' : 'text-gray-700'}`}>{m.label}</p>
            <p className="text-xs text-gray-500 mt-0.5">{m.desc}</p>
          </button>
        ))}
      </div>

      {/* === 申請モード: 複数エントリー === */}
      {mode === 'apply' && (
        <div className="space-y-3 mb-4">
          {applyEntries.map((entry, idx) => {
            const isTemplate = entry.subjectMode !== 'time';
            const showTimeFields = !isTemplate || entry.timeAdjust; // 時間指定 or テンプレート+調整あり

            return (
              <Card key={entry.id} className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-brand-600 bg-brand-50 px-2.5 py-0.5 rounded-full">
                    申請 {idx + 1}
                  </span>
                  {applyEntries.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeApplyEntry(entry.id)}
                      className="text-gray-300 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                      aria-label={`申請${idx + 1}を削除`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* 日付 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">日付</label>
                    <Input
                      type="date"
                      value={entry.date}
                      onChange={(e) => checkDupForEntry(entry.id, e.target.value)}
                    />
                    {entry.date && (
                      <p className={`text-xs mt-1 ${dayColor(entry.date)}`}>{formatDateJP(entry.date)}</p>
                    )}
                    {entry.dupWarning && (
                      <p className="text-xs text-red-600 mt-1 flex items-center gap-1 bg-red-50 px-2 py-1 rounded">
                        <AlertTriangle className="w-3.5 h-3.5" />{entry.dupWarning}
                      </p>
                    )}
                  </div>

                  {/* 件名 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">件名（テンプレート）</label>
                    <Select
                      value={entry.subjectMode}
                      onChange={(e) => handleSubjectModeChange(entry.id, e.target.value as SubjectMode)}
                    >
                      {SUBJECT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </Select>
                    <p className="text-xs text-gray-400 mt-1">
                      送信件名:「<strong>{entrySubjectLabel(entry)}</strong>」
                    </p>
                  </div>

                  {/* テンプレート選択時の時間調整トグル */}
                  {isTemplate && (
                    <div className="sm:col-span-2">
                      <button
                        type="button"
                        onClick={() => updateApplyEntry(entry.id, { timeAdjust: !entry.timeAdjust })}
                        className={`flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                          entry.timeAdjust
                            ? 'border-brand-300 bg-brand-50 text-brand-700'
                            : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-700'
                        }`}
                      >
                        <Clock className="w-4 h-4" />
                        {entry.timeAdjust ? '時間調整あり（タップで解除）' : '時間を調整する（遅刻・早退など）'}
                      </button>
                    </div>
                  )}

                  {/* 時間フィールド: 時間指定モード or テンプレート+時間調整 */}
                  {showTimeFields && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">開始時刻</label>
                        <Select
                          value={entry.timeStart}
                          onChange={(e) => updateApplyEntry(entry.id, { timeStart: e.target.value })}
                        >
                          {START_OPTIONS.map((t) => <option key={t} value={t}>{displayTime(t)}</option>)}
                        </Select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">終了時刻</label>
                        <Select
                          value={entry.timeEnd}
                          onChange={(e) => updateApplyEntry(entry.id, { timeEnd: e.target.value })}
                        >
                          {END_OPTIONS.map((t) => <option key={t} value={t}>{displayTime(t)}</option>)}
                        </Select>
                        {isTimeInvalid(entry.timeStart, entry.timeEnd) && (
                          <p className="text-xs text-amber-600 mt-1">終了は開始より後にしてください</p>
                        )}
                      </div>
                    </>
                  )}

                </div>
              </Card>
            );
          })}

          {/* 申請追加ボタン */}
          <button
            type="button"
            onClick={addApplyEntry}
            className="w-full flex items-center justify-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 font-medium py-2.5 border-2 border-dashed border-brand-200 rounded-xl hover:border-brand-400 hover:bg-brand-50 transition-all"
          >
            <Plus className="w-4 h-4" />申請を追加する
          </button>

          {/* 送信ボタン */}
          <div className="flex justify-end">
            <Button size="lg" onClick={handleSubmit} disabled={submitting || hasAnyDup}>
              {submitting
                ? '送信中…'
                : `申請を送信${validApplyCount > 1 ? `（${validApplyCount}件）` : ''}`}
              {!submitting && <CheckCircle2 className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      )}

      {/* === 不可モード === */}
      {mode === 'none' && (
        <Card className="p-5 mb-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700">不可の日付</label>
              <button
                type="button"
                onClick={addNoneDate}
                className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium py-1"
              >
                <Plus className="w-3.5 h-3.5" />日付を追加する
              </button>
            </div>
            {noneDates.map((d, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <div className="flex-1">
                  <Input type="date" value={d} onChange={(e) => updateNoneDate(idx, e.target.value)} />
                  {d && (
                    <p className={`text-xs mt-1 font-medium ${dayColor(d)}`}>（{weekdayJP(d)}）</p>
                  )}
                </div>
                {noneDates.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeNoneDate(idx)}
                    className="text-gray-300 hover:text-red-500 p-2 rounded-lg hover:bg-red-50 transition-colors mt-0.5"
                    aria-label="この日付を削除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            {validNoneDates().length > 0 && (
              <div className="mt-1 flex items-start gap-2 bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">
                <Ban className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  {validNoneDates()
                    .sort()
                    .map((d) => `${formatDateJP(d)}（${weekdayJP(d)}）`)
                    .join('、')} を不可で申請します
                </span>
              </div>
            )}
          </div>
          <div className="mt-5 flex justify-end">
            <Button size="lg" onClick={handleSubmit} disabled={submitting}>
              {submitting
                ? '送信中…'
                : `不可を申請${validNoneDates().length > 0 ? `（${validNoneDates().length}日）` : ''}`}
              {!submitting && <CheckCircle2 className="w-4 h-4" />}
            </Button>
          </div>
        </Card>
      )}

      {/* === その他モード === */}
      {mode === 'other' && (
        <Card className="p-5 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">日付</label>
            <Input type="date" value={otherDate} onChange={(e) => setOtherDate(e.target.value)} />
            {otherDate && (
              <p className={`text-xs mt-1 ${dayColor(otherDate)}`}>{formatDateJP(otherDate)}</p>
            )}
          </div>
          <div className="mt-5 flex justify-end">
            <Button size="lg" onClick={handleSubmit} disabled={submitting}>
              {submitting ? '送信中…' : '申請を送信'}
              {!submitting && <CheckCircle2 className="w-4 h-4" />}
            </Button>
          </div>
        </Card>
      )}

      {/* === 申請一覧 === */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
          <FilePlus className="w-4 h-4" />自分の申請一覧
        </h2>
        {myRecent.length === 0 ? (
          <EmptyState icon={<FilePlus className="w-8 h-8" />} title="まだ申請がありません" />
        ) : (
          <div className="space-y-2">
            {myRecent.map((s) => (
              <div key={s.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Badge color={s.status === 'confirmed' ? 'confirmed' : 'plan'}>
                    {s.status === 'confirmed' ? '確定' : '予定'}
                  </Badge>
                  <span className="text-sm text-gray-700 truncate">{formatDateJP(s.date)} · {s.subject}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-gray-400 hidden sm:inline">
                    {new Date(s.createdAt).toLocaleDateString()}
                  </span>
                  {s.status === 'plan' && (
                    <button
                      onClick={() => handleCancel(s.id, s.version, s.subject)}
                      disabled={canceling === s.id}
                      className="text-gray-300 hover:text-red-500 p-2 rounded-lg hover:bg-red-50 transition-colors"
                      title="申請取消"
                      aria-label="申請を取り消す"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </UserLayout>
  );
}
