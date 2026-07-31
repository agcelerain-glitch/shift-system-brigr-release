// /admin-shift シフト調整: 許可/否認/調整依頼、5タグソート、名簿・ログ確認、LINEジャンプ、復元

import { useMemo, useState } from 'react';
import { AdminLayout } from '../components/AdminLayout';
import { useData } from '../contexts/DataContext';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { Card, Button, Badge, Input, Select, Modal, EmptyState } from '../components/ui';
import {
  CheckCircle2, XCircle, Sliders, RotateCcw, Users, MapPin, Clock, User as UserIcon,
  CalendarDays, Calendar, Hash, ChevronDown, ChevronRight, History, Trash2, Plus, Minus,
} from 'lucide-react';
import { formatDateJP, formatDateTimeJP, isPast7Days, weekdayJP, todayStr } from '../lib/utils';
import { PLACE_OPTIONS, TEMPLATE_LABELS } from '../lib/config';
import type { Shift, ApprovalLog } from '../lib/types';
import { approveShift, restoreShift, updateMemberLineId, deleteMember, adminDeleteShift } from '../lib/db';

type SortKey = 'date' | 'place' | 'time' | 'name' | 'weekday' | 'headcount';
type FilterStatus = 'plan' | 'confirmed' | 'reviewed' | 'unavailable' | 'delete_request';

function timeLabelOf(s: Shift): string {
  if (s.timeType === 'template' && s.template) return TEMPLATE_LABELS[s.template];
  if (s.timeType === 'time') return `${s.timeStart}〜${s.timeEnd}`;
  if (s.timeType === 'other') return 'その他';
  return '';
}
function timeSortVal(s: Shift): number {
  if (s.timeType === 'time' && s.timeStart) return parseInt(s.timeStart.replace(':', ''), 10);
  if (s.timeType === 'template' && s.template) return { A: 900, B: 1300, C: 1700, D: 2100 }[s.template];
  return 9999;
}

function statusBadge(s: Shift) {
  if (s.timeType === 'none') return <Badge color="gray">不可</Badge>;
  if (s.status === 'delete_requested') return <Badge color="red">削除依頼</Badge>;
  if (s.status === 'confirmed') return <Badge color="confirmed">確定</Badge>;
  if (s.status === 'reviewed') return <Badge color="reviewed">確認済</Badge>;
  return <Badge color="plan">予定</Badge>;
}

