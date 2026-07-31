// / ユーザーカレンダー: デフォルトは自分のシフト。プルダウンで全員表示（グラデーション色付き）

import { useMemo, useState } from 'react';
import { UserLayout } from '../components/UserLayout';
import { MonthCalendar, DayShiftList } from '../components/MonthCalendar';
import type { MemberColor } from '../components/MonthCalendar';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { Modal, Select } from '../components/ui';
import { formatDateJP } from '../lib/utils';

function memberColorForIndex(i: number, total: number): MemberColor {
  const hue = Math.round((i * 360) / Math.max(total, 1)) % 360;
  return {
    planBg: `hsl(${hue}, 55%, 88%)`,
    planText: `hsl(${hue}, 60%, 28%)`,
    confirmedBg: `hsl(${hue}, 65%, 50%)`,
    confirmedText: 'white',
    reviewedBg: 'rgb(235, 235, 235)',
    reviewedText: 'rgb(150, 150, 150)',
  };
}

export function CalendarPage() {
  const { shifts, members } = useData();
  const { name: myName } = useAuth();
  const [selected, setSelected] = useState<string | null>(null);
  const [filterName, setFilterName] = useState<'self' | 'all'>('self');

  // メンバーリスト: Firestoreのmembersに加え、shiftsに存在する名前も追加
  const memberNames = useMemo(() => {
    const fromMembers = members.map((m) => m.name);
    const fromShifts = [...new Set(shifts.map((s) => s.memberName))];
    return [...new Set([...fromMembers, ...fromShifts])].sort((a, b) => a.localeCompare(b, 'ja'));
  }, [members, shifts]);

  const filtered = useMemo(() => {
    if (filterName === 'self' && myName) return shifts.filter((s) => s.memberName === myName);
    // 全員表示: 確定シフトのみ（不可・予定・確認済は非表示）
    return shifts.filter((s) => s.status === 'confirmed');
  }, [shifts, filterName, myName]);

  const selectedShifts = useMemo(
    () => (selected ? filtered.filter((s) => s.date === selected) : []),
    [filtered, selected],
  );

  // 全員表示時のみ名前ごとのグラデーション色を生成
  const memberColors = useMemo<Record<string, MemberColor> | undefined>(() => {
    if (filterName !== 'all') return undefined;
    const map: Record<string, MemberColor> = {};
    memberNames.forEach((name, i) => {
      map[name] = memberColorForIndex(i, memberNames.length);
    });
    return map;
  }, [filterName, memberNames]);

  return (
    <UserLayout>
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
