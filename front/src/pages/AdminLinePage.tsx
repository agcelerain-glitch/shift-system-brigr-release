// /admin-line LINE操作: グループ送信・自分への連絡・個別チャット・GID管理

import { useState, useEffect, useMemo } from 'react';
import { AdminLayout } from '../components/AdminLayout';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Card, Button, FloatTextarea, Select, Badge, Modal } from '../components/ui';
import { Send, Bell, MessageCircle, Megaphone, Users, Info, Trash2, Wifi, WifiOff, CalendarDays } from 'lucide-react';
import { callLineApi, subscribeLineConfig, deleteGroupId } from '../lib/db';
import { isFirebaseConfigured, API_BASE_URL } from '../lib/firebase';
import { formatDateJP, todayStr } from '../lib/utils';
import { MonthCalendar, DayShiftList } from '../components/MonthCalendar';

export function AdminLinePage() {
  const { members, shifts } = useData();
  const { name: adminName } = useAuth();
  const toast = useToast();
  const [sending, setSending] = useState(false);

  // グループ送信: シフト連絡
  const [shiftMsg, setShiftMsg] = useState('');
  // 当日ポジション配置
  const [positionMsg, setPositionMsg] = useState('');
  // セルフ通知
  const [selfMsg, setSelfMsg] = useState('');
  // 個別チャット
  const [targetMember, setTargetMember] = useState('');
  const [dmMsg, setDmMsg] = useState('');
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
  const lineMembers = members.filter((m) => m.lineUserId);
  const adminMember = members.find((m) => m.name === adminName);
  const adminLineId = adminMember?.lineUserId;

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

  const sendSelf = async () => {
    if (!selfMsg.trim()) return;
    if (!adminLineId) {
      toast.show('あなたのLINE IDが未登録です。LINEで「名前登録 ' + (adminName ?? 'お名前') + '」と送信してください。', 'error');
      return;
    }
    await send('/line/dm', { lineUserId: adminLineId, message: selfMsg }, '自分への連絡', () => setSelfMsg(''));
  };

  const handleDeleteGid = async () => {
    if (!window.confirm(`GID「${groupId}」を削除しますか？\n削除後はグループで「グループ登録」と送信して再登録してください。`)) return;
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

  return (
    <AdminLayout>
      <div className="mb-4">
        <h1 className="text-lg font-bold text-gray-900">LINE操作</h1>
        {/* バックエンドAPI（Heroku）へ送信します */}
      </div>

      {!API_BASE_URL && !isFirebaseConfigured && (
        <Card className="p-3 mb-4 bg-amber-50 border-amber-200">
          <p className="text-xs text-amber-700 flex items-center gap-1.5">
            <Info className="w-4 h-4" />モックモード: VITE_API_BASE_URL未設定のため実際の送信は行わず成功扱い
          </p>
        </Card>
      )}

      {/* 本日のシフト概要（メッセージ作成の参考用） */}
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
            <span className="text-xs font-mono text-gray-500 break-all">
              {groupId === undefined ? '…' : groupId ?? '—'}
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
        {/* グループ送信: シフト連絡 */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center text-green-600">
              <Megaphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">グループ送信① シフト連絡</h2>
              <p className="text-xs text-gray-500">グループへシフト情報を一括送信</p>
            </div>
          </div>
          <FloatTextarea
            label="例: 今週のシフトをお知らせします…"
            rows={4}
            value={shiftMsg}
            onChange={(e) => setShiftMsg(e.target.value)}
            disabled={sending}
          />
          <p className="text-[10px] text-gray-400 mt-1.5">送信失敗時は内容を非公開メモに保存してください</p>
          <div className="mt-2 flex justify-end">
            <Button
              onClick={() => send('/line/group/shift', { message: shiftMsg }, 'シフト連絡', () => setShiftMsg(''))}
              disabled={sending || !shiftMsg.trim() || !groupId}
              title={!groupId ? 'GIDが未登録です' : undefined}
            >
              <Send className="w-4 h-4" />送信
            </Button>
          </div>
        </Card>

        {/* 当日ポジション配置連絡 */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">グループ送信② 当日ポジション配置</h2>
              <p className="text-xs text-gray-500">当日の配置をグループへ連絡</p>
            </div>
          </div>
          <div className="bg-blue-50 rounded-lg p-3 mb-2 text-xs text-gray-600 max-h-32 overflow-y-auto">
            <p className="font-medium text-blue-700 mb-1">本日({formatDateJP(todayStr())})のシフト:</p>
            {todayShifts.length === 0 ? (
              <p>シフトなし</p>
            ) : (
              todayShifts.map((s) => <p key={s.id}>{s.memberName} · {s.subject}</p>)
            )}
          </div>
          <FloatTextarea rows={3} label="例: 本日の配置: レジ=山田さん、品出し=佐藤さん" value={positionMsg} onChange={(e) => setPositionMsg(e.target.value)} disabled={sending} />
          <p className="text-[10px] text-gray-400 mt-1.5">送信失敗時は内容を非公開メモに保存してください</p>
          <div className="mt-2 flex justify-end">
            <Button
              onClick={() => send('/line/group/position', { message: positionMsg, date: todayStr() }, '当日配置', () => setPositionMsg(''))}
              disabled={sending || !positionMsg.trim() || !groupId}
              title={!groupId ? 'GIDが未登録です' : undefined}
            >
              <Send className="w-4 h-4" />送信
            </Button>
          </div>
        </Card>

        {/* セルフ通知 */}
        <Card className="p-5">
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
        <Card className="p-5">
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
      </div>

      {/* [開発者メモ] トークン等の秘匿情報はフロントに置かず、Heroku側のAPIで取り扱います。フロントは fetch でエンドポイントを呼ぶだけです。 */}

      {/* 全体シフトカレンダー */}
      <div className="mt-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <CalendarDays className="w-4 h-4" />全体シフトカレンダー
        </h2>
        {/* カレンダーフィルターボタン（複数選択） */}
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
    </AdminLayout>
  );
}
