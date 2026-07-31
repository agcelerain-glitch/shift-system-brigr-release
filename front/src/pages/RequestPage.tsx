// /request シフト申請: 不可（複数日指定）/ 申請（テンプレA-D帯 or 時間指定）/ その他（給料受取のみ）

import { useState } from 'react';
import { UserLayout } from '../components/UserLayout';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useToast } from '../contexts/ToastContext';
import { Card, Button, Input, Select, Badge, EmptyState } from '../components/ui';
import { FilePlus, Ban, Clock, Wallet, CheckCircle2, AlertTriangle, Trash2, Plus } from 'lucide-react';
import { formatDateJP, weekdayJP } from '../lib/utils';
import { createShift, findShiftByMemberDate, cancelShift } from '../lib/db';
import { PLACE_OPTIONS, SUBJECT_OPTIONS, TEMPLATE_LABELS } from '../lib/config';
import type { TemplateCode } from '../lib/config';

type Mode = 'none' | 'apply' | 'other';
type SubjectMode = TemplateCode | 'time';

// 15分刻みの時刻リスト 00:00〜23:45
const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (const m of [0, 15, 30, 45]) {
    TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
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
  const [date, setDate] = useState('');
  const [subjectMode, setSubjectMode] = useState<SubjectMode>('A');
  const [timeStart, setTimeStart] = useState('09:00');
  const [timeEnd, setTimeEnd] = useState('17:00');
  const [place, setPlace] = useState('');
  const [placeCustom, setPlaceCustom] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [canceling, setCanceling] = useState<string | null>(null);
  const [dupWarning, setDupWarning] = useState<string | null>(null);

  // 不可モード: 複数日
  const [noneDates, setNoneDates] = useState<string[]>(['']);

  // 件数制限なし・日付降順で全申請を表示
  const myRecent = [...shifts.filter((s) => s.memberName === name)]
    .sort((a, b) => b.date.localeCompare(a.date));
  const currentOption = SUBJECT_OPTIONS.find((o) => o.value === subjectMode)!;

  const subjectLabel = () => {
    if (subjectMode === 'time') return `時間指定 ${name ?? ''}`;
    return `${TEMPLATE_LABELS[subjectMode as TemplateCode]} ${name ?? ''}`;
  };

  const checkDup = async (d: string) => {
    setDate(d);
    if (!d || !name || mode !== 'apply') return;
    const existing = await findShiftByMemberDate(name, d);
    setDupWarning(existing ? `${formatDateJP(d)} は既に申請済みです（${existing.subject}）` : null);
  };

  const resolvedPlace = () => (place === '__other__' ? placeCustom.trim() : place);

  const addNoneDate = () => setNoneDates((prev) => [...prev, '']);
  const removeNoneDate = (idx: number) => setNoneDates((prev) => prev.filter((_, i) => i !== idx));
  const updateNoneDate = (idx: number, val: string) =>
    setNoneDates((prev) => prev.map((d, i) => (i === idx ? val : d)));

  const validNoneDates = () => [...new Set(noneDates.filter((d) => d !== ''))];

  const handleSubmit = async () => {
    if (!name) return;

    if (mode === 'none') {
      const dates = validNoneDates();
      if (dates.length === 0) { toast.show('日付を1つ以上選択してください', 'error'); return; }
      setSubmitting(true);
      try {
        await Promise.all(
          dates.map((d) =>
            createShift({ memberName: name, date: d, timeType: 'none', subject: `不可（シフトなし） ${name ?? ''}`.trim() })
          )
        );
        toast.show(`${dates.length}日分を「不可」で申請しました`, 'success');
        resetForm();
      } catch (e) { toast.show(`申請に失敗しました: ${(e as Error).message}`, 'error'); }
      finally { setSubmitting(false); }
      return;
    }

    if (mode === 'other') {
      if (!date) { toast.show('日付を選択してください', 'error'); return; }
      setSubmitting(true);
      try {
        await createShift({ memberName: name, date, timeType: 'other', subject: `給料受取など ${name ?? ''}`.trim() });
        toast.show('「その他（給料受取など）」を申請しました', 'success');
        resetForm();
      } catch (e) { toast.show(`申請に失敗しました: ${(e as Error).message}`, 'error'); }
      finally { setSubmitting(false); }
      return;
    }

    // apply
    if (!date) { toast.show('日付を選択してください', 'error'); return; }
    if (dupWarning) { toast.show('重複申請のため送信を中止しました', 'error'); return; }
    if (subjectMode === 'time' && timeStart >= timeEnd) {
      toast.show('終了時刻は開始時刻より後にしてください', 'error'); return;
    }
    setSubmitting(true);
    try {
      const placeVal = resolvedPlace();
      if (subjectMode === 'time') {
        await createShift({
          memberName: name,
          date,
          timeType: 'time',
          timeStart,
          timeEnd,
          subject: subjectLabel(),
          ...(placeVal && { place: placeVal }),
        });
      } else {
        await createShift({
          memberName: name,
          date,
          timeType: 'template',
          template: subjectMode as TemplateCode,
          subject: subjectLabel(),
          ...(placeVal && { place: placeVal }),
        });
      }
      toast.show('シフトを申請しました', 'success');
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

  const resetForm = () => {
    setDate(''); setPlace(''); setPlaceCustom(''); setDupWarning(null);
    setNoneDates(['']);
  };

  const modeCards: { id: Mode; label: string; desc: string; icon: typeof Ban; color: string }[] = [
    { id: 'apply', label: 'シフト申請', desc: '件名・時間を指定して申請', icon: Clock, color: 'border-brand-200 hover:border-brand-400' },
    { id: 'none', label: '不可（シフトなし）', desc: '複数日指定で入れない日を申請', icon: Ban, color: 'border-gray-200 hover:border-gray-400' },
    { id: 'other', label: 'その他（給料受取など）', desc: '出勤せず給料のみ受取', icon: Wallet, color: 'border-amber-200 hover:border-amber-400' },
  ];

  return (
    <UserLayout>
      <div className="mb-4">
        <h1 className="text-lg font-bold text-gray-900">シフト申請</h1>
        <p className="text-sm text-gray-500">まず申請の種類を選んでください</p>
        {firestoreError && (
          <p className="mt-2 text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{firestoreError}</p>
        )}
      </div>

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

      <Card className="p-5 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* 不可モード: 複数日指定 */}
          {mode === 'none' && (
            <div className="sm:col-span-2 space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700">不可の日付</label>
                <button
                  type="button"
                  onClick={addNoneDate}
                  className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium py-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  日付を追加する
                </button>
              </div>

              {noneDates.map((d, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <div className="flex-1">
                    <Input
                      type="date"
                      value={d}
                      onChange={(e) => updateNoneDate(idx, e.target.value)}
                    />
                    {d && (
                      <p className={`text-xs mt-1 font-medium ${dayColor(d)}`}>
                        （{weekdayJP(d)}）
                      </p>
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
          )}

          {/* 申請モード */}
          {mode === 'apply' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">日付</label>
                <Input type="date" value={date} onChange={(e) => checkDup(e.target.value)} />
                {date && (
                  <p className={`text-xs mt-1 ${dayColor(date)}`}>
                    {formatDateJP(date)}
                  </p>
                )}
                {dupWarning && (
                  <p className="text-xs text-red-600 mt-1 flex items-center gap-1 bg-red-50 px-2 py-1 rounded">
                    <AlertTriangle className="w-3.5 h-3.5" />{dupWarning}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">件名（テンプレート）</label>
                <Select value={subjectMode} onChange={(e) => setSubjectMode(e.target.value as SubjectMode)}>
                  {SUBJECT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>
                <p className="text-xs text-gray-400 mt-1">
                  送信件名:「<strong>{subjectLabel()}</strong>」
                </p>
              </div>

              {/* 時間指定の場合のみ時間フィールドを表示 */}
              {currentOption.hasTime && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">開始時刻</label>
                    <Select value={timeStart} onChange={(e) => setTimeStart(e.target.value)}>
                      {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </Select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">終了時刻</label>
                    <Select value={timeEnd} onChange={(e) => setTimeEnd(e.target.value)}>
                      {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </Select>
                  </div>
                </>
              )}

              <div className={currentOption.hasTime ? '' : 'sm:col-span-2'}>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">場所（任意）</label>
                <Select value={place} onChange={(e) => { setPlace(e.target.value); if (e.target.value !== '__other__') setPlaceCustom(''); }}>
                  <option value="">指定なし</option>
                  {PLACE_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                  <option value="__other__">その他（自由記入）</option>
                </Select>
                {place === '__other__' && (
                  <Input
                    className="mt-2"
                    placeholder="場所を入力（例: 他店ヘルプ）"
                    value={placeCustom}
                    onChange={(e) => setPlaceCustom(e.target.value)}
                    maxLength={30}
                  />
                )}
              </div>
            </>
          )}

          {/* その他モード */}
          {mode === 'other' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">日付</label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              {date && (
                <p className={`text-xs mt-1 ${dayColor(date)}`}>
                  {formatDateJP(date)}
                </p>
              )}
            </div>
          )}

        </div>

        <div className="mt-5 flex justify-end">
          <Button
            size="lg"
            onClick={handleSubmit}
            disabled={submitting || (mode === 'apply' && !!dupWarning)}
          >
            {submitting
              ? '送信中…'
              : mode === 'none'
                ? `不可を申請${validNoneDates().length > 0 ? `（${validNoneDates().length}日）` : ''}`
                : '申請を送信'}
            {!submitting && <CheckCircle2 className="w-4 h-4" />}
          </Button>
        </div>
      </Card>

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
