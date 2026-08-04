// /manual-user ユーザー操作マニュアル（userログイン時のみ閲覧可）

import type { ReactNode } from 'react';
import { UserLayout } from '../components/UserLayout';
import { Card, Badge } from '../components/ui';
import { CalendarDays, MessageSquare, User, FilePlus, Layers, Ban, Wallet, AlertTriangle, Palette, Bell } from 'lucide-react';
import { useColorTheme, THEMES, THEME_LABELS } from '../hooks/useColorTheme';

type IconType = typeof CalendarDays;

function SectionCard({
  icon: Icon,
  title,
  children,
  accent = 'brand',
}: {
  icon: IconType;
  title: string;
  children: ReactNode;
  accent?: 'brand' | 'rose';
}) {
  const iconCls = accent === 'rose' ? 'bg-rose-100 text-rose-600' : 'bg-brand-100 text-brand-600';
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

export function ManualUserPage() {
  const { theme, cycleTheme } = useColorTheme();
  const nextTheme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];

  return (
    <UserLayout>
      <div className="mb-4">
        <h1 className="text-lg font-bold text-gray-900">ユーザー操作マニュアル</h1>
        <p className="text-sm text-gray-500">使い方のご案内</p>
      </div>
      <div className="space-y-3">

        <SectionCard icon={CalendarDays} title="カレンダー">
          {/* 開発メモ: 全体表示=場所色分け5色 / 個人表示=黄色=plan・緑=confirmed / 取消線グレー=reviewed / グレー=unavailable / 赤丸=today */}
          全メンバーのシフトが<strong>今週・来週の2週間表示</strong>で確認できます。左右の矢印で週を移動し、「今週」ボタンで今日の週に戻れます。
          <ul className="mt-1.5 space-y-0.5 list-disc list-inside text-xs text-gray-500">
            <li>全体表示時：セルの色は<strong>場所ごとの色分け</strong>で表示されます。凡例はカレンダー下に表示</li>
            <li>自分のみ表示時：<strong>黄色</strong>＝予定・<strong>緑</strong>＝確定でステータスが分かります</li>
            <li><strong>赤い丸</strong>＝当日。日付をタップするとその日のシフト詳細が確認できます</li>
          </ul>
        </SectionCard>

        <SectionCard icon={Bell} title="お知らせ（出勤依頼）">
          管理者から<strong>出勤依頼</strong>が届くと、カレンダーの上部に「お知らせ」として表示されます。
          <ol className="mt-1.5 space-y-1 list-decimal list-inside">
            <li>お知らせをタップして内容（日付・時間帯・場所）を確認</li>
            <li>「<strong>出勤する</strong>」「<strong>不可</strong>」「<strong>調整して出勤</strong>」の3択で回答</li>
            <li>コメントを添えて返答することもできます</li>
          </ol>
          <span className="block mt-1 text-xs text-gray-400">
            ※「出勤する」を選ぶと確定シフトとして自動登録されます。複数人への依頼の場合、先に回答した人から埋まっていきます。
          </span>
        </SectionCard>

        <SectionCard icon={MessageSquare} title="掲示板">
          {/* 開発メモ: Firestoreのboard Publicコレクション（adminのみ書込） */}
          管理者からのお知らせを<strong>新しい順</strong>で確認できます。読み取り専用です。
        </SectionCard>

        <SectionCard icon={User} title="自分のシフト">
          自分のシフトのみを<strong>当日 / 予定 / 確定</strong>のタブで切り替え表示します。各シフトには<strong>コピー機能</strong>があり、個人カレンダーへの転記に使えます。
          <ul className="mt-1.5 space-y-0.5 list-disc list-inside text-xs text-gray-500">
            <li>「<strong>件名のみ</strong>」：日付＋件名をコピー</li>
            <li>「<strong>1日分</strong>」：日付＋件名＋時間＋場所をコピー</li>
            <li>予定のシフトは一覧の<strong>取消ボタン</strong>（ゴミ箱）から取り下げ可能</li>
          </ul>
        </SectionCard>

        <SectionCard icon={FilePlus} title="シフト申請">
          3つのモードから選びます：
          <ul className="mt-1.5 space-y-1 list-disc list-inside">
            <li><strong>シフト申請</strong>：テンプレ（A〜D帯）または時間指定で申請。テンプレ選択時に「<strong>時間を調整する</strong>」をタップすると開始・終了時刻を個別に変更できます。「<strong>申請を追加する</strong>」ボタンで複数日をまとめて申請可能</li>
            <li><strong>不可（シフトなし）</strong>：日付を追加して複数日まとめて不可申請</li>
            <li><strong>その他</strong>：給料受取のみの日に申請</li>
          </ul>
          同じ日付に既に申請がある場合は<strong>重複警告</strong>が表示され、二重申請を防ぎます。
        </SectionCard>

        <SectionCard icon={AlertTriangle} title="申請削除依頼" accent="rose">
          管理者に<strong>確定承認された後</strong>のシフトは、そのままでは削除・変更できません。変更が必要な場合は以下の手順で削除依頼を行ってください。
          <ol className="mt-1.5 space-y-1 list-decimal list-inside">
            <li>「自分のシフト」→「<strong>確定</strong>」タブを開く</li>
            <li>該当シフトの「<strong>削除依頼</strong>」ボタンを押す</li>
            <li><strong>2段階の確認</strong>後、管理者へ依頼が送信される</li>
            <li>管理者が削除すると同じ日付に<strong>再申請が可能</strong>になる</li>
          </ol>
          <span className="block mt-1 text-xs text-gray-400">
            ※管理者承認前（予定）のシフトは申請ページから直接取り下げできます（削除依頼は不要）
          </span>
        </SectionCard>

        <SectionCard icon={Layers} title="テンプレ（A帯〜D帯）">
          {/* 開発メモ: TEMPLATE_TIMES = { A:'20:00-LAST', B:'20:30-02:00', C:'21:30-LAST', D:'22:00-02:00' }（config.tsで一元管理） */}
          <ul className="space-y-0.5">
            <li><strong>A帯</strong>：20:00〜LAST（閉店）</li>
            <li><strong>B帯</strong>：20:30〜翌2:00</li>
            <li><strong>C帯</strong>：21:30〜LAST（閉店）</li>
            <li><strong>D帯</strong>：22:00〜翌2:00</li>
          </ul>
          <span className="block mt-1">テンプレを選ぶと時間入力を省略できます。「LAST」は閉店時間を表します。</span>
        </SectionCard>

        <SectionCard icon={Ban} title="不可（シフトなし）の申請">
          出勤できない日がある場合は<strong>不可</strong>を申請してください。<strong>「+日付を追加する」</strong>ボタンで複数日をまとめて指定できます。管理者側でシフト調整の参考にします。
        </SectionCard>

        <SectionCard icon={Wallet} title="その他（給料受取のみ）">
          出勤はしないが<strong>給料を受け取りたい日</strong>がある場合に申請します。日付を選んで送信するだけです。
        </SectionCard>

        <SectionCard icon={Palette} title="表示カラー設定">
          ステータスバッジ（予定・確定）の色を変更できます。色覚特性がある方や視認性を上げたい方にご活用ください。設定はこの端末に保存されます。
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <button
              onClick={cycleTheme}
              aria-label="表示カラーを切り替える"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-brand-300 bg-brand-50 text-brand-700 font-medium text-sm hover:bg-brand-100 active:scale-95 transition-all"
            >
              <Palette className="w-4 h-4" />
              <span>現在: {THEME_LABELS[theme]}</span>
              <span className="text-xs text-brand-400">→ {THEME_LABELS[nextTheme]}</span>
            </button>
            <div className="flex gap-2">
              <Badge color="plan">予定</Badge>
              <Badge color="confirmed">確定</Badge>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            通常 → カラー調整（橙・青系）→ ハイコントラスト → 通常 の順でループします。
          </p>
        </SectionCard>

      </div>
    </UserLayout>
  );
}
