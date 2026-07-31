// 月表示カレンダー: 全ユーザーのシフトを重ねて表示、予定/確定/当日/確認済/不可を配色で区別

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Shift } from '../lib/types';
import { TEMPLATE_TIMES } from '../lib/types';
import { getMonthGrid, getMonthLabel, todayStr, formatDateJP } from '../lib/utils';
import { Badge } from './ui';

function getTimeLabel(s: Shift): string {
  if (s.timeType === 'time' && s.timeStart && s.timeEnd) return `${s.timeStart}〜${s.timeEnd}`;
  if (s.timeType === 'template' && s.template && TEMPLATE_TIMES[s.template]) {
    const t = TEMPLATE_TIMES[s.template];
    return `${t.start}〜${t.end}`;
  }
  return '';
}

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

export interface MemberColor {
  planBg: string;
  planText: string;
  confirmedBg: string;
  confirmedText: string;
  reviewedBg: string;
  reviewedText: string;
}

function getShiftStyle(s: Shift, mc: MemberColor | undefined): { style?: React.CSSProperties; cls: string } {
  // 不可（シフトなし）: グレー表示、取り消し線なし
  if (s.timeType === 'none') {
    return { cls: 'text-[10px] leading-tight px-1 py-0.5 rounded truncate bg-gray-100 text-gray-400' };
  }
  if (mc) {
    const bg =
      s.status === 'confirmed' ? mc.confirmedBg :
      s.status === 'reviewed'  ? mc.reviewedBg  : mc.planBg;
    const color =
      s.status === 'confirmed' ? mc.confirmedText :
      s.status === 'reviewed'  ? mc.reviewedText  : mc.planText;
    return { style: { backgroundColor: bg, color }, cls: 'text-[10px] leading-tight px-1 py-0.5 rounded truncate' };
  }
  const cls =
    s.status === 'confirmed'
      ? 'bg-confirmed-soft text-confirmed-strong'
      : s.status === 'reviewed'
        ? 'bg-gray-100 text-gray-400 line-through'
        : 'bg-plan-soft text-plan-strong';
  return { cls: `text-[10px] leading-tight px-1 py-0.5 rounded truncate ${cls}` };
}

