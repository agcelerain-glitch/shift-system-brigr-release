// /manual-admin 管理者操作マニュアル（adminログイン時のみ閲覧可）

import type { ReactNode } from 'react';
import { AdminLayout } from '../components/AdminLayout';
import { Card } from '../components/ui';
import {
  ClipboardList, Send, CheckCircle2, XCircle, Sliders,
  RotateCcw, Users, Lock, Megaphone, Trash2,
} from 'lucide-react';

type IconType = typeof ClipboardList;

function SectionCard({
  icon: Icon,
  title,
  children,
  accent = 'slate',
}: {
  icon: IconType;
  title: string;
  children: ReactNode;
  accent?: 'slate' | 'rose';
}) {
  const iconCls = accent === 'rose' ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-600';
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconCls}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-gray-900 mb-1.5">{title}</h2>
          <div className="text-sm text-gray-600 leading-relaxed">{children}</div>
        </div>
      </div>
    </Card>
  );
}

export function ManualAdminPage() {
  return (
    <AdminLayout>
      <div className="mb-4">
        <h1 className="text-lg font-bold text-gray-900">管理者操作マニュアル</h1>
        <p className="text-sm text-gray-500">管理者機能のご案内</p>
      </div>
      <div className="space-y-3">

        <SectionCard icon={ClipboardList} title="シフト調整ページの使い方">
          {/* 開発メモ: Firestoreのshiftsコレクション。status=plan/confirmed/reviewed/delete_requested */}
          ユーザーの<strong>シフト申請を一覧管理</strong>するメインページです。
          <ul className="mt-1.5 space-y-1 list-disc list-inside">
            <li>上部フィルターで<strong>予定・確定・確認済・不可・削除依頼</strong>を絞り込み（初期表示：予定＋削除依頼）</li>
            <li><strong>日付・曜日・場所・時間・名前・人数</strong>の並び替えタブで切り替え</li>
            <li>キーワード検索（名前・件名・場所に対応）</li>
            <li>ページ上部の<strong>週間サマリー</strong>で今後7日間の人数を一目確認</li>
          </ul>
        </SectionCard>

        <SectionCard icon={CheckCircle2} title="許可操作（予定 → 確定）">
          {/* 開発メモ: runTransaction + version楽観ロックで競合を安全処理 */}
          <strong>予定</strong>のシフトを<strong>確定</strong>に変更します。
          <ol className="mt-1.5 space-y-1 list-decimal list-inside">
            <li>シフトの「<strong>許可</strong>」ボタンを押す</li>
            <li>場所を選択（省略可。後から「再調整」でも変更できます）</li>
            <li>「<strong>確定する</strong>」で完了。ユーザーの確定タブに反映される</li>
          </ol>
          <span className="block mt-1 text-xs text-gray-400">
            ※複数のブラウザで同時に操作すると競合エラーが表示されます。その場合は画面を更新して再操作してください。
          </span>
        </SectionCard>

        <SectionCard icon={XCircle} title="否認操作（予定 → 確認済）">
          予定のシフトを<strong>確認済み</strong>に変更します。削除はされません。
          確認済みのシフトは再度「<strong>許可</strong>」または「<strong>調整</strong>」で確定できます。
          誤って確定した場合は「<strong>復元ログ</strong>」から元の状態に戻してください。
        </SectionCard>

        <SectionCard icon={Sliders} title="調整して確定">
          件名・時間・場所を<strong>上書きしてそのまま確定</strong>できます。
          ユーザーの申請内容を管理者側で修正してから確定する場合に使います。
          <span className="block mt-1 text-xs text-gray-400">
            ※「＋時間を指定する」ボタンで時間フィールドを追加できます
          </span>
        </SectionCard>

        <SectionCard icon={Trash2} title="申請削除依頼の処理" accent="rose">
          {/* 開発メモ: status=delete_requested のシフトをadminがdeleteDoc()でhard delete（再申請可能になる） */}
          ユーザーが確定シフトに削除依頼を出すと、一覧に<strong>「削除依頼」</strong>ラベルで表示されます。初期フィルターに含まれているため、ログイン後すぐに確認できます。
          <ol className="mt-1.5 space-y-1 list-decimal list-inside">
            <li>「<strong>削除依頼</strong>」フィルターで絞り込む（初期表示に含まれています）</li>
            <li>申請内容を確認</li>
            <li>「<strong>削除する</strong>」ボタンを押し、確認ダイアログに同意</li>
            <li>DBから<strong>完全削除</strong>される。ユーザーは同じ日に<strong>再申請可能</strong>になる</li>
          </ol>
          <span className="block mt-1 text-xs text-rose-400 font-medium">
            ⚠️ この操作は取り消せません。削除前に内容を必ず確認してください。
          </span>
        </SectionCard>

        <SectionCard icon={RotateCcw} title="復元（7日以内）">
          {/* 開発メモ: approvalLogsコレクションにbeforeStateスナップショットを保存 */}
          <strong>許可・否認・調整</strong>のたびに変更前の状態が自動で保存されます。
          「<strong>復元ログ</strong>」ボタンから<strong>7日以内</strong>のものは元の状態に戻せます。
          誤操作の保険として活用してください。
        </SectionCard>

        <SectionCard icon={Users} title="名簿">
          {/* 開発メモ: membersコレクション（name/createdAt/updatedAt/lineUserId） */}
          メンバー一覧から個別の<strong>申請履歴</strong>や<strong>LINE連携状況</strong>を確認できます。
          <ul className="mt-1.5 space-y-1 list-disc list-inside">
            <li><strong>LINE済</strong>バッジ：LINEと連携済み。LINEへの直接ジャンプリンクが表示されます</li>
            <li><strong>未登録</strong>：LINEで「<strong>名前登録 お名前</strong>」と送信すると自動連携されます</li>
            <li>名簿からメンバーを<strong>削除</strong>できます（シフトデータは残ります）</li>
          </ul>
        </SectionCard>

        <SectionCard icon={Send} title="LINE操作">
          {/* 開発メモ: Herokuバックエンドへfetch送信。CHANNEL_ACCESS_TOKENはサーバー側で管理（フロントに置かない） */}
          4種類のLINE送信ができます：
          <ul className="mt-1.5 space-y-1 list-disc list-inside">
            <li><strong>グループ送信①</strong>：シフト連絡をグループへ一括送信</li>
            <li><strong>グループ送信②</strong>：当日のポジション配置連絡</li>
            <li><strong>自分への連絡</strong>：管理者自身へのリマインダー送信</li>
            <li><strong>個別チャット</strong>：メンバーを選んで個別送信</li>
          </ul>
          グループ送信はLINEグループに招待後、グループ内で「<strong>グループ登録</strong>」と送信するとIDが自動登録されます。送信失敗時はメッセージ内容を<strong>非公開メモ</strong>に保存してください。
        </SectionCard>

        <SectionCard icon={Megaphone} title="全体掲示板">
          {/* 開発メモ: boardPublicコレクション。userは読取のみ、adminは書込/削除可 */}
          全ユーザー向けのお知らせを<strong>投稿・削除</strong>できます。投稿はユーザーの掲示板ページにリアルタイムで反映されます。「本日は給料日です」「シフト変更のお知らせ」などに活用してください。
        </SectionCard>

        <SectionCard icon={Lock} title="非公開メモ">
          {/* 開発メモ: boardPrivateコレクション。adminのみread/write */}
          <strong>管理者のみ</strong>が閲覧できるメモエリアです。「シフト送信済み」などの業務記録や、ユーザーに見せない連絡メモとして活用できます。<strong>通知</strong>と<strong>メモ</strong>の2種類を投稿できます。
        </SectionCard>

      </div>
    </AdminLayout>
  );
}
