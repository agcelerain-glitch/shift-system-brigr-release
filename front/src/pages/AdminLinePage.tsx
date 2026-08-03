// /admin-line LINE操作: グループ送信・自分への連絡・個別チャット・GID管理

import { useState, useEffect, useMemo } from 'react';
import { AdminLayout } from '../components/AdminLayout';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Card, Button, FloatTextarea, Select, Badge, Modal } from '../components/ui';
import {
  Send, Bell, MessageCircle, Megaphone, Users, Info, Trash2, Wifi, WifiOff,
  CalendarDays, X, BellPlus, CheckSquare, Square, ChevronDown, ChevronUp,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { callLineApi, subscribeLineConfig, deleteGroupId, sendShiftRequestInvites, deleteShiftRequest } from '../lib/db';
import { isFirebaseConfigured, API_BASE_URL } from '../lib/firebase';
import { formatDateJP, todayStr, displayTime } from '../lib/utils';
import { MonthCalendar, DayShiftList } from '../components/MonthCalendar';
import { PLACE_OPTIONS, TEMPLATE_LABELS } from '../lib/config';
import type { Shift } from '../lib/types';

// 配置テンプレート（固定順序）
const TEMPLATE_POSITIONS = [
  '付け回し', 'キャッシャー', 'フロント', 'ホール長', 'ホール', 'ストッカー', '全体', 'ベガ(フロント)', 'other1',
] as const;

// 固定常駐メンバー（バイトシフト外）
const FIXED_MEMBERS = ['松村', '中嶋', '笠井', '下村', '樋口', '雪愛', '保坂', '金田', '奈良', '今福', '大澤', '遠藤'];

type PositionRow = {
  id: string;
  position: string;
  positionCustom: string;     // other1 の自由記入名
  selectedMembers: string[];  // チップ選択したメンバー名
  freeInputName: string;      // 直接入力（急な交代など）
};

function initPosRows(): PositionRow[] {
  return TEMPLATE_POSITIONS.map((pos) => ({
    id: pos,
    position: pos,
    positionCustom: '',
    selectedMembers: [],
    freeInputName: '',
  }));
}

// シフトの時間帯ラベル
function timeLabelOfShift(s: Shift): string {
  if (s.timeType === 'template' && s.template) return TEMPLATE_LABELS[s.template];
  if (s.timeType === 'time') return `${displayTime(s.timeStart ?? '')}〜${displayTime(s.timeEnd ?? '')}`;
  if (s.timeType === 'other') return 'その他';
  return '';
}

// 日付文字列を「M/D（曜）」形式に
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAYS[d.getDay()]}）`;
}

export function AdminLinePage() {
  const { members, shifts, shiftRequests } = useData();
  const { name: adminName } = useAuth();
  const toast = useToast();
  const [sending, setSending] = useState(false);

  // グループ送信①: お知らせなど
  const [shiftMsg, setShiftMsg] = useState('');
  // 当日ポジション配置
  const [posPlace, setPosPlace] = useState('');
  const [posPlaceCustom, setPosPlaceCustom] = useState('');
  const [posRows, setPosRows] = useState<PositionRow[]>(initPosRows);
  const [posMemo, setPosMemo] = useState('');
  // グループ送信②: シフト連絡
  const [shiftShareWeekOffset, setShiftShareWeekOffset] = useState(1);
  const [shiftShareExtras, setShiftShareExtras] = useState<{ date: string; place: string; name: string }[]>([]);
  const [shiftShareExtraDate, setShiftShareExtraDate] = useState('');
  const [shiftShareExtraPlace, setShiftShareExtraPlace] = useState('');
  const [shiftShareExtraName, setShiftShareExtraName] = useState('');
  const [shiftShareConfirmOpen, setShiftShareConfirmOpen] = useState(false);
  // セルフ通知
  const [selfMsg, setSelfMsg] = useState('');
  // 個別チャット
  const [targetMember, setTargetMember] = useState('');
  const [dmMsg, setDmMsg] = useState('');
  // 出勤依頼送信
  const [selectedRequestIds, setSelectedRequestIds] = useState<Set<string>>(new Set());
  const [inviteTargetLineIds, setInviteTargetLineIds] = useState<Set<string>>(new Set());
  const [inviteComment, setInviteComment] = useState('');
  const [inviteSendToGroup, setInviteSendToGroup] = useState(false);
  const [sendingInvites, setSendingInvites] = useState(false);
  const [inviteSectionOpen, setInviteSectionOpen] = useState(true);
  // GID管理
  const [groupId, setGroupId] = useState<string | null | undefined>(undefined);
  const [deletingGid, setDeletingGid] = useState(false);
  // カレンダー
  const [calSelected, setCalSelected] = useState<string | null>(null);
  type CalFilter = 'plan' | 'confirmed' | 'reviewed' | 'unavailable';
  const [calFilters, setCalFilters] = useState<Set<CalFilter>>(
    new Set(['plan', 'confirmed', 'reviewed', 'unavailable'])
  );
  const toggleCalFilter = (f: CalFilter) => {
    setCalFilters((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f); else next.add(f);
      return next;
    });
  };

  // LINEグループID購読
  useEffect(() => {
    const unsub = subscribeLineConfig((data) => {
      setGroupId(data?.groupId ?? null);
    });
    return unsub;
  }, []);

  const todayShifts = shifts.filter((s) => s.date === todayStr());
  const todayConfirmedMembers = useMemo(
    () => [...new Set(todayShifts.filter((s) => s.status === 'confirmed').map((s) => s.memberName))],
    [todayShifts],
  );
  // ポジション配置で選べる全メンバー（固定＋今日の確定、重複除く）
  const allPosMembers = useMemo(() => {
    const set = new Set([...FIXED_MEMBERS, ...todayConfirmedMembers]);
    return [...set];
  }, [todayConfirmedMembers]);

  const lineMembers = members.filter((m) => m.lineUserId);
  const adminMember = members.find((m) => m.name === adminName);
  const adminLineId = adminMember?.lineUserId;

  // グループ送信③: 今週（＋offset週）の月〜日
  const shiftShareWeekDates = useMemo(() => {
    const today = new Date();
    const dow = today.getDay();
    const diff = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(today);
    monday.setDate(today.getDate() + diff + shiftShareWeekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dd}`;
    });
  }, [shiftShareWeekOffset]);

  const weekLabel = useMemo(() => {
    const label = shiftShareWeekOffset === 0 ? '今週' : shiftShareWeekOffset === 1 ? '来週' : shiftShareWeekOffset === -1 ? '先週' : `${shiftShareWeekOffset > 0 ? '+' : ''}${shiftShareWeekOffset}週`;
    return `${label}（${formatShortDate(shiftShareWeekDates[0]).replace('（', '').replace(/（.*）/, '')}${shiftShareWeekDates[0].slice(5, 10).replace('-', '/')}〜${shiftShareWeekDates[6].slice(5, 10).replace('-', '/')}）`;
  }, [shiftShareWeekOffset, shiftShareWeekDates]);

  type PivotDay = {
    date: string;
    placeGroups: { place: string; timeGroups: { label: string; members: string[] }[] }[];
  };

  const shiftSharePivot = useMemo((): PivotDay[] => {
    return shiftShareWeekDates.map((date) => {
      const dayShifts = shifts.filter(
        (s) => s.date === date && s.timeType !== 'none' && s.status === 'confirmed'
      );
      const dayExtras = shiftShareExtras.filter((e) => e.date === date);

      const placeMap = new Map<string, Map<string, string[]>>();
      for (const s of dayShifts) {
        const place = s.place ?? '場所未設定';
        const tLabel = timeLabelOfShift(s) || '時間未設定';
        if (!placeMap.has(place)) placeMap.set(place, new Map());
        const tm = placeMap.get(place)!;
        if (!tm.has(tLabel)) tm.set(tLabel, []);
        tm.get(tLabel)!.push(s.memberName);
      }
      for (const e of dayExtras) {
        const place = e.place || '場所未設定';
        if (!placeMap.has(place)) placeMap.set(place, new Map());
        const tm = placeMap.get(place)!;
        if (!tm.has('追加')) tm.set('追加', []);
        tm.get('追加')!.push(e.name);
      }

      return {
        date,
        placeGroups: Array.from(placeMap.entries()).map(([place, tm]) => ({
          place,
          timeGroups: Array.from(tm.entries()).map(([label, mbs]) => ({ label, members: mbs })),
        })),
      };
    });
  }, [shifts, shiftShareWeekDates, shiftShareExtras]);

  const buildShiftShareMessage = (): string => {
    const s = shiftShareWeekDates[0];
    const e = shiftShareWeekDates[6];
    const fmt = (d: string) => `${parseInt(d.slice(5, 7))}/${parseInt(d.slice(8, 10))}`;
    const offsetLabel = shiftShareWeekOffset === 0 ? '今週' : shiftShareWeekOffset === 1 ? '来週' : shiftShareWeekOffset === -1 ? '先週' : `${shiftShareWeekOffset > 0 ? '+' : ''}${shiftShareWeekOffset}週`;
    let msg = `📅 シフト連絡（${offsetLabel} ${fmt(s)}〜${fmt(e)}）\n`;
    for (const day of shiftSharePivot) {
      if (day.placeGroups.length === 0) continue;
      msg += `\n▸ ${formatShortDate(day.date)}\n`;
      for (const pg of day.placeGroups) {
        msg += ` 📍 ${pg.place}\n`;
        for (const tg of pg.timeGroups) {
          msg += `  ${tg.label}: ${tg.members.join('、')}\n`;
        }
      }
    }
    return msg.trim();
  };

  const addShiftShareExtra = () => {
    if (!shiftShareExtraDate || !shiftShareExtraPlace || !shiftShareExtraName.trim()) return;
    setShiftShareExtras((prev) => [
      ...prev,
      { date: shiftShareExtraDate, place: shiftShareExtraPlace, name: shiftShareExtraName.trim() },
    ]);
    setShiftShareExtraName('');
  };

  const send = async (
    path: string,
    body: Record<string, unknown>,
    label: string,
    onSuccess?: () => void,
  ) => {
    setSending(true);
    try {
      const res = await callLineApi(path, body);
      if (res.ok) {
        toast.show(`${label}: ${res.message}`, 'success');
        onSuccess?.();
      } else {
        toast.show(`${label}失敗: ${res.message}`, 'error');
      }
    } catch {
      toast.show(`${label}失敗（通信エラー）`, 'error');
    } finally {
      setSending(false);
    }
  };

  const buildPositionMessage = (): string => {
    const dateLabel = formatDateJP(todayStr());
    let msg = `📅 ${dateLabel} ポジション配置`;
    const placeDisplay = posPlace === '__custom__' ? posPlaceCustom.trim() : posPlace;
    if (placeDisplay) msg += `\n📍 ${placeDisplay}`;
    msg += '\n';
    for (const row of posRows) {
      const posName = row.position === 'other1'
        ? row.positionCustom.trim()
        : row.position;
      if (!posName) continue;
      const persons: string[] = [...row.selectedMembers];
      row.freeInputName.split(/[,、]/).map((n) => n.trim()).filter(Boolean).forEach((n) => persons.push(n));
      if (persons.length === 0) continue;
      msg += `\n▸ ${posName}: ${persons.join('、')}`;
    }
    if (posMemo.trim()) msg += `\n\n${posMemo.trim()}`;
    return msg;
  };

  const sendSelf = async () => {
    if (!selfMsg.trim()) return;
    if (!adminLineId) {
      toast.show('あなたのLINE IDが未登録です。LINEで「名前登録 ' + (adminName ?? 'お名前') + '」と送信してください。', 'error');
      return;
    }
    await send('/line/dm', { lineUserId: adminLineId, message: selfMsg }, '自分への連絡', () => setSelfMsg(''));
  };

  const handleDeleteGid = async () => {
    if (!window.confirm('登録済のGIDを削除しますか？\n削除後はグループで「グループ登録」と送信して再登録してください。')) return;
    setDeletingGid(true);
    try {
      await deleteGroupId();
      toast.show('GIDを削除しました', 'success');
    } catch (e) {
      toast.show(`削除失敗: ${(e as Error).message}`, 'error');
    } finally {
      setDeletingGid(false);
    }
  };

  const calShifts = useMemo(() => shifts.filter((s) => {
    const isUnavail = s.timeType === 'none';
    if (isUnavail) return calFilters.has('unavailable');
    if (s.status === 'plan') return calFilters.has('plan');
    if (s.status === 'confirmed') return calFilters.has('confirmed');
    if (s.status === 'reviewed') return calFilters.has('reviewed');
    return false;
  }), [shifts, calFilters]);

  const calSelectedShifts = calSelected ? shifts.filter((s) => s.date === calSelected) : [];

  const shiftShareHasData = shiftSharePivot.some((d) => d.placeGroups.length > 0);

  return (
    <AdminLayout>
      <div className="mb-4">
        <h1 className="text-lg font-bold text-gray-900">LINE操作</h1>
      </div>

      {!API_BASE_URL && !isFirebaseConfigured && (
        <Card className="p-3 mb-4 bg-amber-50 border-amber-200">
          <p className="text-xs text-amber-700 flex items-center gap-1.5">
            <Info className="w-4 h-4" />モックモード: VITE_API_BASE_URL未設定のため実際の送信は行わず成功扱い
          </p>
        </Card>
      )}

      {/* 本日のシフト概要 */}
      <Card className="p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
            <CalendarDays className="w-3.5 h-3.5" />本日({formatDateJP(todayStr())})のシフト
          </p>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${todayShifts.length > 0 ? 'bg-confirmed-soft text-confirmed-strong' : 'bg-gray-100 text-gray-400'}`}>
            {todayShifts.length}名
          </span>
        </div>
        {todayShifts.length === 0 ? (
          <p className="text-xs text-gray-400">本日のシフトはありません</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {todayShifts.map((s) => (
              <span
                key={s.id}
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  s.status === 'confirmed' ? 'bg-confirmed-soft text-confirmed-strong' :
                  s.status === 'reviewed'  ? 'bg-gray-100 text-gray-400' :
                  'bg-plan-soft text-plan-strong'
                }`}
              >
                {s.memberName}{s.status === 'plan' && '（予）'}{s.status === 'reviewed' && '（済）'}
              </span>
            ))}
          </div>
        )}
      </Card>

      {/* GID管理 */}
      <Card className="p-4 mb-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            {groupId === undefined ? (
              <Badge color="blue">読込中…</Badge>
            ) : groupId ? (
              <Badge color="confirmed">GID登録済</Badge>
            ) : (
              <Badge color="red">GID未登録</Badge>
            )}
            <span className="text-xs font-medium text-gray-700">LINEグループID</span>
            <span className="text-xs font-mono text-gray-500">
              {groupId === undefined ? '…' : groupId ? '********************' : '—'}
            </span>
          </div>
          {groupId && (
            <Button size="sm" variant="danger" onClick={handleDeleteGid} disabled={deletingGid}>
              <Trash2 className="w-3.5 h-3.5" />{deletingGid ? '削除中…' : 'GID削除'}
            </Button>
          )}
        </div>
        {!groupId && groupId !== undefined && (
          <p className="text-xs text-gray-400 mt-2">
            LINEグループに Bot を招待後、グループ内で「グループ登録」と送信してください。
          </p>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 左列: グループ送信①③ */}
        <div className="flex flex-col gap-4">

          {/* グループ送信① お知らせなど */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center text-green-600">
                <Megaphone className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">グループ送信① お知らせなど</h2>
                <p className="text-xs text-gray-500">グループへメッセージを一括送信</p>
              </div>
            </div>
            <FloatTextarea
              label="「今週」とグループや公式LINEで送信すると、今週の予定が自動応答されます"
              rows={4}
              value={shiftMsg}
              onChange={(e) => setShiftMsg(e.target.value)}
              disabled={sending}
            />
            <p className="text-[10px] text-gray-400 mt-1.5">送信失敗時は内容を非公開メモに保存してください</p>
            <div className="mt-2 flex justify-end">
              <Button
                onClick={() => send('/line/group/shift', { message: shiftMsg }, 'お知らせ', () => setShiftMsg(''))}
                disabled={sending || !shiftMsg.trim() || !groupId}
                title={!groupId ? 'GIDが未登録です' : undefined}
              >
                <Send className="w-4 h-4" />送信
              </Button>
            </div>
          </Card>

          {/* グループ送信② シフト連絡 */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-xl bg-teal-100 flex items-center justify-center text-teal-600">
                <CalendarDays className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">グループ送信② シフト連絡</h2>
                <p className="text-xs text-gray-500">週間シフトをピボット形式でグループへ共有</p>
              </div>
            </div>

            {/* 週選択 */}
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => setShiftShareWeekOffset((o) => o - 1)}
                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500"
                aria-label="前の週"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="flex-1 text-center text-sm font-medium text-gray-700">
                {shiftShareWeekOffset === 0 ? '今週' : shiftShareWeekOffset === 1 ? '来週' : shiftShareWeekOffset === -1 ? '先週' : `${shiftShareWeekOffset > 0 ? '+' : ''}${shiftShareWeekOffset}週`}
                <span className="ml-1.5 text-xs font-normal text-gray-400">
                  {shiftShareWeekDates[0].slice(5, 10).replace('-', '/')}〜{shiftShareWeekDates[6].slice(5, 10).replace('-', '/')}
                </span>
              </span>
              <button
                onClick={() => setShiftShareWeekOffset((o) => o + 1)}
                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500"
                aria-label="次の週"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              {shiftShareWeekOffset !== 0 && (
                <button
                  onClick={() => setShiftShareWeekOffset(0)}
                  className="text-xs px-2 py-1 rounded-lg border border-teal-300 text-teal-600 hover:bg-teal-50"
                >
                  今週
                </button>
              )}
            </div>

            {/* ピボットプレビュー */}
            <div className="mb-4 space-y-2 max-h-72 overflow-y-auto pr-1">
              {!shiftShareHasData ? (
                <p className="text-xs text-gray-400 text-center py-4">この週の確定シフトはありません</p>
              ) : (
                shiftSharePivot.map((day) => {
                  if (day.placeGroups.length === 0) return null;
                  return (
                    <div key={day.date} className="border border-gray-200 rounded-xl overflow-hidden">
                      <div className="bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-700 border-b border-gray-200">
                        {formatShortDate(day.date)}
                      </div>
                      <div className="divide-y divide-gray-100">
                        {day.placeGroups.map((pg) => (
                          <div key={pg.place} className="px-3 py-2">
                            <span className="text-[10px] font-medium text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded mr-2">
                              {pg.place}
                            </span>
                            {pg.timeGroups.map((tg) => (
                              <div key={tg.label} className="mt-1 text-xs text-gray-700">
                                <span className="text-gray-400 mr-1">{tg.label}:</span>
                                {tg.members.join('、')}
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* 名簿外の人を追加 */}
            <div className="mb-4 p-3 bg-gray-50 rounded-xl border border-gray-200">
              <p className="text-xs font-medium text-gray-600 mb-2">名簿にいない人を追加</p>
              <div className="grid grid-cols-[1fr_1fr] gap-2 mb-2">
                <Select
                  value={shiftShareExtraDate}
                  onChange={(e) => setShiftShareExtraDate(e.target.value)}
                >
                  <option value="">日付を選択</option>
                  {shiftShareWeekDates.map((d) => (
                    <option key={d} value={d}>{formatShortDate(d)}</option>
                  ))}
                </Select>
                <Select
                  value={shiftShareExtraPlace}
                  onChange={(e) => setShiftShareExtraPlace(e.target.value)}
                >
                  <option value="">場所を選択</option>
                  {PLACE_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                </Select>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={shiftShareExtraName}
                  onChange={(e) => setShiftShareExtraName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addShiftShareExtra()}
                  placeholder="名前を入力"
                  className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={addShiftShareExtra}
                  disabled={!shiftShareExtraDate || !shiftShareExtraPlace || !shiftShareExtraName.trim()}
                >
                  追加
                </Button>
              </div>
              {shiftShareExtras.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {shiftShareExtras.map((ex, i) => (
                    <span
                      key={i}
                      className="flex items-center gap-1 text-xs bg-teal-100 text-teal-800 px-2 py-1 rounded-full"
                    >
                      {formatShortDate(ex.date)} {ex.place} {ex.name}
                      <button
                        onClick={() => setShiftShareExtras((prev) => prev.filter((_, j) => j !== i))}
                        className="ml-0.5 text-teal-500 hover:text-red-400"
                        aria-label="削除"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <p className="text-[10px] text-gray-400 mb-2">送信失敗時は内容を非公開メモに保存してください</p>
            <div className="flex justify-end">
              <Button
                onClick={() => setShiftShareConfirmOpen(true)}
                disabled={sending || !groupId || !shiftShareHasData}
                title={!groupId ? 'GIDが未登録です' : !shiftShareHasData ? 'この週の確定シフトがありません' : undefined}
              >
                <Send className="w-4 h-4" />送信確認
              </Button>
            </div>
          </Card>

        </div>{/* /左列 */}

        {/* 右列: グループ送信③ 当日ポジション配置 */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">グループ送信③ 当日ポジション配置</h2>
              <p className="text-xs text-gray-500">当日の配置をグループへ連絡</p>
            </div>
          </div>

          {/* 日付（自動） */}
          <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-3">
            <CalendarDays className="w-3.5 h-3.5" />
            <span className="font-medium text-gray-700">{formatDateJP(todayStr())}</span>
            <span>がメッセージ先頭に自動追加されます</span>
          </div>

          {/* 場所プルダウン（全体で1つ） */}
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">場所</label>
            <Select
              value={posPlace}
              onChange={(e) => { setPosPlace(e.target.value); setPosPlaceCustom(''); }}
            >
              <option value="">（場所を選択）</option>
              {PLACE_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
              <option value="__custom__">指定なし（自由記入）</option>
            </Select>
            {posPlace === '__custom__' && (
              <input
                type="text"
                value={posPlaceCustom}
                onChange={(e) => setPosPlaceCustom(e.target.value)}
                placeholder="場所を入力..."
                className="mt-1.5 w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            )}
          </div>

          {/* 配置行（固定テンプレート） */}
          <div className="space-y-3 mb-3">
            {posRows.map((row) => {
              const isOther = row.position === 'other1';
              const posLabel = isOther ? 'その他' : row.position;
              const hasContent =
                row.selectedMembers.length > 0 ||
                row.freeInputName.trim() !== '' ||
                (isOther && row.positionCustom.trim() !== '');

              return (
                <div
                  key={row.id}
                  className={`border-l-4 rounded-r-2xl p-4 transition-colors ${
                    hasContent
                      ? 'border-blue-400 bg-blue-50'
                      : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  {/* ポジション名 + クリアボタン */}
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-base font-bold ${hasContent ? 'text-blue-800' : 'text-gray-400'}`}>
                      {posLabel}
                    </span>
                    {hasContent && (
                      <button
                        type="button"
                        onClick={() => setPosRows((prev) => prev.map((r) =>
                          r.id !== row.id ? r : { ...r, selectedMembers: [], freeInputName: '', positionCustom: '' }
                        ))}
                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-400 transition-colors"
                        aria-label="クリア"
                      >
                        <X className="w-3.5 h-3.5" />クリア
                      </button>
                    )}
                  </div>

                  {/* その他の配置名入力 */}
                  {isOther && (
                    <>
                      <input
                        type="text"
                        value={row.positionCustom}
                        onChange={(e) => setPosRows((prev) => prev.map((r) =>
                          r.id === row.id ? { ...r, positionCustom: e.target.value } : r
                        ))}
                        placeholder="その他の配置名を入力…"
                        className={`mb-1.5 w-full text-base border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white ${
                          row.selectedMembers.length > 0 && !row.positionCustom.trim()
                            ? 'border-amber-400 focus:ring-amber-400'
                            : 'border-gray-300'
                        }`}
                      />
                      {row.selectedMembers.length > 0 && !row.positionCustom.trim() && (
                        <p className="text-xs text-amber-600 mb-3 flex items-center gap-1">
                          ⚠ メンバーが選択されています。配置名を入力してください。
                        </p>
                      )}
                      {!(row.selectedMembers.length > 0 && !row.positionCustom.trim()) && (
                        <div className="mb-3" />
                      )}
                    </>
                  )}

                  {/* 担当者チップ（固定メンバー＋今日の確定） */}
                  {allPosMembers.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {allPosMembers.map((name) => {
                        const selected = row.selectedMembers.includes(name);
                        const isFixed = FIXED_MEMBERS.includes(name);
                        return (
                          <button
                            key={name}
                            type="button"
                            onClick={() => setPosRows((prev) => prev.map((r) => r.id !== row.id ? r : {
                              ...r,
                              selectedMembers: selected
                                ? r.selectedMembers.filter((n) => n !== name)
                                : [...r.selectedMembers, name],
                            }))}
                            className={`text-sm px-4 py-2.5 rounded-full font-medium border-2 transition-all min-w-[4rem] text-center ${
                              selected
                                ? 'border-blue-500 bg-blue-500 text-white shadow-sm'
                                : isFixed
                                  ? 'border-gray-300 bg-gray-100 text-gray-600 active:bg-gray-200'
                                  : 'border-gray-300 bg-white text-gray-700 active:bg-gray-50'
                            }`}
                          >
                            {name}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* 直接入力（急な交代・未登録者） */}
                  <input
                    type="text"
                    value={row.freeInputName}
                    onChange={(e) => setPosRows((prev) => prev.map((r) =>
                      r.id === row.id ? { ...r, freeInputName: e.target.value } : r
                    ))}
                    placeholder="急な交代・未登録者はここに入力（,区切りで複数可）"
                    className="w-full text-base border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                  />
                </div>
              );
            })}
          </div>

          {/* 任意メモ */}
          <FloatTextarea
            rows={2}
            label="追加メモ（任意）"
            value={posMemo}
            onChange={(e) => setPosMemo(e.target.value)}
            disabled={sending}
          />

          {/* 送信プレビュー */}
          <details className="mt-2 mb-1">
            <summary className="text-xs text-gray-400 cursor-pointer select-none hover:text-gray-600">送信プレビューを確認</summary>
            <pre className="mt-1.5 bg-gray-100 rounded-lg p-2.5 text-xs whitespace-pre-wrap break-all font-mono text-gray-700 leading-relaxed">
              {buildPositionMessage()}
            </pre>
          </details>

          <p className="text-[10px] text-gray-400 mt-1">送信失敗時は内容を非公開メモに保存してください</p>
          <div className="mt-2 flex justify-end">
            <Button
              onClick={() => {
                const message = buildPositionMessage();
                send('/line/group/position', { message }, '当日配置', () => {
                  setPosRows(initPosRows());
                  setPosMemo('');
                  setPosPlace('');
                  setPosPlaceCustom('');
                });
              }}
              disabled={sending || !groupId || posRows.every((r) => r.selectedMembers.length === 0 && !r.freeInputName.trim())}
              title={!groupId ? 'GIDが未登録です' : undefined}
            >
              <Send className="w-4 h-4" />送信
            </Button>
          </div>
        </Card>

      </div>{/* /グリッド */}

      {/* セルフ通知 */}
      <Card className="p-5 mt-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center text-purple-600">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">
              自分への連絡
              <small className="ml-1.5 text-xs font-normal text-gray-400">(admin: {adminName})</small>
            </h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              {adminLineId ? (
                <><Wifi className="w-3 h-3 text-green-500" /><p className="text-xs text-green-600">LINE登録済 → 自分のDMへ送信</p></>
              ) : (
                <><WifiOff className="w-3 h-3 text-gray-400" /><p className="text-xs text-gray-400">LINE未登録（LINEで名前登録してください）</p></>
              )}
            </div>
          </div>
        </div>
        <FloatTextarea rows={4} label="自分へのリマインダー…" value={selfMsg} onChange={(e) => setSelfMsg(e.target.value)} disabled={sending} />
        <p className="text-[10px] text-gray-400 mt-1.5">送信失敗時は内容を非公開メモに保存してください</p>
        <div className="mt-2 flex justify-end">
          <Button onClick={sendSelf} disabled={sending || !selfMsg.trim() || !adminLineId}>
            <Send className="w-4 h-4" />送信
          </Button>
        </div>
      </Card>

      {/* 個別チャット */}
      <Card className="p-5 mt-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600">
            <MessageCircle className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">個別チャット連絡</h2>
            <p className="text-xs text-gray-500">メンバーを選んで個別送信</p>
          </div>
        </div>
        <label className="block text-xs font-medium text-gray-600 mb-1">送信先メンバー</label>
        <Select value={targetMember} onChange={(e) => setTargetMember(e.target.value)} className="mb-3">
          <option value="">選択してください</option>
          {lineMembers.length === 0 ? (
            <option disabled>LINE連携メンバーなし</option>
          ) : (
            lineMembers.map((m) => (
              <option key={m.id} value={m.lineUserId!}>
                {m.name}{m.name === adminName ? ' (admin)' : ''}
              </option>
            ))
          )}
        </Select>
        <FloatTextarea rows={3} label="メッセージ本文…" value={dmMsg} onChange={(e) => setDmMsg(e.target.value)} disabled={sending} />
        <div className="mt-3 flex justify-end">
          <Button
            onClick={() => send('/line/dm', { lineUserId: targetMember, message: dmMsg }, '個別チャット', () => setDmMsg(''))}
            disabled={sending || !targetMember || !dmMsg.trim()}
          >
            <Send className="w-4 h-4" />送信
          </Button>
        </div>
      </Card>

      {/* 出勤依頼送信セクション */}
      {shiftRequests.length > 0 && (
        <Card className="p-5 mt-4">
          <button
            className="w-full flex items-center justify-between mb-3"
            onClick={() => setInviteSectionOpen(o => !o)}
          >
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center text-purple-600">
                <BellPlus className="w-5 h-5" />
              </div>
              <div className="text-left">
                <h2 className="font-semibold text-gray-900">出勤依頼送信</h2>
                <p className="text-xs text-gray-500">シフト調整ページで作成した依頼をメンバーへ送信</p>
              </div>
            </div>
            {inviteSectionOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>

          {inviteSectionOpen && (
            <div className="space-y-4">
              {/* ① 出勤依頼を選択 */}
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2">① 送信する依頼を選択</p>
                <div className="space-y-2">
                  {shiftRequests.filter(r => r.status === 'pending').map(req => {
                    const isSelected = selectedRequestIds.has(req.id);
                    const remaining = req.requiredCount - req.acceptedCount;
                    return (
                      <button
                        key={req.id}
                        onClick={() => setSelectedRequestIds(prev => {
                          const next = new Set(prev);
                          isSelected ? next.delete(req.id) : next.add(req.id);
                          return next;
                        })}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                          isSelected ? 'border-purple-400 bg-purple-50' : 'border-gray-200 hover:border-purple-200'
                        }`}
                      >
                        {isSelected ? <CheckSquare className="w-4 h-4 text-purple-600 shrink-0" /> : <Square className="w-4 h-4 text-gray-300 shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">{req.date} · {req.place}</p>
                          <p className="text-xs text-gray-500">{req.timeLabel} · 必要 {req.requiredCount}人（残り{remaining}人）</p>
                        </div>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!window.confirm('この出勤依頼を削除しますか？')) return;
                            try {
                              await deleteShiftRequest(req.id);
                              setSelectedRequestIds(prev => { const next = new Set(prev); next.delete(req.id); return next; });
                              toast.show('出勤依頼を削除しました', 'success');
                            } catch (err) {
                              toast.show(`削除失敗: ${(err as Error).message}`, 'error');
                            }
                          }}
                          className="p-1 text-gray-300 hover:text-red-400 transition"
                          title="依頼を削除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </button>
                    );
                  })}
                  {shiftRequests.every(r => r.status !== 'pending') && (
                    <p className="text-sm text-gray-400 text-center py-2">要請中の出勤依頼はありません</p>
                  )}
                </div>
              </div>

              {selectedRequestIds.size > 0 && (
                <>
                  {/* ② 送信先を選択（複数可） */}
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-2">② 送信先メンバーを選択（複数可）</p>
                    <div className="flex flex-wrap gap-1.5">
                      {lineMembers.map(m => {
                        const isSelected = inviteTargetLineIds.has(m.lineUserId!);
                        return (
                          <button
                            key={m.id}
                            onClick={() => setInviteTargetLineIds(prev => {
                              const next = new Set(prev);
                              isSelected ? next.delete(m.lineUserId!) : next.add(m.lineUserId!);
                              return next;
                            })}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border-2 transition-all ${
                              isSelected ? 'border-purple-500 bg-purple-500 text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-purple-300'
                            }`}
                          >
                            {m.name}{m.name === adminName ? ' (admin)' : ''}
                          </button>
                        );
                      })}
                      {lineMembers.length === 0 && (
                        <p className="text-xs text-gray-400">LINE連携メンバーなし</p>
                      )}
                    </div>
                  </div>

                  {/* グループにも送信 */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setInviteSendToGroup(o => !o)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border-2 transition-all ${
                        inviteSendToGroup ? 'border-green-500 bg-green-500 text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-green-300'
                      }`}
                    >
                      <Megaphone className="w-3.5 h-3.5" />グループにも送信
                    </button>
                    {inviteSendToGroup && !groupId && (
                      <span className="text-xs text-red-500">GID未登録</span>
                    )}
                  </div>

                  {/* コメント */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">③ コメント（任意）</label>
                    <FloatTextarea
                      rows={2}
                      label="追加メッセージ…"
                      value={inviteComment}
                      onChange={e => setInviteComment(e.target.value)}
                      disabled={sendingInvites}
                    />
                  </div>

                  {/* 送信ボタン */}
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setSelectedRequestIds(new Set()); setInviteTargetLineIds(new Set()); setInviteComment(''); setInviteSendToGroup(false); }}
                    >
                      リセット
                    </Button>
                    <Button
                      disabled={sendingInvites || (inviteTargetLineIds.size === 0 && !inviteSendToGroup)}
                      onClick={async () => {
                        if (inviteTargetLineIds.size === 0 && !inviteSendToGroup) {
                          toast.show('送信先またはグループを選択してください', 'error');
                          return;
                        }
                        setSendingInvites(true);
                        try {
                          const targetMembersMap = new Map(lineMembers.map(m => [m.lineUserId!, m.name]));
                          const targets = [...inviteTargetLineIds].map(lid => ({ memberName: targetMembersMap.get(lid) ?? lid, lineUserId: lid }));
                          let allOk = true;
                          for (const reqId of selectedRequestIds) {
                            const req = shiftRequests.find(r => r.id === reqId);
                            if (!req) continue;
                            const groupMsg = inviteSendToGroup
                              ? `【出勤依頼】\n${req.date} ${req.place} ${req.timeLabel}\n必要人数: ${req.requiredCount}人\n${inviteComment ? inviteComment + '\n' : ''}ウェブアプリのお知らせから回答してください。`
                              : undefined;
                            const res = await sendShiftRequestInvites({
                              requestId: reqId,
                              date: req.date,
                              place: req.place,
                              timeLabel: req.timeLabel,
                              targetMembers: targets,
                              comment: inviteComment || undefined,
                              sendToGroup: inviteSendToGroup,
                              groupMessage: groupMsg,
                            });
                            if (!res.ok) { allOk = false; toast.show(`送信失敗: ${res.message}`, 'error'); }
                          }
                          if (allOk) {
                            toast.show('出勤依頼を送信しました', 'success');
                            setSelectedRequestIds(new Set());
                            setInviteTargetLineIds(new Set());
                            setInviteComment('');
                            setInviteSendToGroup(false);
                          }
                        } catch (e) {
                          toast.show(`送信エラー: ${(e as Error).message}`, 'error');
                        } finally {
                          setSendingInvites(false);
                        }
                      }}
                    >
                      <Send className="w-4 h-4" />
                      {sendingInvites ? '送信中…' : `出勤依頼を送信（${selectedRequestIds.size}件）`}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </Card>
      )}

      {/* [開発者メモ] トークン等の秘匿情報はフロントに置かず、Heroku側のAPIで取り扱います。フロントは fetch でエンドポイントを呼ぶだけです。 */}

      {/* 全体シフトカレンダー */}
      <div className="mt-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <CalendarDays className="w-4 h-4" />全体シフトカレンダー
        </h2>
        <div className="flex gap-1.5 flex-wrap mb-3">
          {([
            { id: 'plan', label: '予定', activeClass: 'border-amber-400 bg-amber-50 text-amber-700' },
            { id: 'confirmed', label: '確定', activeClass: 'border-green-500 bg-green-50 text-green-700' },
            { id: 'reviewed', label: '確認済', activeClass: 'border-gray-400 bg-gray-100 text-gray-600' },
            { id: 'unavailable', label: '不可', activeClass: 'border-slate-500 bg-slate-100 text-slate-600' },
          ] as const).map((f) => (
            <button
              key={f.id}
              onClick={() => toggleCalFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border-2 transition-all duration-150 ${
                calFilters.has(f.id) ? f.activeClass : 'border-gray-200 bg-white text-gray-400'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <MonthCalendar shifts={calShifts} onSelectDate={setCalSelected} />
      </div>

      {/* カレンダー日付クリック時のシフト詳細 */}
      <Modal
        open={calSelected !== null}
        onClose={() => setCalSelected(null)}
        title={calSelected ? formatDateJP(calSelected) : ''}
      >
        {calSelected && <DayShiftList date={calSelected} shifts={calSelectedShifts} />}
      </Modal>

      {/* グループ送信② シフト連絡 確認ダイアログ */}
      <Modal
        open={shiftShareConfirmOpen}
        onClose={() => setShiftShareConfirmOpen(false)}
        title="シフト連絡 送信確認"
      >
        <p className="text-xs text-gray-500 mb-2">以下の内容をLINEグループへ送信します。確認してください。</p>
        <pre className="bg-gray-100 rounded-xl p-3 text-xs whitespace-pre-wrap break-all font-mono text-gray-700 leading-relaxed max-h-96 overflow-y-auto mb-4">
          {buildShiftShareMessage()}
        </pre>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setShiftShareConfirmOpen(false)} disabled={sending}>
            キャンセル
          </Button>
          <Button
            onClick={() => {
              const message = buildShiftShareMessage();
              send('/line/group/shift', { message }, 'シフト連絡', () => {
                setShiftShareConfirmOpen(false);
              });
            }}
            disabled={sending}
          >
            <Send className="w-4 h-4" />{sending ? '送信中…' : 'LINEグループへ送信'}
          </Button>
        </div>
      </Modal>
    </AdminLayout>
  );
}
