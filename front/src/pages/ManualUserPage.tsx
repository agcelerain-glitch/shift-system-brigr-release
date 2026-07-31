// /manual-user ユーザー操作マニュアル（userログイン時のみ閲覧可）

import type { ReactNode } from 'react';
import { UserLayout } from '../components/UserLayout';
import { Card, Badge } from '../components/ui';
import { CalendarDays, MessageSquare, User, FilePlus, Layers, Ban, Wallet, AlertTriangle, Palette } from 'lucide-react';
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
          {/* 開発メモ: 黄色=plan / 緑=confirmed / 取消線グレー=reviewed / グレー=unavailable / 赤丸=today */}
          全メンバーのシフトが<strong>月表示</strong>で重なって表示されます。
          <strong>黄色</strong>＝予定・<strong>緑</strong>＝確定・<strong>赤い丸</strong>＝当日です。
          日付をタップするとその日のシフト詳細が表示されます。
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
            <li><strong>不可（シフトなし）</strong>：選択した週の月〜日をまとめて不可申請</li>
            <li><strong>シフト申請</strong>：テンプレ（A〜D帯）または時間指定で申請</li>
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
          {/* 開発メモ: TEMPLATE_TIMES = { A:'09-13', B:'13-17', C:'17-21', D:'21-25' }（config.tsで一元管理） */}
          <ul className="space-y-0.5">
            <li><strong>A帯</strong>：09:00〜13:00</li>
            <li><strong>B帯</strong>：13:00〜17:00</li>
            <li><strong>C帯</strong>：17:00〜21:00</li>
            <li><strong>D帯</strong>：21:00〜25:00</li>
          </ul>
          <span className="block mt-1">テンプレを選ぶと時間入力を省略できます。</span>
        </SectionCard>

        <SectionCard icon={Ban} title="不可（シフトなし）の申請">
          その週出勤できない場合は<strong>不可</strong>を申請してください。<strong>週単位</strong>（月〜日）でまとめて申請されます。管理者側でシフト調整の参考にします。
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