export function AdminShiftPage() {
  const { shifts, members, approvalLogs } = useData();
  const { name } = useAuth();
  const adminName = name ?? '管理者';
  const toast = useToast();
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [activeFilters, setActiveFilters] = useState<Set<FilterStatus>>(new Set(['plan', 'delete_request']));

  const toggleFilter = (f: FilterStatus) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f); else next.add(f);
      return next;
    });
  };
  const [search, setSearch] = useState('');
  const [adjusting, setAdjusting] = useState<Shift | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [lineIdDraft, setLineIdDraft] = useState('');
  const [savingLineId, setSavingLineId] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingMember, setDeletingMember] = useState(false);
  const [summarySelectedDate, setSummarySelectedDate] = useState<string | null>(null);

  // 承認時の場所指定モーダル
  const [approvingShift, setApprovingShift] = useState<Shift | null>(null);
  const [approvePlace, setApprovePlace] = useState('');

  const openApprove = (s: Shift) => {
    setApprovingShift(s);
    setApprovePlace(s.place ?? '');
  };

  const confirmApprove = async () => {
    if (!approvingShift) return;
    const s = approvingShift;
    try {
      const res = await approveShift({
        shiftId: s.id,
        action: approvePlace ? 'adjust' : 'approve',
        adminName,
        expectedVersion: s.version,
        ...(approvePlace ? { adjustFields: { place: approvePlace } } : {}),
      });
      if (res === 'ok') {
        toast.show(`${s.memberName}さんのシフトを確定しました`, 'success');
        setApprovingShift(null);
      } else if (res === 'conflict') {
        toast.show('競合: 画面を更新してください', 'error');
      }
    } catch (e) {
      toast.show(`承認エラー: ${(e as Error).message}`, 'error');
    }
  };

  // 調整モーダルのフィールド
  const [adjTimeStart, setAdjTimeStart] = useState('');
  const [adjTimeEnd, setAdjTimeEnd] = useState('');
  const [adjSubject, setAdjSubject] = useState('');
  const [adjPlace, setAdjPlace] = useState('');
  const [adjAddTime, setAdjAddTime] = useState(false);

  const filtered = useMemo(() => {
    let list = shifts.filter((s) => {
      const isUnavail = s.timeType === 'none';
      if (isUnavail) return activeFilters.has('unavailable');
      if (s.status === 'delete_requested') return activeFilters.has('delete_request');
      if (s.status === 'plan') return activeFilters.has('plan');
      if (s.status === 'confirmed') return activeFilters.has('confirmed');
      if (s.status === 'reviewed') return activeFilters.has('reviewed');
      return false;
    });
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((s) => s.memberName.toLowerCase().includes(q) || s.subject.toLowerCase().includes(q) || (s.place ?? '').toLowerCase().includes(q));
    }
    const sorted = [...list].sort((a, b) => {
      switch (sortKey) {
        case 'date': return a.date.localeCompare(b.date);
        case 'place': return (a.place ?? 'zzz').localeCompare(b.place ?? 'zzz') || a.date.localeCompare(b.date);
        case 'time': return timeSortVal(a) - timeSortVal(b) || a.date.localeCompare(b.date);
        case 'name': return a.memberName.localeCompare(b.memberName, 'ja') || a.date.localeCompare(b.date);
        case 'weekday': return new Date(a.date).getDay() - new Date(b.date).getDay() || a.date.localeCompare(b.date);
        case 'headcount': return (b.headcount ?? 0) - (a.headcount ?? 0) || a.date.localeCompare(b.date);
      }
    });
    return sorted;
  }, [shifts, activeFilters, search, sortKey]);

  const planCount = shifts.filter((s) => s.status === 'plan' && s.timeType !== 'none').length;
  const unavailCount = shifts.filter((s) => s.timeType === 'none' && s.status === 'plan').length;
  const deleteReqCount = shifts.filter((s) => s.status === 'delete_requested').length;

  // 本日から7日間の日ごとシフト集計
  const today = todayStr();
  const weekSummary = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today + 'T00:00:00');
      d.setDate(d.getDate() + i);
      const date = d.toISOString().slice(0, 10);
      const dayShifts = shifts.filter((s) => s.date === date);
      return {
        date,
        wd: ['日', '月', '火', '水', '木', '金', '土'][d.getDay()],
        day: d.getDate(),
        isToday: i === 0,
        isSun: d.getDay() === 0,
        isSat: d.getDay() === 6,
        confirmed: dayShifts.filter((s) => s.status === 'confirmed').length,
        plan: dayShifts.filter((s) => s.status === 'plan' && s.timeType !== 'none').length,
        reviewed: dayShifts.filter((s) => s.status === 'reviewed').length,
        unavailable: dayShifts.filter((s) => s.timeType === 'none').length,
      };
    });
  }, [shifts, today]);

  const doAdminDelete = async (s: Shift) => {
    if (!window.confirm(`${s.memberName}さんの「${formatDateJP(s.date)} ${s.subject}」を完全削除しますか？\nこの操作は取り消せません。`)) return;
    try {
      await adminDeleteShift(s.id);
      toast.show(`${s.memberName}さんのシフトを削除しました`, 'success');
    } catch (e) {
      toast.show(`削除エラー: ${(e as Error).message}`, 'error');
    }
  };

  const doDeny = async (s: Shift) => {
    try {
      const res = await approveShift({ shiftId: s.id, action: 'deny', adminName, expectedVersion: s.version });
      if (res === 'ok') toast.show(`${s.memberName}さんのシフトを確認済み（否認）にしました`, 'info');
      else if (res === 'conflict') toast.show('競合: 画面を更新してください', 'error');
    } catch (e) {
      toast.show(`否認エラー: ${(e as Error).message}`, 'error');
    }
  };

  const openAdjust = (s: Shift) => {
    setAdjusting(s);
    setAdjTimeStart(s.timeStart ?? '09:00');
    setAdjTimeEnd(s.timeEnd ?? '17:00');
    setAdjSubject(s.subject);
    setAdjPlace(s.place ?? '');
    setAdjAddTime(false); // 常に初期表示なし（+ボタンで追加）
  };

  const doAdjust = async () => {
    if (!adjusting) return;
    try {
      const adjustFields: Parameters<typeof approveShift>[0]['adjustFields'] = {
        subject: adjSubject.trim(),
        ...(adjPlace.trim() ? { place: adjPlace.trim() } : {}),
        ...(adjAddTime
          ? { timeStart: adjTimeStart, timeEnd: adjTimeEnd, timeType: 'time' as const }
          : {}),
      };
      const res = await approveShift({
        shiftId: adjusting.id,
        action: 'adjust',
        adminName,
        expectedVersion: adjusting.version,
        adjustFields,
      });
      if (res === 'ok') { toast.show('調整して確定しました', 'success'); setAdjusting(null); }
      else if (res === 'conflict') toast.show('競合: 画面を更新してください', 'error');
    } catch (e) {
      toast.show(`調整エラー: ${(e as Error).message}`, 'error');
    }
  };

  const doRestore = async (log: ApprovalLog) => {
    const res = await restoreShift(log.id);
    if (res === 'ok') toast.show('復元しました', 'success');
    else if (res === 'expired') toast.show('7日経過のため復元不可です', 'error');
    else toast.show('復元に失敗しました', 'error');
  };

  const memberShifts = selectedMember ? shifts.filter((s) => s.memberName === selectedMember) : [];
  const memberInfo = members.find((m) => m.name === selectedMember);

  const handleDeleteMember = async () => {
    if (!memberInfo) return;
    setDeletingMember(true);
    try {
      await deleteMember(memberInfo.id);
      toast.show(`${selectedMember}さんを名簿から削除しました`, 'success');
      setSelectedMember(null);
      setShowDeleteConfirm(false);
    } catch (e) {
      toast.show(`削除失敗: ${(e as Error).message}`, 'error');
    } finally {
      setDeletingMember(false);
    }
  };

  const handleSaveLineId = async () => {
    if (!memberInfo) return;
    setSavingLineId(true);
    try {
      await updateMemberLineId(memberInfo.id, lineIdDraft);
      toast.show('LINE IDを保存しました', 'success');
    } catch (e) {
      toast.show(`保存失敗: ${(e as Error).message}`, 'error');
    } finally {
      setSavingLineId(false);
    }
  };

  const sortTabs: { id: SortKey; label: string; icon: typeof Calendar }[] = [
    { id: 'date', label: '日付', icon: Calendar },
    { id: 'weekday', label: '曜日', icon: CalendarDays },
    { id: 'place', label: '場所', icon: MapPin },
    { id: 'time', label: '時間', icon: Clock },
    { id: 'name', label: '名前', icon: UserIcon },
    { id: 'headcount', label: '人数', icon: Hash },
  ];

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-bold text-gray-900">シフト調整</h1>
          <p className="text-sm text-gray-500">
            申請の許可・否認・調整を行います
            {planCount > 0 && <span className="text-amber-600 font-medium ml-1">未処理 {planCount}件</span>}
            {unavailCount > 0 && <span className="text-slate-500 font-medium ml-1">不可 {unavailCount}件</span>}
            {deleteReqCount > 0 && <span className="text-rose-600 font-medium ml-1">削除依頼 {deleteReqCount}件</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setMembersOpen(true)}>
            <Users className="w-4 h-4" />名簿
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setLogOpen(true)}>
            <History className="w-4 h-4" />復元ログ
          </Button>
        </div>
      </div>

      {/* 週間人数サマリー */}
      <Card className="p-3 mb-4 overflow-x-auto">
        <p className="text-xs font-medium text-gray-500 mb-2">今後7日間の人数</p>
        <div className="flex gap-2 min-w-max">
          {weekSummary.map(({ date, wd, day, isToday, isSun, isSat, confirmed, plan, reviewed, unavailable }) => (
            <button
              key={date}
              onClick={() => setSummarySelectedDate(date)}
              className={`flex flex-col items-center px-3 py-2 rounded-xl min-w-[52px] transition hover:ring-2 hover:ring-brand-300 active:scale-95 ${isToday ? 'bg-brand-50 ring-1 ring-brand-300' : 'bg-gray-50 hover:bg-brand-50'}`}
            >
              <span className={`text-[10px] font-medium ${isSun ? 'text-red-500' : isSat ? 'text-blue-500' : 'text-gray-500'}`}>{wd}</span>
              <span className={`text-sm font-bold ${isToday ? 'text-brand-700' : 'text-gray-800'}`}>{day}</span>
              <div className="mt-1 space-y-0.5 text-[10px] text-center w-full">
                {confirmed > 0 && <div className="bg-confirmed-soft text-confirmed-strong rounded px-1">確{confirmed}</div>}
                {plan > 0 && <div className="bg-plan-soft text-plan-strong rounded px-1">予{plan}</div>}
                {reviewed > 0 && <div className="bg-gray-100 text-gray-400 rounded px-1">済{reviewed}</div>}
                {unavailable > 0 && <div className="bg-slate-100 text-slate-500 rounded px-1">不{unavailable}</div>}
                {confirmed === 0 && plan === 0 && reviewed === 0 && unavailable === 0 && <div className="text-gray-300">—</div>}
              </div>
            </button>
          ))}
        </div>
      </Card>

      {/* ソートタブ + フィルタ */}
      <Card className="p-3 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-gray-500 shrink-0">並替:</span>
          <div className="flex gap-1 flex-wrap">
            {sortTabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setSortKey(t.id)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition ${sortKey === t.id ? 'bg-slate-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                <t.icon className="w-3.5 h-3.5" />{t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-1.5 flex-wrap mb-2">
          {([
            { id: 'plan', label: '予定', activeClass: 'border-amber-400 bg-amber-50 text-amber-700' },
            { id: 'confirmed', label: '確定', activeClass: 'border-green-500 bg-green-50 text-green-700' },
            { id: 'reviewed', label: '確認済', activeClass: 'border-gray-400 bg-gray-100 text-gray-600' },
            { id: 'unavailable', label: '不可', activeClass: 'border-slate-500 bg-slate-100 text-slate-600' },
            { id: 'delete_request', label: '削除依頼', activeClass: 'border-rose-500 bg-rose-50 text-rose-700' },
          ] as const).map((f) => (
            <button
              key={f.id}
              onClick={() => toggleFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border-2 transition-all ${
                activeFilters.has(f.id) ? f.activeClass : 'border-gray-200 bg-white text-gray-400'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Input placeholder="名前・件名・場所で検索" value={search} onChange={(e) => setSearch(e.target.value)} />
      </Card>

      {/* シフト一覧 */}
      {filtered.length === 0 ? (
        <Card className="p-6"><EmptyState icon={<CheckCircle2 className="w-10 h-10" />} title="該当するシフトはありません" /></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((s) => {
            const isToday = s.date === todayStr();
            const timeLabel = timeLabelOf(s);
            return (
              <Card key={s.id} className={`p-4 hover:shadow-cardLg transition ${s.status === 'reviewed' ? 'opacity-70' : ''}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {statusBadge(s)}
                      {isToday && <Badge color="today">当日</Badge>}
                      <span className={`text-sm font-medium ${weekdayJP(s.date) === '日' ? 'text-red-500' : weekdayJP(s.date) === '土' ? 'text-blue-500' : 'text-gray-700'}`}>
                        {formatDateJP(s.date)}
                      </span>
                    </div>
                    <p className="font-medium text-gray-900">{s.memberName} · {s.subject}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500 mt-1">
                      {timeLabel && (
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{timeLabel}</span>
                      )}
                      {s.place && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{s.place}</span>}
                      {s.headcount && <span className="flex items-center gap-1"><Hash className="w-3 h-3" />{s.headcount}人</span>}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">申請 {formatDateTimeJP(s.createdAt)}</p>
                    {s.version > 1 && (
                      <p className="text-[10px] text-gray-300 mt-0.5">修正 {formatDateTimeJP(s.updatedAt)} · v{s.version}</p>
                    )}
                  </div>
                  <div className="flex gap-1.5 shrink-0 flex-wrap">
                    {s.status === 'delete_requested' ? (
                      <Button size="sm" variant="danger" onClick={() => doAdminDelete(s)}>
                        <Trash2 className="w-4 h-4" />削除する
                      </Button>
                    ) : s.timeType === 'none' ? (
                      // 不可申請: 確認のみ（承認・調整は不要）
                      s.status === 'plan' && (
                        <Button size="sm" variant="secondary" onClick={() => doDeny(s)}><CheckCircle2 className="w-4 h-4" />確認済に</Button>
                      )
                    ) : (
                      <>
                        {s.status === 'plan' && (
                          <>
                            <Button size="sm" variant="success" onClick={() => openApprove(s)}><CheckCircle2 className="w-4 h-4" />許可</Button>
                            <Button size="sm" variant="danger" onClick={() => doDeny(s)}><XCircle className="w-4 h-4" />否認</Button>
                            <Button size="sm" variant="secondary" onClick={() => openAdjust(s)}><Sliders className="w-4 h-4" />調整</Button>
                          </>
                        )}
                        {s.status === 'confirmed' && (
                          <Button size="sm" variant="secondary" onClick={() => openAdjust(s)}><Sliders className="w-4 h-4" />再調整</Button>
                        )}
                        {s.status === 'reviewed' && (
                          <>
                            <Button size="sm" variant="success" onClick={() => openApprove(s)}><CheckCircle2 className="w-4 h-4" />許可</Button>
                            <Button size="sm" variant="secondary" onClick={() => openAdjust(s)}><Sliders className="w-4 h-4" />調整</Button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* 承認確認モーダル: 場所指定 */}
      <Modal
        open={approvingShift !== null}
        onClose={() => setApprovingShift(null)}
        title="承認確認"
        footer={
          <>
            <Button variant="ghost" onClick={() => setApprovingShift(null)}>キャンセル</Button>
            <Button variant="success" onClick={confirmApprove}>
              <CheckCircle2 className="w-4 h-4" />確定する
            </Button>
          </>
        }
      >
        {approvingShift && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-sm font-medium text-gray-900">{approvingShift.memberName}</p>
              <p className="text-sm text-gray-600">{formatDateJP(approvingShift.date)} · {approvingShift.subject}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">場所を指定</label>
              <Select value={approvePlace} onChange={(e) => setApprovePlace(e.target.value)}>
                <option value="">指定なし</option>
                {PLACE_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
              <p className="text-xs text-gray-400 mt-1">省略した場合は場所なしで確定します</p>
            </div>
          </div>
        )}
      </Modal>

      {/* 調整モーダル */}
      <Modal
        open={adjusting !== null}
        onClose={() => setAdjusting(null)}
        title="シフト調整"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAdjusting(null)}>キャンセル</Button>
            <Button variant="success" onClick={doAdjust}>調整して確定</Button>
          </>
        }
      >
        {adjusting && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">{adjusting.memberName} · {formatDateJP(adjusting.date)}</p>

            {/* 件名 */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">件名</label>
              <Input value={adjSubject} onChange={(e) => setAdjSubject(e.target.value)} />
            </div>

            {/* 時間（時間指定・テンプレは初期ON、なし系は+ボタンで追加） */}
            <div>
              <button
                type="button"
                onClick={() => setAdjAddTime(!adjAddTime)}
                className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-800 mb-2 font-medium"
              >
                {adjAddTime
                  ? <><Minus className="w-3.5 h-3.5" />時間指定を削除</>
                  : <><Plus className="w-3.5 h-3.5" />時間を指定する</>
                }
              </button>
              {adjAddTime && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">開始</label>
                    <Input type="time" value={adjTimeStart} onChange={(e) => setAdjTimeStart(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">終了</label>
                    <Input type="time" value={adjTimeEnd} onChange={(e) => setAdjTimeEnd(e.target.value)} />
                  </div>
                </div>
              )}
            </div>

            {/* 場所 */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">場所</label>
              <Select value={adjPlace} onChange={(e) => setAdjPlace(e.target.value)}>
                <option value="">指定なし</option>
                {PLACE_OPTIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </Select>
            </div>
          </div>
        )}
      </Modal>

      {/* 名簿モーダル */}
      <Modal open={membersOpen} onClose={() => { setMembersOpen(false); setSelectedMember(null); }} title="名簿">
        {!selectedMember ? (
          <div className="space-y-1">
            {members.length === 0 ? (
              <EmptyState icon={<Users className="w-8 h-8" />} title="メンバーがいません" />
            ) : (
              members.map((m) => (
                <button
                  key={m.id}
                  onClick={() => { setSelectedMember(m.name); setLineIdDraft(m.lineUserId ?? ''); setShowDeleteConfirm(false); }}
                  className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition group"
                >
                  <div className="flex items-center gap-2">
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500" />
                    <span className="text-sm font-medium text-gray-800">{m.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${m.lineUserId ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                      {m.lineUserId ? 'LINE済' : '未登録'}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">記入 {new Date(m.createdAt).toLocaleDateString()}</span>
                </button>
              ))
            )}
          </div>
        ) : (
          <div>
            <button onClick={() => setSelectedMember(null)} className="text-xs text-brand-600 mb-3 flex items-center gap-1">
              <ChevronDown className="w-3 h-3 rotate-90" />名簿に戻る
            </button>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">{selectedMember}</h3>
              {memberInfo?.lineUserId && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-green-100 text-green-700">LINE済</span>
              )}
            </div>
            <div className="mb-3 text-xs">
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-gray-400">最終送信日</p>
                <p className="text-gray-700 font-medium">{memberInfo ? formatDateTimeJP(memberInfo.updatedAt) : '—'}</p>
              </div>
            </div>
            <div className="mb-3 p-3 rounded-lg bg-gray-50 text-xs">
              <p className="text-gray-400 mb-1">LINE ID</p>
              <p className={`font-mono break-all ${memberInfo?.lineUserId ? 'text-gray-600' : 'text-gray-400 italic'}`}>
                {memberInfo?.lineUserId ?? '未登録（LINEで「名前登録 お名前」と送信）'}
              </p>
            </div>

            {!showDeleteConfirm ? (
              <div className="flex justify-end">
                <Button size="sm" variant="danger" onClick={() => setShowDeleteConfirm(true)}>
                  <Trash2 className="w-3.5 h-3.5" />メンバー削除
                </Button>
              </div>
            ) : (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-sm font-semibold text-red-700 mb-1">
                  「{selectedMember}」を名簿から削除しますか？
                </p>
                <p className="text-xs text-red-500 mb-3">
                  削除するとLINE ID紐づけが解除されます。シフト申請データは残ります。この操作は取り消せません。
                </p>
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="ghost" onClick={() => setShowDeleteConfirm(false)}>
                    キャンセル
                  </Button>
                  <Button size="sm" variant="danger" onClick={handleDeleteMember} disabled={deletingMember}>
                    <Trash2 className="w-3.5 h-3.5" />
                    {deletingMember ? '削除中…' : '本当に削除する'}
                  </Button>
                </div>
              </div>
            )}
            <p className="text-xs font-medium text-gray-600 mb-2 mt-3">申請履歴</p>
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {memberShifts.length === 0 ? (
                <p className="text-sm text-gray-400">申請なし</p>
              ) : (
                memberShifts.map((s) => (
                  <div key={s.id} className="flex items-center justify-between text-xs p-2 rounded bg-gray-50">
                    <span className="flex items-center gap-1.5">
                      <Badge color={s.status === 'confirmed' ? 'confirmed' : s.status === 'reviewed' ? 'reviewed' : 'plan'}>
                        {s.status === 'confirmed' ? '確' : s.status === 'reviewed' ? '済' : '予'}
                      </Badge>
                      {formatDateJP(s.date)} · {s.subject}
                    </span>
                    <span className="text-gray-400">{new Date(s.createdAt).toLocaleDateString()}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* 週間サマリー 日付詳細モーダル */}
      <Modal
        open={summarySelectedDate !== null}
        onClose={() => setSummarySelectedDate(null)}
        title={summarySelectedDate ? `${formatDateJP(summarySelectedDate)} のシフト` : ''}
      >
        {summarySelectedDate && (() => {
          const dayShifts = shifts
            .filter((s) => s.date === summarySelectedDate && s.timeType !== 'none')
            .sort((a, b) => {
              const order: Record<string, number> = { confirmed: 0, plan: 1, reviewed: 2, delete_requested: 3 };
              return (order[a.status] ?? 9) - (order[b.status] ?? 9) || timeSortVal(a) - timeSortVal(b);
            });
          const unavailShifts = shifts.filter((s) => s.date === summarySelectedDate && s.timeType === 'none');

          if (dayShifts.length === 0 && unavailShifts.length === 0) {
            return <EmptyState icon={<CalendarDays className="w-8 h-8" />} title="この日のシフトはありません" />;
          }
          return (
            <div className="space-y-2">
              {dayShifts.map((s) => {
                const tl = timeLabelOf(s);
                return (
                  <div key={s.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-gray-50">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        {statusBadge(s)}
                        <span className="text-sm font-medium text-gray-900">{s.memberName}</span>
                      </div>
                      <p className="text-xs text-gray-600">{s.subject}</p>
                      <div className="flex gap-2 text-xs text-gray-400 mt-0.5">
                        {tl && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{tl}</span>}
                        {s.place && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{s.place}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
              {unavailShifts.length > 0 && (
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs text-gray-400 mb-1">不可申請</p>
                  {unavailShifts.map((s) => (
                    <p key={s.id} className="text-xs text-gray-500 py-0.5">{s.memberName}</p>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </Modal>

      {/* 復元ログモーダル */}
      <Modal open={logOpen} onClose={() => setLogOpen(false)} title="承認ログ（7日以内復元可）">
        {approvalLogs.length === 0 ? (
          <EmptyState icon={<History className="w-8 h-8" />} title="承認ログはありません" />
        ) : (
          <div className="space-y-2">
            {approvalLogs.map((log) => {
              const expired = !isPast7Days(log.createdAt);
              const before = log.beforeState;
              return (
                <div key={log.id} className="p-3 rounded-lg border border-gray-100">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Badge color={log.action === 'approve' ? 'confirmed' : log.action === 'deny' ? 'reviewed' : 'blue'}>
                        {log.action === 'approve' ? '許可' : log.action === 'deny' ? '否認' : '調整'}
                      </Badge>
                      <span className="text-xs text-gray-500">{formatDateTimeJP(log.createdAt)}</span>
                    </div>
                    <Button size="sm" variant="ghost" disabled={expired} onClick={() => doRestore(log)}>
                      <RotateCcw className="w-3.5 h-3.5" />復元
                    </Button>
                  </div>
                  {before && (
                    <p className="text-xs text-gray-600">
                      {before.memberName} · {formatDateJP(before.date)} · {before.subject} ({before.status === 'confirmed' ? '確定' : before.status === 'reviewed' ? '確認済' : '予定'})
                    </p>
                  )}
                  {expired && <p className="text-[10px] text-gray-400 mt-1">7日経過のため復元不可</p>}
                </div>
              );
            })}
          </div>
        )}
      </Modal>
    </AdminLayout>
  );
}
