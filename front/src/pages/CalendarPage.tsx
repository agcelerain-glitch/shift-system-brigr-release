// / ユーザーカレンダー: デフォルトは自分のシフト。プルダウンで全員表示（グラデーション色付き）

import { useMemo, useState } from 'react';
import { UserLayout } from '../components/UserLayout';
import { MonthCalendar, DayShiftList } from '../components/MonthCalendar';
import type { MemberColor } from '../components/MonthCalendar';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { Modal, Select, Button, Card } from '../components/ui';
import { formatDateJP, displayTime } from '../lib/utils';
import { respondToShiftRequestInvite } from '../lib/db';
import type { MemberColor } from '../components/MonthCalendar';
import { useToast } from '../contexts/ToastContext';
import { Megaphone, BellPlus, ChevronDown, ChevronUp, CheckCircle2, XCircle, Clock, MapPin, MessageSquare, AlertTriangle } from 'lucide-react';
import type { ShiftRequestInvite } from '../lib/types';

// 時間選択肢（9:00〜翌8:45、15分刻み）
const BASE_OPTIONS: string[] = [];
for (let h = 9; h < 24; h++) {
  for (const m of [0, 15, 30, 45]) {
    BASE_OPTIONS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
}
const NEXT_DAY_OPTIONS: string[] = [];
for (let h = 0; h <= 8; h++) {
  for (const m of [0, 15, 30, 45]) {
    NEXT_DAY_OPTIONS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
}
const TIME_OPTIONS: string[] = [...BASE_OPTIONS, ...NEXT_DAY_OPTIONS];

const toMinutes = (t: string): number => { const [h, m] = t.split(':').map(Number); const adj = h < 9 ? h + 24 : h; return adj * 60 + m; };

// 場所ごとの固定色マップ（全体表示時にカレンダーセルへ適用）
// キーは PLACE_OPTIONS の各場所名 + '' (場所なし)
const PLACE_COLOR_MAP: Record<string, MemberColor> = {
  'ブリジャール': {
    planBg: 'hsl(152, 55%, 88%)', planText: 'hsl(152, 60%, 24%)',
    confirmedBg: 'hsl(152, 58%, 42%)', confirmedText: 'white',
    reviewedBg: 'rgb(235,235,235)', reviewedText: 'rgb(150,150,150)',
  },
  'ルチア': {
    planBg: 'hsl(210, 55%, 88%)', planText: 'hsl(210, 60%, 28%)',
    confirmedBg: 'hsl(210, 65%, 48%)', confirmedText: 'white',
    reviewedBg: 'rgb(235,235,235)', reviewedText: 'rgb(150,150,150)',
  },
  'セラス': {
    planBg: 'hsl(265, 55%, 88%)', planText: 'hsl(265, 60%, 30%)',
    confirmedBg: 'hsl(265, 58%, 52%)', confirmedText: 'white',
    reviewedBg: 'rgb(235,235,235)', reviewedText: 'rgb(150,150,150)',
  },
  'ルミ・ベガ': {
    planBg: 'hsl(38, 70%, 88%)', planText: 'hsl(38, 75%, 28%)',
    confirmedBg: 'hsl(38, 78%, 50%)', confirmedText: 'white',
    reviewedBg: 'rgb(235,235,235)', reviewedText: 'rgb(150,150,150)',
  },
  '': {
    planBg: 'hsl(340, 55%, 88%)', planText: 'hsl(340, 60%, 28%)',
    confirmedBg: 'hsl(340, 58%, 50%)', confirmedText: 'white',
    reviewedBg: 'rgb(235,235,235)', reviewedText: 'rgb(150,150,150)',
  },
};

type ConfirmType = 'accepted' | 'rejected' | 'adjusted' | null;

function InviteNoticeItem({ invite, myName, onDone }: {
  invite: ShiftRequestInvite;
  myName: string;
  onDone: () => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [confirmType, setConfirmType] = useState<ConfirmType>(null);
  const [adjStart, setAdjStart] = useState('20:00');
  const [adjEnd, setAdjEnd] = useState('02:00');
  const [userComment, setUserComment] = useState('');
  const [responding, setResponding] = useState(false);

  const doRespond = async (type: 'accepted' | 'rejected' | 'adjusted') => {
    if (type === 'adjusted' && toMinutes(adjStart) >= toMinutes(adjEnd)) {
      toast.show('終了時刻は開始時刻より後にしてください', 'error');
      return;
    }
    setResponding(true);
    try {
      const res = await respondToShiftRequestInvite({
        inviteId: invite.id,
        requestId: invite.requestId,
        memberName: myName,
        response: type,
        adjustedTimeStart: type === 'adjusted' ? adjStart : undefined,
        adjustedTimeEnd: type === 'adjusted' ? adjEnd : undefined,
        userComment: userComment || undefined,
      });
      if (res.ok) {
        if (res.result === 'full') {
          toast.show('定員に達したため承認できませんでした（先着順）', 'error');
        } else if (res.result === 'already') {
          toast.show('既に回答済みです', 'error');
        } else {
          const label = type === 'accepted' ? '出勤を承諾しました' : type === 'rejected' ? '不可を送信しました' : '調整出勤を送信しました';
          toast.show(label, 'success');
          onDone();
        }
      } else {
        toast.show(`送信失敗: ${res.message}`, 'error');
      }
    } catch (e) {
      toast.show(`エラー: ${(e as Error).message}`, 'error');
    } finally {
      setResponding(false);
      setConfirmType(null);
    }
  };

  return (
    <div className="border border-purple-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-purple-50 hover:bg-purple-100 transition"
      >
        <div className="flex items-center gap-2 text-left min-w-0">
          <BellPlus className="w-4 h-4 text-purple-600 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{invite.date} {invite.place}</p>
            <p className="text-xs text-purple-600">{invite.timeLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs bg-purple-200 text-purple-700 px-2 py-0.5 rounded-full font-medium">未回答</span>
          {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {open && (
        <div className="px-4 py-3 space-y-3 bg-white">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{invite.place}</span>
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{invite.timeLabel}</span>
          </div>
          {invite.comment && (
            <div className="flex items-start gap-1.5 bg-gray-50 px-3 py-2 rounded-lg text-xs text-gray-600">
              <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-400" />
              {invite.comment}
            </div>
          )}

          {/* ユーザーコメント入力欄 */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">コメント（任意）</label>
            <textarea
              value={userComment}
              onChange={e => setUserComment(e.target.value)}
              placeholder="一言メモを添えることができます…"
              rows={2}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none"
            />
          </div>

          {/* 確認ダイアログ */}
          {confirmType === null ? (
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="success" onClick={() => setConfirmType('accepted')} disabled={responding}>
                <CheckCircle2 className="w-3.5 h-3.5" />出勤する
              </Button>
              <Button size="sm" variant="danger" onClick={() => setConfirmType('rejected')} disabled={responding}>
                <XCircle className="w-3.5 h-3.5" />不可
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setConfirmType('adjusted')} disabled={responding}>
                <Clock className="w-3.5 h-3.5" />調整して出勤
              </Button>
            </div>
          ) : confirmType === 'adjusted' ? (
            <div className="space-y-3 border border-blue-200 rounded-xl p-3 bg-blue-50">
              <p className="text-xs font-semibold text-blue-700">時間を調整して出勤</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">開始</label>
                  <select
                    value={adjStart}
                    onChange={e => setAdjStart(e.target.value)}
                    className="w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    {TIME_OPTIONS.map(t => <option key={t} value={t}>{displayTime(t)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">終了</label>
                  <select
                    value={adjEnd}
                    onChange={e => setAdjEnd(e.target.value)}
                    className="w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    {TIME_OPTIONS.map(t => <option key={t} value={t}>{displayTime(t)}</option>)}
                  </select>
                </div>
              </div>
              {toMinutes(adjStart) >= toMinutes(adjEnd) && (
                <p className="text-xs text-amber-600 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />終了は開始より後にしてください</p>
              )}
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="ghost" onClick={() => setConfirmType(null)} disabled={responding}>戻る</Button>
                <Button
                  size="sm"
                  variant="success"
                  disabled={responding || toMinutes(adjStart) >= toMinutes(adjEnd)}
                  onClick={() => doRespond('adjusted')}
                >
                  {responding ? '送信中…' : '確定する'}
                </Button>
              </div>
            </div>
          ) : (
            <div className={`space-y-2 border rounded-xl p-3 ${confirmType === 'accepted' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
              <p className="text-sm font-semibold text-gray-800">
                {confirmType === 'accepted' ? '出勤しますか？' : '不可として送信しますか？'}
              </p>
              <p className="text-xs text-gray-500">
                {invite.date} {invite.place} {invite.timeLabel}
              </p>
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="ghost" onClick={() => setConfirmType(null)} disabled={responding}>戻る</Button>
                <Button
                  size="sm"
                  variant={confirmType === 'accepted' ? 'success' : 'danger'}
                  disabled={responding}
                  onClick={() => doRespond(confirmType)}
                >
                  {responding ? '送信中…' : confirmType === 'accepted' ? '出勤する' : '不可を送信'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CalendarPage() {
  const { shifts, shiftRequestInvites } = useData();
  const { name: myName } = useAuth();
  const toast = useToast();
  const [selected, setSelected] = useState<string | null>(null);
  const [filterName, setFilterName] = useState<'self' | 'all'>('self');
  const [respondedIds, setRespondedIds] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    if (filterName === 'self' && myName) return shifts.filter((s) => s.memberName === myName);
    return shifts.filter((s) => s.status === 'confirmed');
  }, [shifts, filterName, myName]);

  const selectedShifts = useMemo(
    () => (selected ? filtered.filter((s) => s.date === selected) : []),
    [filtered, selected],
  );

  // 全体表示時: 場所ベースの固定色マップを渡す / 個人表示時: undefined（デフォルト色）
  const memberColors = filterName === 'all' ? PLACE_COLOR_MAP : undefined;

  // 自分宛ての未回答出勤依頼
  const myPendingInvites = useMemo(
    () => shiftRequestInvites.filter(
      inv => inv.memberName === myName && inv.response === 'pending' && !respondedIds.has(inv.id)
    ),
    [shiftRequestInvites, myName, respondedIds],
  );

  return (
    <UserLayout>
      {/* お知らせセクション（出勤依頼） */}
      {myPendingInvites.length > 0 && (
        <Card className="p-4 mb-4 border-purple-200 bg-purple-50">
          <div className="flex items-center gap-2 mb-3">
            <Megaphone className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-semibold text-purple-800">お知らせ</span>
            <span className="text-xs bg-purple-200 text-purple-700 px-2 py-0.5 rounded-full font-medium">
              出勤依頼 {myPendingInvites.length}件
            </span>
          </div>
          <div className="space-y-2">
            {myPendingInvites.map(inv => (
              <InviteNoticeItem
                key={inv.id}
                invite={inv}
                myName={myName ?? ''}
                onDone={() => setRespondedIds(prev => new Set([...prev, inv.id]))}
              />
            ))}
          </div>
        </Card>
      )}

      <div className="mb-4">
        <h1 className="text-lg font-bold text-gray-900">シフトカレンダー</h1>
        <p className="text-sm text-gray-500">
          {filterName === 'self' ? '自分のシフトを表示中' : '全員の確定シフトのみ表示中'}
        </p>
      </div>

      {/* フィルタバー */}
      <div className="flex gap-2 mb-4">
        <Select
          value={filterName}
          onChange={(e) => setFilterName(e.target.value as 'self' | 'all')}
          className="w-auto text-sm"
        >
          <option value="self">自分（{myName ?? '—'}）</option>
          <option value="all">全員</option>
        </Select>
      </div>

      <MonthCalendar shifts={filtered} onSelectDate={setSelected} memberColors={memberColors} />

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? formatDateJP(selected) : ''}
      >
        {selected && <DayShiftList date={selected} shifts={selectedShifts} />}
      </Modal>
    </UserLayout>
  );
}
