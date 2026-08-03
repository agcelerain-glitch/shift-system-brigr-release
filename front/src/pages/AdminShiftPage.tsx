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
  AlertTriangle, BellPlus, X,
} from 'lucide-react';
import { formatDateJP, formatDateTimeJP, isPast7Days, weekdayJP, todayStr, addDays, displayTime } from '../lib/utils';
import { PLACE_OPTIONS, TEMPLATE_LABELS, TEMPLATE_TIMES } from '../lib/config';
import type { Shift, ApprovalLog } from '../lib/types';
import type { TemplateCode } from '../lib/config';
import { approveShift, restoreShift, updateMemberLineId, deleteMember, adminDeleteShift, createShiftRequest } from '../lib/db';

type SortKey = 'date' | 'place' | 'time' | 'name' | 'weekday' | 'headcount';
type FilterStatus = 'plan' | 'confirmed' | 'reviewed' | 'unavailable' | 'delete_request';

// メンバーごとの最終承認場所をlocalStorageで管理
const LS_MEMBER_PLACES = 'shiftapp.memberPlaces';
const getMemberLastPlace = (memberName: string): string => {
  try {
    const data = JSON.parse(localStorage.getItem(LS_MEMBER_PLACES) ?? '{}');
    return data[memberName] ?? '';
  } catch { return ''; }
};
const saveMemberLastPlace = (memberName: string, place: string) => {
  try {
    const data = JSON.parse(localStorage.getItem(LS_MEMBER_PLACES) ?? '{}');
    data[memberName] = place;
    localStorage.setItem(LS_MEMBER_PLACES, JSON.stringify(data));
  } catch {}
};

