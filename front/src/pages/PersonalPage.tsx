// /personal 自分のシフト: name一致のシフトを「予定/確定/当日」で切り替え表示、コピー機能付き

import { useMemo, useState } from 'react';
import { UserLayout } from '../components/UserLayout';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Card, EmptyState, Badge, Button, Tabs, Modal } from '../components/ui';
import { Copy, CalendarDays, CheckCircle2, Clock, Trash2, AlertTriangle } from 'lucide-react';
import { formatDateJP, copyToClipboard, todayStr, weekdayJP } from '../lib/utils';
import { TEMPLATE_LABELS } from '../lib/types';
import type { Shift } from '../lib/types';
import { cancelShift, requestDeleteShift } from '../lib/db';

type Tab = 'today' | 'plan' | 'confirmed';

function ShiftCard({
  shift,
  onCopy,
  onCancel,
  onDeleteRequest,
}: {
  shift: Shift;
  onCopy: (text: string, label: string) => void;
  onCancel?: (shift: Shift) => void;
  onDeleteRequest?: (shift: Shift) => void;
}) {
  const timeLabel =
    shift.timeType === 'template' && shift.template
      ? TEMPLATE_LABELS[shift.template]
      : shift.timeType === 'time'
        ? `${shift.timeStart}〜${shift.timeEnd}`
        : shift.timeType === 'other'
          ? 'その他'
          : '時間指定なし';

  const isDeleteReq = shift.status === 'delete_requested';

  return (
    <Card className={`p-4 ${isDeleteReq ? 'border-rose-200 bg-rose-50/30' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`text-sm font-medium underline underline-offset-2 decoration-1 ${weekdayJP(shift.date) === '日' ? 'text-red-500 decoration-red-300' : weekdayJP(shift.date) === '土' ? 'text-blue-500 decoration-blue-300' : 'text-gray-700 decoration-gray-300'}`}>
              {formatDateJP(shift.date)}
            </span>
            <Badge color={
              isDeleteReq ? 'red' :
              shift.status === 'confirmed' ? 'confirmed' :
              shift.status === 'reviewed' ? 'reviewed' : 'plan'
            }>
              {isDeleteReq ? '削除依頼中' :
               shift.status === 'confirmed' ? '確定' :
               shift.status === 'reviewed' ? '確認済' : '予定'}
            </Badge>
          </div>
          <p className={`font-medium mb-1 ${isDeleteReq ? 'text-rose-700' : 'text-gray-900'}`}>{shift.subject}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{timeLabel}</span>
            {shift.place && <span>場所: {shift.place}</span>}
            {shift.headcount && <span>人数: {shift.headcount}人</span>}
          </div>
          {isDeleteReq && (
            <p className="text-xs text-rose-500 mt-1">管理者の承認を待っています</p>
          )}
        </div>
      </div>
      {!isDeleteReq && (
        <div className="flex gap-2 mt-3 pt-3 border-t border-gray-50">
          <Button size="sm" variant="secondary" onClick={() => onCopy(`${formatDateJP(shift.date)} ${shift.subject}`, '件名のみコピーしました')}>
            <Copy className="w-3.5 h-3.5" />件名のみ
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onCopy(`${formatDateJP(shift.date)} ${shift.subject} ${timeLabel}${shift.place ? ` 場所:${shift.place}` : ''}`, '1日分コピーしました')}>
            <Copy className="w-3.5 h-3.5" />1日分
          </Button>
          {shift.status === 'plan' && onCancel && (
            <Button size="sm" variant="secondary" className="ml-auto text-red-500 hover:bg-red-50" onClick={() => onCancel(shift)} aria-label={`${formatDateJP(shift.date)}の申請を取り消す`}>
              <Trash2 className="w-3.5 h-3.5" />申請取消
            </Button>
          )}
          {shift.status === 'confirmed' && onDeleteRequest && (
            <Button size="sm" variant="secondary" className="ml-auto text-rose-500 hover:bg-rose-50" onClick={() => onDeleteRequest(shift)} aria-label={`${formatDateJP(shift.date)}の削除を管理者に依頼する`}>
              <AlertTriangle className="w-3.5 h-3.5" />削除依頼
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

export function PersonalPage() {
  const { shifts, firestoreError } = useData();
  const { name } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('today');
  const [canceling, setCanceling] = useState<string | null>(null);
  const [deleteReqTarget, setDeleteReqTarget] = useState<Shift | null>(null);
  const [deleteReqStep, setDeleteReqStep] = useState<1 | 2>(1);
  const [submittingDeleteReq, setSubmittingDeleteReq] = useState(false);
  const today = todayStr();

  const handleCancel = async (shift: Shift) => {
    if (!window.confirm(`${formatDateJP(shift.date)} の「${shift.subject}」の申請を取り消しますか？`)) return;
    setCanceling(shift.id);
    try {
      const result = await cancelShift(shift.id, shift.version);
      if (result === 'forbidden') { toast.show('確定済みのシフトは取り消せません', 'error'); return; }
      if (result === 'conflict') { toast.show('データが更新されました。再度お試しください', 'error'); return; }
      toast.show('申請を取り消しました', 'success');
    } catch { toast.show('取り消しに失敗しました', 'error'); }
    finally { setCanceling(null); }
  };

  const openDeleteRequest = (s: Shift) => {
    setDeleteReqTarget(s);
    setDeleteReqStep(1);
  };

  const submitDeleteRequest = async () => {
    if (!deleteReqTarget) return;
    setSubmittingDeleteReq(true);
    try {
      const result = await requestDeleteShift(deleteReqTarget.id, deleteReqTarget.version);
      if (result === 'ok') {
        toast.show('削除依頼を送信しました。管理者の確認をお待ちください。', 'success');
        setDeleteReqTarget(null);
      } else {
        toast.show('データが更新されました。再度お試しください', 'error');
      }
    } catch { toast.show('削除依頼の送信に失敗しました', 'error'); }
    finally { setSubmittingDeleteReq(false); }
  };

  const mine = useMemo(
    () => shifts.filter((s) => s.memberName === name).sort((a, b) => a.date.localeCompare(b.date)),
    [shifts, name],
  );

  const todayList = mine.filter((s) => s.date === today);
  const planList = mine.filter((s) => (s.status === 'plan' || s.status === 'reviewed') && s.date !== today);
  const confirmedList = mine.filter((s) => (s.status === 'confirmed' || s.status === 'delete_requested') && s.date !== today);

  const list = tab === 'today' ? todayList : tab === 'plan' ? planList : confirmedList;

  const handleCopy = async (text: string, label: string) => {
    const ok = await copyToClipboard(text);
    toast.show(ok ? label : 'コピー失敗', ok ? 'success' : 'error');
  };

  return (
    <UserLayout>
      <div className="mb-4">
        <h1 className="text-lg font-bold text-gray-900">{name}さんのシフト</h1>
        <p className="text-sm text-gray-500">個人カレンダーへの転記用にコピーできます</p>
        {firestoreError && (
          <p className="mt-2 text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{firestoreError}</p>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-card border border-gray-100 mb-4">
        <Tabs
          tabs={[
            { id: 'today', label: `当日 (${todayList.length})` },
            { id: 'plan', label: `予定 (${planList.length})` },
            { id: 'confirmed', label: `確定 (${confirmedList.length})` },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      {list.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={tab === 'today' ? <CalendarDays className="w-10 h-10" /> : tab === 'plan' ? <Clock className="w-10 h-10" /> : <CheckCircle2 className="w-10 h-10" />}
            title={tab === 'today' ? '当日のシフトはありません' : tab === 'plan' ? '予定のシフトはありません' : '確定したシフトはありません'}
            hint="シフト申請画面から申請できます"
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {list.map((s) => (
            <ShiftCard
              key={s.id}
              shift={s}
              onCopy={handleCopy}
              onCancel={canceling ? undefined : handleCancel}
              onDeleteRequest={openDeleteRequest}
            />
          ))}
        </div>
      )}

      {/* 削除依頼確認モーダル（2ステップ） */}
      <Modal
        open={deleteReqTarget !== null}
        onClose={() => setDeleteReqTarget(null)}
        title="申請削除依頼"
      >
        {deleteReqTarget && (
          deleteReqStep === 1 ? (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-sm font-medium text-gray-900">{deleteReqTarget.subject}</p>
                <p className="text-sm text-gray-600">{formatDateJP(deleteReqTarget.date)}</p>
              </div>
              <p className="text-sm text-gray-700">このシフトの削除を管理者に依頼しますか？</p>
              <p className="text-xs text-gray-400">削除が承認されると、このシフトは完全に消去されます。削除後は同じ日に再申請できます。</p>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => setDeleteReqTarget(null)}>キャンセル</Button>
                <Button variant="danger" onClick={() => setDeleteReqStep(2)}>削除依頼を出す</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-rose-50 rounded-xl p-4 text-center">
                <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
                <p className="text-sm font-semibold text-rose-700">本当に削除依頼を出しますか？</p>
                <p className="text-xs text-rose-500 mt-1">管理者が承認するとシフト情報が完全に削除されます</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2.5">
                <p className="text-xs text-gray-600">{formatDateJP(deleteReqTarget.date)} · {deleteReqTarget.subject}</p>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => setDeleteReqStep(1)}>戻る</Button>
                <Button variant="danger" onClick={submitDeleteRequest} disabled={submittingDeleteReq}>
                  {submittingDeleteReq ? '送信中…' : '削除依頼を確定する'}
                </Button>
              </div>
            </div>
          )
        )}
      </Modal>
    </UserLayout>
  );
}