export function MonthCalendar({
  shifts,
  onSelectDate,
  memberColors,
}: {
  shifts: Shift[];
  onSelectDate?: (date: string) => void;
  memberColors?: Record<string, MemberColor>;
}) {
  const today = todayStr();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  const grid = useMemo(() => getMonthGrid(cursor.y, cursor.m), [cursor]);
  const byDate = useMemo(() => {
    const map: Record<string, Shift[]> = {};
    shifts.forEach((s) => { (map[s.date] ??= []).push(s); });
    return map;
  }, [shifts]);

  const hasUnavailable = useMemo(() => shifts.some((s) => s.timeType === 'none'), [shifts]);
  const hasPlan      = useMemo(() => shifts.some((s) => s.status === 'plan' && s.timeType !== 'none'), [shifts]);
  const hasReviewed  = useMemo(() => shifts.some((s) => s.status === 'reviewed'), [shifts]);

  const move = (delta: number) => {
    setCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };

  return (
    <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900">{getMonthLabel(cursor.y, cursor.m)}</h2>
        <div className="flex items-center gap-1">
          <button onClick={() => move(-1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => setCursor({ y: new Date().getFullYear(), m: new Date().getMonth() })}
            className="px-2 py-1 text-xs text-brand-600 hover:bg-brand-50 rounded-lg font-medium"
          >
            今日
          </button>
          <button onClick={() => move(1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50">
        {WEEK.map((w, i) => (
          <div key={w} className={`text-center py-2 text-xs font-medium ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-500'}`}>
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {grid.map((date, idx) => {
          const d = new Date(date + 'T00:00:00');
          const inMonth = d.getMonth() === cursor.m;
          const isToday = date === today;
          const dayShifts = byDate[date] ?? [];

          return (
            <button
              key={date}
              onClick={() => onSelectDate?.(date)}
              className={`min-h-[88px] border-b border-r border-gray-50 p-1.5 text-left align-top transition hover:bg-brand-50/50 ${
                idx % 7 === 6 ? 'border-r-0' : ''
              } ${inMonth ? 'bg-white' : 'bg-gray-50/50'} ${isToday ? 'ring-2 ring-today-ring ring-inset' : ''}`}
            >
              <div className={`text-xs font-medium mb-1 ${inMonth ? (d.getDay() === 0 ? 'text-red-500' : d.getDay() === 6 ? 'text-blue-500' : 'text-gray-700') : 'text-gray-300'}`}>
                {isToday && <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-[10px] mr-0.5">{d.getDate()}</span>}
                {!isToday && d.getDate()}
              </div>
              <div className="space-y-0.5">
                {dayShifts.slice(0, 3).map((s) => {
                  const isUnavailable = s.timeType === 'none';
                  const { style, cls } = getShiftStyle(s, memberColors?.[s.memberName]);
                  const label = isUnavailable
                    ? `${s.memberName.split(' ')[0]} 不可`
                    : s.subject;
                  return (
                    <div
                      key={s.id}
                      className={cls}
                      style={style}
                      title={`${s.memberName} ${s.subject}`}
                    >
                      {label}
                    </div>
                  );
                })}
                {dayShifts.length > 3 && <div className="text-[10px] text-gray-400 px-1">他{dayShifts.length - 3}件</div>}
              </div>
              {dayShifts.length === 0 && inMonth && !isToday && (
                <div className="text-[10px] text-gray-200 mt-1">—</div>
              )}
            </button>
          );
        })}
      </div>

      {/* 凡例: 表示されているステータスのみ動的に表示 */}
      <div className="flex items-center gap-3 px-4 py-3 border-t border-gray-100 bg-gray-50 text-xs flex-wrap">
        <span className="flex items-center gap-1.5"><Badge color="confirmed">確定</Badge></span>
        {hasPlan && <span className="flex items-center gap-1.5"><Badge color="plan">予定</Badge></span>}
        {hasReviewed && <span className="flex items-center gap-1.5"><Badge color="reviewed">確認済</Badge></span>}
        {hasUnavailable && (
          <span className="flex items-center gap-1.5">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-400">不可</span>
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full ring-2 ring-today-ring" />
          <span className="text-gray-500">当日</span>
        </span>
      </div>
    </div>
  );
}

// 1日のシフト詳細ドロワー表示用
export function DayShiftList({ date, shifts }: { date: string; shifts: Shift[] }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700">{formatDateJP(date)} のシフト</p>
      {shifts.length === 0 ? (
        <p className="text-sm text-gray-400">この日のシフトはありません</p>
      ) : (
        shifts.map((s) => {
          const isUnavailable = s.timeType === 'none';
          const timeLabel = getTimeLabel(s);
          return (
            <div key={s.id} className="flex items-start gap-2 p-3 rounded-lg bg-gray-50">
              <Badge color={
                isUnavailable ? 'gray' :
                s.status === 'delete_requested' ? 'red' :
                s.status === 'confirmed' ? 'confirmed' :
                s.status === 'reviewed'  ? 'reviewed'  : 'plan'
              }>
                {isUnavailable ? '不可' : s.status === 'delete_requested' ? '削除依頼' : s.status === 'confirmed' ? '確定' : s.status === 'reviewed' ? '確認済' : '予定'}
              </Badge>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">
                  {isUnavailable ? s.memberName : s.subject}
                </p>
                {!isUnavailable && timeLabel && (
                  <p className="text-xs text-gray-500">{timeLabel}</p>
                )}
                {s.place && <p className="text-xs text-gray-500">場所: {s.place}</p>}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