function timeLabelOf(s: Shift): string {
  if (s.timeType === 'template' && s.template) return TEMPLATE_LABELS[s.template];
  if (s.timeType === 'time') return `${displayTime(s.timeStart)}〜${displayTime(s.timeEnd)}`;
  if (s.timeType === 'other') return 'その他';
  return '';
}
function timeSortVal(s: Shift): number {
  if (s.timeType === 'time' && s.timeStart) {
    const [h, m] = s.timeStart.split(':').map(Number);
    const adj = h >= 24 ? h : h < 9 ? h + 24 : h;
    return adj * 100 + m;
  }
  if (s.timeType === 'template' && s.template) return { A: 2000, B: 2030, C: 2130, D: 2200 }[s.template];
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
  // 調整マーク: "YYYY-MM-DD_名前" キーで日付+名前の組み合わせを管理
  const [markedKeys, setMarkedKeys] = useState<Set<string>>(new Set());
  const mkKey = (date: string, memberName: string) => `${date}_${memberName}`;
  const toggleMark = (date: string, memberName: string) => {
    const key = mkKey(date, memberName);
    setMarkedKeys((prev) => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
  };
  // 復元ログ用の検索・ソート
  const [logSearch, setLogSearch] = useState('');
  const [logSortKey, setLogSortKey] = useState<'date' | 'place' | 'name' | 'marked'>('date');

  // 出勤依頼フォーム（プレビュー内で日付×場所×時間帯に紐づく）
  type RequestDraft = {
    key: string; // "date_place_timeLabel" のユニークキー
    date: string;
    place: string;
    timeType: 'template' | 'time';
    template?: TemplateCode;
    timeStart?: string;
    timeEnd?: string;
    timeLabel: string;
    requiredCount: number;
  };
  const [requestDrafts, setRequestDrafts] = useState<RequestDraft[]>([]);
  const [addingRequestKey, setAddingRequestKey] = useState<string | null>(null); // どのセルで追加フォームを開いているか
  const [draftRequiredCount, setDraftRequiredCount] = useState(1);
  const [savingRequest, setSavingRequest] = useState(false);

  // 承認時の場所指定モーダル
  const [approvingShift, setApprovingShift] = useState<Shift | null>(null);
  const [approvePlace, setApprovePlace] = useState('');

  const openApprove = (s: Shift) => {
    setApprovingShift(s);
    // 既にシフトに場所があればそれを優先、なければlastPlaceを使う
    setApprovePlace(s.place ?? getMemberLastPlace(s.memberName));
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
        if (approvePlace) saveMemberLastPlace(s.memberName, approvePlace);
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
      const date = addDays(today, i);
      const d = new Date(date + 'T00:00:00');
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

  // 選択日のシフトを 場所 → 帯 でグループ化したピボットデータ
  const pivotData = useMemo(() => {
    if (!summarySelectedDate) return [];
    const dayShifts = shifts
      .filter((s) => s.date === summarySelectedDate && s.timeType !== 'none' && s.status === 'confirmed')
      .sort((a, b) => {
        const pa = a.place ?? '￿';
        const pb = b.place ?? '￿';
        if (pa !== pb) return pa.localeCompare(pb, 'ja');
        return timeSortVal(a) - timeSortVal(b);
      });
    const placeMap = new Map<string, Shift[]>();
    for (const s of dayShifts) {
      const place = s.place ?? '';
      if (!placeMap.has(place)) placeMap.set(place, []);
      placeMap.get(place)!.push(s);
    }
    return Array.from(placeMap.entries()).map(([place, pShifts]) => {
      const timeMap = new Map<string, Shift[]>();
      for (const s of pShifts) {
        const label = timeLabelOf(s) || '時間未設定';
        if (!timeMap.has(label)) timeMap.set(label, []);
        timeMap.get(label)!.push(s);
      }
      return {
        place,
        total: pShifts.length,
        timeGroups: Array.from(timeMap.entries()).map(([label, members]) => ({ label, members })),
      };
    });
  }, [summarySelectedDate, shifts]);

  // 復元ログ: 検索・ソート済みリスト
  const filteredLogs = useMemo(() => {
    let logs = [...approvalLogs];
    if (logSearch.trim()) {
      const q = logSearch.toLowerCase();
      logs = logs.filter((log) =>
        (log.beforeState?.memberName ?? '').toLowerCase().includes(q) ||
        (log.beforeState?.place ?? '').toLowerCase().includes(q) ||
        (log.beforeState?.date ?? '').includes(q),
      );
    }
    logs.sort((a, b) => {
      const ba = a.beforeState;
      const bb = b.beforeState;
      if (logSortKey === 'marked') {
        const ma = ba ? (markedKeys.has(mkKey(ba.date, ba.memberName)) ? 0 : 1) : 1;
        const mb = bb ? (markedKeys.has(mkKey(bb.date, bb.memberName)) ? 0 : 1) : 1;
        if (ma !== mb) return ma - mb;
        return (bb?.date ?? '').localeCompare(ba?.date ?? '');
      }
      switch (logSortKey) {
        case 'date':  return (bb?.date ?? '').localeCompare(ba?.date ?? '');
        case 'place': return (ba?.place ?? '').localeCompare(bb?.place ?? '', 'ja');
        case 'name':  return (ba?.memberName ?? '').localeCompare(bb?.memberName ?? '', 'ja');
      }
    });
    return logs;
  }, [approvalLogs, logSearch, logSortKey, markedKeys]);

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
    // シフトに場所があればそれを優先、なければlastPlaceを使う
    setAdjPlace(s.place ?? getMemberLastPlace(s.memberName));
    setAdjAddTime(false);
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
      if (res === 'ok') {
        if (adjPlace.trim()) saveMemberLastPlace(adjusting.memberName, adjPlace.trim());
        toast.show('調整して確定しました', 'success');
        setAdjusting(null);
      } else if (res === 'conflict') toast.show('競合: 画面を更新してください', 'error');
    } catch (e) {
      toast.show(`調整エラー: ${(e as Error).message}`, 'error');
    }
  };

  const doRestore = async (log: ApprovalLog) => {
    try {
      const res = await restoreShift(log.id);
      if (res === 'ok') toast.show('復元しました', 'success');
      else if (res === 'expired') toast.show('7日経過のため復元不可です', 'error');
      else if (res === 'conflict') toast.show('競合: 別のadminが同時操作中です。画面を更新してから再試行してください', 'error');
      else toast.show('復元に失敗しました', 'error');
    } catch (e) {
      toast.show(`復元エラー: ${(e as Error).message}`, 'error');
    }
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

      {/* 日付タップ時のインラインプレビュー（ピボットテーブル形式） */}
      {summarySelectedDate && (
        <Card className="p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-gray-700">
              {formatDateJP(summarySelectedDate)} のシフト詳細
            </p>
            <div className="flex items-center gap-2">
              {markedKeys.size > 0 && (
                <span className="text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full border border-orange-200">
                  調整対象 {markedKeys.size}件
                </span>
              )}
              {requestDrafts.filter(d => d.date === summarySelectedDate).length > 0 && (
                <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                  出勤依頼 {requestDrafts.filter(d => d.date === summarySelectedDate).length}件
                </span>
              )}
              <button
                onClick={() => setSummarySelectedDate(null)}
                className="text-xs text-gray-400 hover:text-gray-600 px-2 py-0.5 rounded-lg hover:bg-gray-100"
              >
                閉じる
              </button>
            </div>
          </div>
          {pivotData.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-400">この日の確定シフトはありません</p>
              {/* シフト0でも出勤依頼追加可能 */}
              {(() => {
                const noShiftKey = `${summarySelectedDate}_新規依頼_`;
                const isAdding = addingRequestKey === noShiftKey;
                return isAdding ? (
                  <div className="border border-purple-200 rounded-xl p-3 bg-purple-50 space-y-3">
                    <p className="text-xs font-semibold text-purple-700 flex items-center gap-1.5">
                      <BellPlus className="w-3.5 h-3.5" />出勤依頼の追加
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">場所</label>
                        <Select id="req-place-new" defaultValue="" className="text-sm">
                          <option value="">選択</option>
                          {PLACE_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                        </Select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">時間帯</label>
                        <Select id="req-time-new" defaultValue="A" className="text-sm">
                          {(['A', 'B', 'C', 'D'] as TemplateCode[]).map(t => (
                            <option key={t} value={t}>{TEMPLATE_LABELS[t]}</option>
                          ))}
                          <option value="__custom__">時間指定</option>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">必要人数</label>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setDraftRequiredCount(c => Math.max(1, c - 1))} className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-300">-</button>
                        <span className="text-sm font-bold w-8 text-center">{draftRequiredCount}</span>
                        <button type="button" onClick={() => setDraftRequiredCount(c => c + 1)} className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-300">+</button>
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => { setAddingRequestKey(null); setDraftRequiredCount(1); }}>キャンセル</Button>
                      <Button
                        size="sm"
                        variant="success"
                        disabled={savingRequest}
                        onClick={async () => {
                          const placeEl = document.getElementById('req-place-new') as HTMLSelectElement;
                          const timeEl = document.getElementById('req-time-new') as HTMLSelectElement;
                          const place = placeEl?.value;
                          const timeVal = timeEl?.value;
                          if (!place) { toast.show('場所を選択してください', 'error'); return; }
                          const isTemplate = timeVal !== '__custom__';
                          const tCode = isTemplate ? timeVal as TemplateCode : undefined;
                          const tLabel = isTemplate ? TEMPLATE_LABELS[tCode!] : '時間指定';
                          const key = `${summarySelectedDate}_${place}_${tLabel}`;
                          if (requestDrafts.some(d => d.key === key)) { toast.show('同じ依頼が既に追加されています', 'error'); return; }
                          setSavingRequest(true);
                          try {
                            await createShiftRequest({
                              date: summarySelectedDate!,
                              place,
                              timeType: isTemplate ? 'template' : 'time',
                              template: tCode,
                              timeLabel: tLabel,
                              requiredCount: draftRequiredCount,
                              createdBy: adminName,
                            });
                            setRequestDrafts(prev => [...prev, { key, date: summarySelectedDate!, place, timeType: isTemplate ? 'template' : 'time', template: tCode, timeLabel: tLabel, requiredCount: draftRequiredCount }]);
                            setAddingRequestKey(null);
                            setDraftRequiredCount(1);
                            toast.show('出勤依頼を追加しました（LINE操作ページから送信できます）', 'success');
                          } catch (e) { toast.show(`追加失敗: ${(e as Error).message}`, 'error'); }
                          finally { setSavingRequest(false); }
                        }}
                      >
                        <BellPlus className="w-3.5 h-3.5" />追加
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setAddingRequestKey(noShiftKey); setDraftRequiredCount(1); }}
                    className="flex items-center gap-1.5 text-xs text-purple-600 hover:text-purple-800 font-medium px-3 py-2 border border-dashed border-purple-300 rounded-lg hover:bg-purple-50 transition-all"
                  >
                    <BellPlus className="w-3.5 h-3.5" />この日に出勤依頼を追加
                  </button>
                );
              })()}
            </div>
          ) : (
            <div className="space-y-2">
              {pivotData.map((group) => (
                <div key={group.place} className="border border-gray-100 rounded-xl overflow-hidden">
                  {/* 場所ヘッダー */}
                  <div className="flex items-center justify-between px-3 py-2 bg-gray-50">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
                      <MapPin className="w-3.5 h-3.5 text-gray-400" />
                      {group.place || '場所未設定'}
                    </span>
                    <span className="text-xs text-gray-500 bg-white px-2 py-0.5 rounded-full border border-gray-200">
                      計{group.total}人
                    </span>
                  </div>
                  {/* 帯 × 名前バッジ + 出勤依頼追加 */}
                  <div className="divide-y divide-gray-50">
                    {group.timeGroups.map((tg) => {
                      const cellKey = `${summarySelectedDate}_${group.place}_${tg.label}`;
                      const isAdding = addingRequestKey === cellKey;
                      const hasDraft = requestDrafts.some(d => d.key === cellKey);
                      return (
                        <div key={tg.label} className="px-3 py-2.5">
                          <div className="flex items-start gap-2">
                            <span className="text-xs text-gray-400 w-24 shrink-0 pt-1">{tg.label}</span>
                            <div className="flex flex-wrap gap-1.5 flex-1">
                              {tg.members.map((s) => (
                                <button
                                  key={s.id}
                                  onClick={() => toggleMark(summarySelectedDate!, s.memberName)}
                                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                                    markedKeys.has(mkKey(summarySelectedDate!, s.memberName))
                                      ? 'bg-orange-500 text-white ring-2 ring-orange-300 shadow-sm'
                                      : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                                  }`}
                                >
                                  {s.memberName}
                                  {markedKeys.has(mkKey(summarySelectedDate!, s.memberName)) && (
                                    <span className="ml-1 text-orange-100 text-xs">調整</span>
                                  )}
                                </button>
                              ))}
                              {hasDraft && !isAdding && (
                                <span className="flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
                                  <BellPlus className="w-3 h-3" />
                                  依頼{requestDrafts.find(d => d.key === cellKey)?.requiredCount}人
                                  <button onClick={() => setRequestDrafts(prev => prev.filter(d => d.key !== cellKey))} className="ml-0.5 hover:text-purple-900">
                                    <X className="w-2.5 h-2.5" />
                                  </button>
                                </span>
                              )}
                              {!hasDraft && !isAdding && (
                                <button
                                  onClick={() => { setAddingRequestKey(cellKey); setDraftRequiredCount(1); }}
                                  className="flex items-center gap-1 text-[11px] text-purple-500 hover:text-purple-700 px-2 py-1 border border-dashed border-purple-200 rounded-full hover:bg-purple-50 transition-all"
                                >
                                  <BellPlus className="w-3 h-3" />依頼
                                </button>
                              )}
                            </div>
                          </div>
                          {/* 依頼追加フォーム（インライン） */}
                          {isAdding && (
                            <div className="mt-2 border border-purple-200 rounded-xl p-3 bg-purple-50">
                              <p className="text-xs font-semibold text-purple-700 mb-2">必要人数を設定</p>
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2">
                                  <button type="button" onClick={() => setDraftRequiredCount(c => Math.max(1, c - 1))} className="w-7 h-7 rounded-full bg-white border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100">-</button>
                                  <span className="text-sm font-bold w-8 text-center">{draftRequiredCount}</span>
                                  <button type="button" onClick={() => setDraftRequiredCount(c => c + 1)} className="w-7 h-7 rounded-full bg-white border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100">+</button>
                                  <span className="text-xs text-gray-500">人</span>
                                </div>
                                <div className="flex gap-1.5 ml-auto">
                                  <Button size="sm" variant="ghost" onClick={() => { setAddingRequestKey(null); setDraftRequiredCount(1); }}>取消</Button>
                                  <Button
                                    size="sm"
                                    variant="success"
                                    disabled={savingRequest}
                                    onClick={async () => {
                                      const place = group.place;
                                      const tLabel = tg.label;
                                      const templateEntry = Object.entries(TEMPLATE_LABELS).find(([, v]) => v === tLabel);
                                      const isTemplate = !!templateEntry;
                                      const tCode = isTemplate ? templateEntry![0] as TemplateCode : undefined;
                                      setSavingRequest(true);
                                      try {
                                        await createShiftRequest({
                                          date: summarySelectedDate!,
                                          place,
                                          timeType: isTemplate ? 'template' : 'time',
                                          template: tCode,
                                          timeLabel: tLabel,
                                          requiredCount: draftRequiredCount,
                                          createdBy: adminName,
                                        });
                                        setRequestDrafts(prev => [...prev, { key: cellKey, date: summarySelectedDate!, place, timeType: isTemplate ? 'template' : 'time', template: tCode, timeLabel: tLabel, requiredCount: draftRequiredCount }]);
                                        setAddingRequestKey(null);
                                        setDraftRequiredCount(1);
                                        toast.show('出勤依頼を追加しました（LINE操作ページから送信できます）', 'success');
                                      } catch (e) { toast.show(`追加失敗: ${(e as Error).message}`, 'error'); }
                                      finally { setSavingRequest(false); }
                                    }}
                                  >
                                    <BellPlus className="w-3.5 h-3.5" />追加
                                  </Button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {/* 別の場所・時間帯で出勤依頼を追加（確定シフトがある場合も使用可） */}
              {(() => {
                const freeKey = `${summarySelectedDate}_新規依頼_`;
                const isAdding = addingRequestKey === freeKey;
                return isAdding ? (
                  <div className="border border-purple-200 rounded-xl p-3 bg-purple-50 space-y-3 mt-2">
                    <p className="text-xs font-semibold text-purple-700 flex items-center gap-1.5">
                      <BellPlus className="w-3.5 h-3.5" />出勤依頼の追加（場所・時間帯を指定）
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">場所</label>
                        <Select id="req-place-extra" defaultValue="" className="text-sm">
                          <option value="">選択</option>
                          {PLACE_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                        </Select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">時間帯</label>
                        <Select id="req-time-extra" defaultValue="A" className="text-sm">
                          {(['A', 'B', 'C', 'D'] as TemplateCode[]).map(t => (
                            <option key={t} value={t}>{TEMPLATE_LABELS[t]}</option>
                          ))}
                          <option value="__custom__">時間指定</option>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">必要人数</label>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setDraftRequiredCount(c => Math.max(1, c - 1))} className="w-7 h-7 rounded-full bg-white border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100">-</button>
                        <span className="text-sm font-bold w-8 text-center">{draftRequiredCount}</span>
                        <button type="button" onClick={() => setDraftRequiredCount(c => c + 1)} className="w-7 h-7 rounded-full bg-white border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100">+</button>
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => { setAddingRequestKey(null); setDraftRequiredCount(1); }}>キャンセル</Button>
                      <Button
                        size="sm"
                        variant="success"
                        disabled={savingRequest}
                        onClick={async () => {
                          const placeEl = document.getElementById('req-place-extra') as HTMLSelectElement;
                          const timeEl = document.getElementById('req-time-extra') as HTMLSelectElement;
                          const place = placeEl?.value;
                          const timeVal = timeEl?.value;
                          if (!place) { toast.show('場所を選択してください', 'error'); return; }
                          const isTemplate = timeVal !== '__custom__';
                          const tCode = isTemplate ? timeVal as TemplateCode : undefined;
                          const tLabel = isTemplate ? TEMPLATE_LABELS[tCode!] : '時間指定';
                          const key = `${summarySelectedDate}_${place}_${tLabel}`;
                          if (requestDrafts.some(d => d.key === key)) { toast.show('同じ依頼が既に追加されています', 'error'); return; }
                          setSavingRequest(true);
                          try {
                            await createShiftRequest({
                              date: summarySelectedDate!,
                              place,
                              timeType: isTemplate ? 'template' : 'time',
                              template: tCode,
                              timeLabel: tLabel,
                              requiredCount: draftRequiredCount,
                              createdBy: adminName,
                            });
                            setRequestDrafts(prev => [...prev, { key, date: summarySelectedDate!, place, timeType: isTemplate ? 'template' : 'time', template: tCode, timeLabel: tLabel, requiredCount: draftRequiredCount }]);
                            setAddingRequestKey(null);
                            setDraftRequiredCount(1);
                            toast.show('出勤依頼を追加しました（LINE操作ページから送信できます）', 'success');
                          } catch (e) { toast.show(`追加失敗: ${(e as Error).message}`, 'error'); }
                          finally { setSavingRequest(false); }
                        }}
                      >
                        <BellPlus className="w-3.5 h-3.5" />追加
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setAddingRequestKey(freeKey); setDraftRequiredCount(1); }}
                    className="flex items-center gap-1.5 text-xs text-purple-600 hover:text-purple-800 font-medium px-3 py-2 border border-dashed border-purple-300 rounded-lg hover:bg-purple-50 transition-all mt-2 w-full justify-center"
                  >
                    <BellPlus className="w-3.5 h-3.5" />別の場所・時間帯で出勤依頼を追加
                  </button>
                );
              })()}
              <div className="flex items-center justify-between mt-1 px-1">
                <p className="text-[10px] text-gray-400">名前をタップすると調整マークが付きます（復元ログにも反映）</p>
                {requestDrafts.length > 0 && (
                  <button
                    onClick={() => setRequestDrafts([])}
                    className="text-[10px] text-purple-500 hover:text-purple-700 flex items-center gap-0.5"
                  >
                    <X className="w-2.5 h-2.5" />出勤依頼を全解除
                  </button>
                )}
              </div>
            </div>
          )}
        </Card>
      )}

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
          {filtered.flatMap((s, idx) => {
            const getGroupLabel = (shift: Shift): string => {
              switch (sortKey) {
                case 'date':      return formatDateJP(shift.date);
                case 'weekday':   return `${weekdayJP(shift.date)}曜日`;
                case 'place':     return shift.place ?? '場所未設定';
                case 'time':      return timeLabelOf(shift) || '時間未設定';
                case 'name':      return shift.memberName;
                case 'headcount': return shift.headcount ? `${shift.headcount}人` : '人数未設定';
              }
            };
            const currentKey = getGroupLabel(s);
            const prevKey = idx > 0 ? getGroupLabel(filtered[idx - 1]) : null;
            const isToday = s.date === todayStr();
            const timeLabel = timeLabelOf(s);
            return [
              prevKey !== currentKey ? (
                <div key={`div-${s.id}`} className="flex items-center gap-2 pt-1">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-xs text-gray-400 font-medium px-2 shrink-0">{currentKey}</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>
              ) : null,
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
                    <p className="font-medium text-gray-900">{s.subject}</p>
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
              </Card>,
            ].filter(Boolean);
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
            {/* 初回承認（lastPlaceなし）の場合は警告表示 */}
            {!getMemberLastPlace(approvingShift.memberName) && (
              <div className="flex items-start gap-2 bg-amber-50 text-amber-700 text-xs px-3 py-2 rounded-lg">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>初回承認です。場所を設定してください</span>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                場所
                {getMemberLastPlace(approvingShift.memberName) && (
                  <span className="text-xs font-normal text-gray-400 ml-1">（前回: {getMemberLastPlace(approvingShift.memberName)}）</span>
                )}
              </label>
              <Select value={approvePlace} onChange={(e) => setApprovePlace(e.target.value)}>
                <option value="">指定なし</option>
                {PLACE_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
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

      {/* 復元ログモーダル */}
      <Modal open={logOpen} onClose={() => setLogOpen(false)} title="削除依頼・承認ログ">
        {(() => {
          const deleteReqs = shifts.filter((s) => s.status === 'delete_requested');
          const hasDeleteReqs = deleteReqs.length > 0;
          const hasLogs = approvalLogs.length > 0;

          if (!hasDeleteReqs && !hasLogs) {
            return <EmptyState icon={<History className="w-8 h-8" />} title="ログはありません" />;
          }

          return (
            <div className="space-y-4">
              {/* 削除依頼中のシフト（現行情報） */}
              {hasDeleteReqs && (
                <div>
                  <p className="text-xs font-semibold text-rose-600 mb-2 flex items-center gap-1">
                    <Trash2 className="w-3.5 h-3.5" />削除依頼中のシフト（現行情報）
                  </p>
                  <div className="space-y-2">
                    {deleteReqs.map((s) => {
                      const timeLabel = timeLabelOf(s);
                      return (
                        <div key={s.id} className="p-3 rounded-lg border border-rose-200 bg-rose-50">
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                                <span className="text-sm font-medium text-gray-900">{s.memberName}</span>
                                {markedKeys.has(mkKey(s.date, s.memberName)) && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-orange-100 text-orange-600">調整</span>
                                )}
                              </div>
                              <p className="text-xs text-gray-600">{formatDateJP(s.date)} · {s.subject}</p>
                              <div className="flex flex-wrap gap-x-2 text-xs text-gray-500 mt-0.5">
                                {timeLabel && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{timeLabel}</span>}
                                {s.place && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{s.place}</span>}
                              </div>
                            </div>
                            <div className="flex gap-1.5 shrink-0 flex-wrap">
                              <Button size="sm" variant="secondary" onClick={() => { setLogOpen(false); openAdjust(s); }}>
                                <Sliders className="w-3.5 h-3.5" />削除せず修正
                              </Button>
                              <Button size="sm" variant="danger" onClick={() => doAdminDelete(s)}>
                                <Trash2 className="w-3.5 h-3.5" />削除
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 承認ログ: 検索・ソート付き */}
              {hasLogs && (
                <div>
                  {hasDeleteReqs && <div className="border-t border-gray-200 my-1" />}
                  <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
                    <History className="w-3.5 h-3.5" />承認ログ（7日以内復元可）
                  </p>
                  {/* 検索・ソート */}
                  <div className="space-y-2 mb-3">
                    <Input
                      placeholder="名前・場所・日付で検索"
                      value={logSearch}
                      onChange={(e) => setLogSearch(e.target.value)}
                    />
                    <div className="flex gap-1 flex-wrap">
                      {([
                        { key: 'date', label: '日付' },
                        { key: 'place', label: '場所' },
                        { key: 'name', label: '名前' },
                        { key: 'marked', label: '調整対象' },
                      ] as const).map(({ key, label }) => (
                        <button
                          key={key}
                          onClick={() => setLogSortKey(key)}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                            logSortKey === key
                              ? key === 'marked' ? 'bg-orange-500 text-white' : 'bg-slate-800 text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                      {markedKeys.size > 0 && (
                        <span className="ml-auto text-[10px] text-orange-600 bg-orange-50 px-2 py-1 rounded-lg self-center">
                          調整 {markedKeys.size}件
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {filteredLogs.map((log) => {
                      const expired = !isPast7Days(log.createdAt);
                      const before = log.beforeState;
                      const isMarked = before ? markedKeys.has(mkKey(before.date, before.memberName)) : false;
                      return (
                        <div
                          key={log.id}
                          className={`p-3 rounded-lg border ${isMarked ? 'border-orange-200 bg-orange-50' : 'border-gray-100'}`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge color={log.action === 'approve' ? 'confirmed' : log.action === 'deny' ? 'reviewed' : 'blue'}>
                                {log.action === 'approve' ? '許可' : log.action === 'deny' ? '否認' : '調整'}
                              </Badge>
                              {isMarked && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-orange-100 text-orange-600">調整</span>
                              )}
                              <span className="text-xs text-gray-500">{formatDateTimeJP(log.createdAt)}</span>
                            </div>
                            <Button size="sm" variant="ghost" disabled={expired} onClick={() => doRestore(log)}>
                              <RotateCcw className="w-3.5 h-3.5" />復元
                            </Button>
                          </div>
                          {before && (
                            <p className="text-xs text-gray-600">
                              <span className={isMarked ? 'font-semibold text-orange-700' : 'font-medium text-gray-900'}>
                                {before.memberName}
                              </span>
                              {' · '}{formatDateJP(before.date)} · {before.subject}
                              {before.place && <span className="ml-1 text-gray-400">({before.place})</span>}
                            </p>
                          )}
                          {expired && <p className="text-[10px] text-gray-400 mt-1">7日経過のため復元不可</p>}
                        </div>
                      );
                    })}
                    {filteredLogs.length === 0 && (
                      <p className="text-sm text-gray-400 text-center py-3">該当するログがありません</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </Modal>
    </AdminLayout>
  );
}
