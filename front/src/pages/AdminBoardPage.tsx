// /admin-board 掲示板管理: boardPrivate（非公開メモ/通知）と boardPublic（全体掲示板）の投稿・削除

import { useState } from 'react';
import { AdminLayout } from '../components/AdminLayout';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Card, Button, Input, Textarea, Select, Badge, EmptyState, Tabs } from '../components/ui';
import { Megaphone, Lock, Trash2, Plus, Bell, FileText } from 'lucide-react';
import { createBoardPublic, deleteBoardPublic, createBoardPrivate, deleteBoardPrivate } from '../lib/db';
import { formatDateTimeJP } from '../lib/utils';

type Tab = 'public' | 'private';

export function AdminBoardPage() {
  const { boardPublic, boardPrivate } = useData();
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

  const removePublic = async (id: string) => {
    try { await deleteBoardPublic(id); toast.show('削除しました', 'info'); }
    catch { toast.show('削除失敗', 'error'); }
  };

  const removePrivate = async (id: string) => {
    try { await deleteBoardPrivate(id); toast.show('削除しました', 'info'); }
    catch { toast.show('削除失敗', 'error'); }
  };

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
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      {tab === 'public' ? (
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
                    <button onClick={() => removePublic(b.id)} className="text-gray-300 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50" title="削除">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
      ) : (
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
                    <button onClick={() => removePrivate(b.id)} className="text-gray-300 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
