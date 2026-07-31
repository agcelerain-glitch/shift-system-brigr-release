// /board 掲示板: boardPublic を新しい順で一覧表示（読み取り専用）

import { UserLayout } from '../components/UserLayout';
import { useData } from '../contexts/DataContext';
import { Card, EmptyState, Badge } from '../components/ui';
import { MessageSquare, Megaphone } from 'lucide-react';
import { formatDateTimeJP } from '../lib/utils';

export function BoardPage() {
  const { boardPublic } = useData();

  return (
    <UserLayout>
      <div className="mb-4">
        <h1 className="text-lg font-bold text-gray-900">掲示板</h1>
        <p className="text-sm text-gray-500">管理者からのお知らせ</p>
      </div>

      {boardPublic.length === 0 ? (
        <Card className="p-6">
          <EmptyState icon={<Megaphone className="w-10 h-10" />} title="お知らせはまだありません" />
        </Card>
      ) : (
        <div className="space-y-3">
          {boardPublic.map((b) => (
            <Card key={b.id} className="p-5 animate-fadeIn">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center text-brand-600 shrink-0">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="font-semibold text-gray-900">{b.title}</h2>
                    <Badge color="blue">お知らせ</Badge>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{b.body}</p>
                  <p className="text-xs text-gray-400 mt-3">{b.adminName} · {formatDateTimeJP(b.createdAt)}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </UserLayout>
  );
}
