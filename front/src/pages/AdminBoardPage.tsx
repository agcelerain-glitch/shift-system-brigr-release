// /admin-board 掲示板管理: 全体掲示板・非公開メモ・削除済タブ
// 削除はソフトデリート（boardPublicDeleted / boardPrivateDeleted に移動）
// 削除済タブから復元（createdAt=復元時刻）または完全削除（2重確認）が可能

import { useState } from 'react';
import { AdminLayout } from '../components/AdminLayout';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Card, Button, Input, Textarea, Select, Badge, EmptyState, Tabs } from '../components/ui';
import { Megaphone, Lock, Trash2, Plus, Bell, FileText, RotateCcw, AlertTriangle } from 'lucide-react';
import {
  createBoardPublic, deleteBoardPublic, createBoardPrivate, deleteBoardPrivate,
  restoreBoardPublic, restoreBoardPrivate, permanentDeleteBoardPublic, permanentDeleteBoardPrivate,
} from '../lib/db';
import { formatDateTimeJP } from '../lib/utils';
import type { BoardPublic, BoardPrivate, DeletedBoardPublic, DeletedBoardPrivate } from '../lib/types';

type Tab = 'public' | 'private' | 'deleted';

export function AdminBoardPage() {
  const { boardPublic, boardPrivate, boardPublicDeleted, boardPrivateDeleted } = useData();
  const { name } = useAuth();
  const adminName = name ?? '管理者';
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('public');

  // public form
  const [pTitle, setPTitle] = useState('');
  const [pBody, setPBody] = useState('');
  // private form
  const [prBody, setPrBody] = useState('');
  const [prType, setPrType] = useState<'memo' | 'notification'>('memo');
  // 完全削除の2重確認用: id を保持
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const submitPublic = async () => {
    if (!pTitle.trim() || !pBody.trim()) { toast.show('タイトル・本文を入力してください', 'error'); return; }
    try {
      await createBoardPublic(pTitle.trim(), pBody.trim(), adminName);
      toast.show('全体掲示板に投稿しました', 'success');
      setPTitle(''); setPBody('');
    } catch { toast.show('投稿に失敗しました', 'error'); }
  };

  const submitPrivate = async () => {
    if (!prBody.trim()) { toast.show('本文を入力してください', 'error'); return; }
    try {
      await createBoardPrivate(prBody.trim(), prType, adminName);
      toast.show(prType === 'memo' ? 'メモを保存しました' : '通知を記録しました', 'success');
      setPrBody('');
    } catch { toast.show('保存に失敗しました', 'error'); }
  };

  // ソフトデリート（削除済タブへ移動）
  const removePublic = async (item: BoardPublic) => {
    try { await deleteBoardPublic(item); toast.show('削除しました（削除済タブで復元できます）', 'info'); }
    catch { toast.show('削除失敗', 'error'); }
  };
  const removePrivate = async (item: BoardPrivate) => {
    try { await deleteBoardPrivate(item); toast.show('削除しました（削除済タブで復元できます）', 'info'); }
    catch { toast.show('削除失敗', 'error'); }
  };

  // 復元
  const handleRestorePublic = async (item: DeletedBoardPublic) => {
    try { await restoreBoardPublic(item); toast.show('全体掲示板に復元しました', 'success'); }
    catch { toast.show('復元失敗', 'error'); }
  };
  const handleRestorePrivate = async (item: DeletedBoardPrivate) => {
    try { await restoreBoardPrivate(item); toast.show('非公開メモに復元しました', 'success'); }
    catch { toast.show('復元失敗', 'error'); }
  };

  // 完全削除: 2重確認（1回目でidをセット → 同じボタンが「本当に削除」に変わる）
  const handlePermanentDelete = async (id: string, type: 'public' | 'private') => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    try {
      if (type === 'public') await permanentDeleteBoardPublic(id);
      else await permanentDeleteBoardPrivate(id);
      toast.show('完全削除しました', 'info');
      setConfirmDeleteId(null);
    } catch { toast.show('削除失敗', 'error'); }
  };

  const deletedCount = boardPublicDeleted.length + boardPrivateDeleted.length;

  return (
    <AdminLayout>
      <div className="mb-4">
        <h1 className="text-lg font-bold text-gray-900">掲示板管理</h1>
        <p className="text-sm text-gray-500">全体掲示板と非公開メモを管理します</p>
      </div>

      <div className="bg-white rounded-2xl shadow-card border border-gray-100 mb-4">
        <Tabs
          tabs={[
            { id: 'public', label: '全体掲示板' },
            { id: 'private', label: '非公開メモ' },
            { id: 'deleted', label: `削除済${deletedCount > 0 ? `（${deletedCount}）` : ''}` },
          ]}
          active={tab}
          onChange={(id) => { setTab(id); setConfirmDeleteId(null); }}
        />
      </div>

      {/* ===== 全体掲示板タブ ===== */}
      {tab === 'public' && (
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Megaphone className="w-5 h-5 text-brand-600" />
              <h2 className="font-semibold text-gray-900">全体掲示板に投稿</h2>
            </div>
            <div className="space-y-3">
              <Input value={pTitle} onChange={(e) => setPTitle(e.target.value)} placeholder="タイトル (例: 本日は給料日です)" />
              <Textarea rows={3} value={pBody} onChange={(e) => setPBody(e.target.value)} placeholder="本文…" />
              <div className="flex justify-end">
                <Button onClick={submitPublic}><Plus className="w-4 h-4" />投稿</Button>
              </div>
            </div>
          </Card>

          <div className="space-y-2">
            {boardPublic.length === 0 ? (
              <Card className="p-6"><EmptyState icon={<Megaphone className="w-10 h-10" />} title="投稿はありません" /></Card>
            ) : (
              boardPublic.map((b) => (
                <Card key={b.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900">{b.title}</h3>
                        <Badge color="blue">公開</Badge>
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{b.body}</p>
                      <p className="text-xs text-gray-400 mt-2">{b.adminName} · {formatDateTimeJP(b.createdAt)}</p>
                    </div>
                    <button onClick={() => removePublic(b)} className="text-gray-300 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition" title="削除（復元可能）">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
      )}

      {/* ===== 非公開メモタブ ===== */}
      {tab === 'private' && (
        <div className="space-y-4">
          <Card className="p-5 border-slate-200">
            <div className="flex items-center gap-2 mb-3">
              <Lock className="w-5 h-5 text-slate-600" />
              <h2 className="font-semibold text-gray-900">非公開メモ・通知</h2>
              <Badge color="gray">adminのみ</Badge>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">種別</label>
                <Select value={prType} onChange={(e) => setPrType(e.target.value as 'memo' | 'notification')}>
                  <option value="memo">メモ</option>
                  <option value="notification">通知（例: シフト送信済み）</option>
                </Select>
              </div>
              <Textarea rows={3} value={prBody} onChange={(e) => setPrBody(e.target.value)} placeholder="例: 山田さんは来週連休申請の可能性あり" />
              <div className="flex justify-end">
                <Button onClick={submitPrivate}><Plus className="w-4 h-4" />保存</Button>
              </div>
            </div>
          </Card>

          <div className="space-y-2">
            {boardPrivate.length === 0 ? (
              <Card className="p-6"><EmptyState icon={<Lock className="w-10 h-10" />} title="メモはありません" /></Card>
            ) : (
              boardPrivate.map((b) => (
                <Card key={b.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {b.type === 'memo' ? <FileText className="w-4 h-4 text-slate-400" /> : <Bell className="w-4 h-4 text-amber-500" />}
                        <Badge color={b.type === 'memo' ? 'gray' : 'blue'}>{b.type === 'memo' ? 'メモ' : '通知'}</Badge>
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{b.body}</p>
                      <p className="text-xs text-gray-400 mt-2">{b.adminName} · {formatDateTimeJP(b.createdAt)}</p>
                    </div>
                    <button onClick={() => removePrivate(b)} className="text-gray-300 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
      )}

      {/* ===== 削除済タブ ===== */}
      {tab === 'deleted' && (
        <div className="space-y-4">
          {deletedCount === 0 ? (
            <Card className="p-6"><EmptyState icon={<Trash2 className="w-10 h-10" />} title="削除済みの投稿はありません" /></Card>
          ) : (
            <>
              {/* 全体掲示板（削除済） */}
              {boardPublicDeleted.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1 px-1">
                    <Megaphone className="w-3.5 h-3.5" />全体掲示板（削除済）
                  </p>
                  <div className="space-y-2">
                    {boardPublicDeleted.map((b) => (
                      <Card key={b.id} className="p-4 border-dashed border-gray-300 bg-gray-50/50">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold text-gray-700">{b.title}</h3>
                              <Badge color="gray">削除済</Badge>
                            </div>
                            <p className="text-sm text-gray-500 whitespace-pre-wrap">{b.body}</p>
                            <p className="text-xs text-gray-400 mt-2">
                              {b.adminName} · 投稿: {formatDateTimeJP(b.createdAt)} · 削除: {formatDateTimeJP(b.deletedAt)}
                            </p>
                          </div>
                          <div className="flex flex-col gap-1.5 shrink-0">
                            <Button size="sm" variant="secondary" onClick={() => handleRestorePublic(b)}>
                              <RotateCcw className="w-3.5 h-3.5" />復元
                            </Button>
                            {confirmDeleteId === b.id ? (
                              <div className="flex flex-col gap-1">
                                <Button size="sm" variant="danger" onClick={() => handlePermanentDelete(b.id, 'public')}>
                                  <AlertTriangle className="w-3.5 h-3.5" />本当に削除
                                </Button>
                                <button
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="text-xs text-gray-400 hover:text-gray-600 text-center py-0.5"
                                >
                                  キャンセル
                                </button>
                              </div>
                            ) : (
                              <Button size="sm" variant="danger" onClick={() => handlePermanentDelete(b.id, 'public')}>
                                <Trash2 className="w-3.5 h-3.5" />完全削除
                              </Button>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* 非公開メモ（削除済） */}
              {boardPrivateDeleted.length > 0 && (
                <div>
                  {boardPublicDeleted.length > 0 && <div className="border-t border-gray-200 my-1" />}
                  <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1 px-1">
                    <Lock className="w-3.5 h-3.5" />非公開メモ（削除済）
                  </p>
                  <div className="space-y-2">
                    {boardPrivateDeleted.map((b) => (
                      <Card key={b.id} className="p-4 border-dashed border-gray-300 bg-gray-50/50">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {b.type === 'memo' ? <FileText className="w-4 h-4 text-slate-300" /> : <Bell className="w-4 h-4 text-amber-300" />}
                              <Badge color="gray">{b.type === 'memo' ? 'メモ（削除済）' : '通知（削除済）'}</Badge>
                            </div>
                            <p className="text-sm text-gray-500 whitespace-pre-wrap">{b.body}</p>
                            <p className="text-xs text-gray-400 mt-2">
                              {b.adminName} · 投稿: {formatDateTimeJP(b.createdAt)} · 削除: {formatDateTimeJP(b.deletedAt)}
                            </p>
                          </div>
                          <div className="flex flex-col gap-1.5 shrink-0">
                            <Button size="sm" variant="secondary" onClick={() => handleRestorePrivate(b)}>
                              <RotateCcw className="w-3.5 h-3.5" />復元
                            </Button>
                            {confirmDeleteId === b.id ? (
                              <div className="flex flex-col gap-1">
                                <Button size="sm" variant="danger" onClick={() => handlePermanentDelete(b.id, 'private')}>
                                  <AlertTriangle className="w-3.5 h-3.5" />本当に削除
                                </Button>
                                <button
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="text-xs text-gray-400 hover:text-gray-600 text-center py-0.5"
                                >
                                  キャンセル
                                </button>
                              </div>
                            ) : (
                              <Button size="sm" variant="danger" onClick={() => handlePermanentDelete(b.id, 'private')}>
                                <Trash2 className="w-3.5 h-3.5" />完全削除
                              </Button>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          <p className="text-xs text-gray-400 text-center px-2">
            復元すると投稿時刻は復元した時刻として記録されます。完全削除は取り消せません。
          </p>
        </div>
      )}
    </AdminLayout>
  );
}
