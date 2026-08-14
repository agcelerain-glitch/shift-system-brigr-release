// 2週間カレンダー: 今週+次週のシフトを表示、曜日グリッド日曜始まり
// ナビゲーション: < 今日 > で1週間単位移動、今日ボタンで今日が属する週に戻る
// DayShiftList: 確定>場所>帯>名前でソート表示

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Shift, CalendarEvent } from '../lib/types';
import { TEMPLATE_TIMES } from '../lib/types';
import {
  getTwoWeekGrid, getWeekStart, getWeekLabel, addDays, todayStr, formatDateJP, displayTime,
} from '../lib/utils';
import { PLACE_OPTIONS } from '../lib/config';
import { Badge } from './ui';

function getTimeLabel(s: Shift): string {
  if (s.timeType === 'time' && s.timeStart && s.timeEnd) return `${displayTime(s.timeStart)}〜${displayTime(s.timeEnd)}`;
  if (s.timeType === 'template' && s.template && TEMPLATE_TIMES[s.template]) {
    const t = TEMPLATE_TIMES[s.template];
    return `${t.start}〜${displayTime(t.end)}`;
  }
  return '';
}

function timeSortVal(s: Shift): number {
  if (s.timeType === 'time' && s.timeStart) {
    const [h, m] = s.timeStart.split(':').map(Number);
    const adj = h >= 24 ? h : h < 9 ? h + 24 : h;
    return adj * 100 + m;
  }
  if (s.timeType === 'template' && s.template)
    return ({ A: 2000, B: 2030, C: 2130, D: 2200 } as Record<string, number>)[s.template] ?? 9000;
  return 9999;
}

const STATUS_ORDER: Record<string, number> = { confirmed: 0, delete_requested: 1, reviewed: 2, plan: 3 };
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
  events = [],
}: {
  shifts: Shift[];
  onSelectDate?: (date: string) => void;
  memberColors?: Record<string, MemberColor>;
  events?: CalendarEvent[];
}) {
  const today = todayStr();
  // 今日が属する週の日曜日を初期値にする
  const [weekStart, setWeekStart] = useState(() => getWeekStart(today));

  const week2Start = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const grid = useMemo(() => getTwoWeekGrid(weekStart), [weekStart]);
  const week1 = grid.slice(0, 7);
  const week2 = grid.slice(7, 14);

  const byDate = useMemo(() => {
    const map: Record<string, Shift[]> = {};
    shifts.forEach((s) => { (map[s.date] ??= []).push(s); });
    return map;
  }, [shifts]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    events.forEach((e) => { (map[e.date] ??= []).push(e); });
    return map;
  }, [events]);

  const hasUnavailable = useMemo(() => shifts.some((s) => s.timeType === 'none'), [shifts]);
  const hasPlan      = useMemo(() => shifts.some((s) => s.status === 'plan' && s.timeType !== 'none'), [shifts]);
  const hasReviewed  = useMemo(() => shifts.some((s) => s.status === 'reviewed'), [shifts]);
  const hasEvents    = events.length > 0;

  const moveWeek = (delta: number) => setWeekStart((ws) => addDays(ws, delta * 7));
  const goToday  = () => setWeekStart(getWeekStart(todayStr()));

  const renderCell = (date: string, idx: number) => {
    const d = new Date(date + 'T00:00:00');
    const isToday = date === today;
    const dayShifts = byDate[date] ?? [];
    const dayEvents = eventsByDate[date] ?? [];
    const dow = d.getDay();
    // 月初のみ「8/1」形式、それ以外は日のみ
    const dayLabel = d.getDate() === 1 ? `${d.getMonth() + 1}/${d.getDate()}` : String(d.getDate());

    return (
      <button
        key={date}
        onClick={() => onSelectDate?.(date)}
        className={[
          'min-h-[80px] border-b border-r border-gray-50 p-1.5 text-left align-top transition hover:bg-brand-50/50 bg-white',
          idx === 6 ? 'border-r-0' : '',
          isToday ? 'ring-2 ring-today-ring ring-inset' : '',
        ].filter(Boolean).join(' ')}
      >
        <div className={`text-xs font-medium mb-1 ${
          dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-gray-700'
        }`}>
          {isToday
            ? <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-[10px]">{d.getDate()}</span>
            : dayLabel
          }
        </div>
        <div className="space-y-0.5">
          {dayEvents.map((ev) => (
            <div key={ev.id} className="text-[10px] leading-tight px-1 py-0.5 rounded truncate bg-red-100 text-red-700 font-semibold" title={ev.subject}>
              {ev.subject}
            </div>
          ))}
          {(() => {
            const remaining = 3 - dayEvents.length;
            const sliced = remaining > 0 ? dayShifts.slice(0, remaining) : [];
            const extraCount = dayShifts.length - sliced.length;
            return (
              <>
                {sliced.map((s) => {
                  const isUnavailable = s.timeType === 'none';
                  const { style, cls } = getShiftStyle(s, memberColors?.[s.place ?? '']);
                  const label = isUnavailable ? `${s.memberName.split(' ')[0]} 不可` : s.subject;
                  return (
                    <div key={s.id} className={cls} style={style} title={`${s.memberName} ${s.subject}`}>
                      {label}
                    </div>
                  );
                })}
                {extraCount > 0 && (
                  <div className="text-[10px] text-gray-400 px-1">他{extraCount}件</div>
                )}
              </>
            );
          })()}
        </div>
      </button>
    );
  };

  return (
    <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
      {/* ヘッダー: 「8/2の週 ・ 8/9の週」+ ナビ */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900 text-sm">
          {getWeekLabel(weekStart)} ・ {getWeekLabel(week2Start)}
        </h2>
        <div className="flex items-center gap-1">
          <button onClick={() => moveWeek(-1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={goToday}
            className="px-2 py-1 text-xs text-brand-600 hover:bg-brand-50 rounded-lg font-medium"
          >
            今日
          </button>
          <button onClick={() => moveWeek(1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 曜日ヘッダー */}
      <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50">
        {WEEK.map((w, i) => (
          <div
            key={w}
            className={`text-center py-2 text-xs font-medium ${
              i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-500'
            }`}
          >
            {w}
          </div>
        ))}
      </div>

      {/* 1週目 */}
      <div className="grid grid-cols-7">
        {week1.map((date, idx) => renderCell(date, idx))}
      </div>

      {/* 2週目（週間区切り線あり） */}
      <div className="grid grid-cols-7 border-t border-gray-200">
        {week2.map((date, idx) => renderCell(date, idx))}
      </div>

      {/* 凡例 */}
      <div className="flex items-center gap-3 px-4 py-3 border-t border-gray-100 bg-gray-50 text-xs flex-wrap">
        {memberColors ? (
          // 場所ベース表示時: 場所カラードット
          <>
            {PLACE_OPTIONS.map((place) => memberColors[place] && (
              <span key={place} className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: memberColors[place].confirmedBg }} />
                <span className="text-gray-600">{place}</span>
              </span>
            ))}
            {memberColors[''] && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: memberColors[''].confirmedBg }} />
                <span className="text-gray-500">場所なし</span>
              </span>
            )}
          </>
        ) : (
          // メンバーベース / 個人表示時: ステータスバッジ
          <>
            <span className="flex items-center gap-1.5"><Badge color="confirmed">確定</Badge></span>
            {hasPlan && <span className="flex items-center gap-1.5"><Badge color="plan">予定</Badge></span>}
            {hasReviewed && <span className="flex items-center gap-1.5"><Badge color="reviewed">確認済</Badge></span>}
            {hasUnavailable && (
              <span className="flex items-center gap-1.5">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-400">不可</span>
              </span>
            )}
          </>
        )}
        {hasEvents && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block px-1.5 py-0 rounded text-[10px] font-semibold bg-red-100 text-red-700">行事等</span>
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

// 日付タップ時の詳細リスト: 場所でグループ化し区切り線表示、グループ内は時間>名前順
export function DayShiftList({ date, shifts, events = [] }: { date: string; shifts: Shift[]; events?: CalendarEvent[] }) {
  const placeGroups = useMemo(() => {
    const sorted = [...shifts].sort((a, b) => {
      // 場所未設定（空・undefined）は最下位
      const pa = a.place || '￿';
      const pb = b.place || '￿';
      const pc = pa.localeCompare(pb, 'ja');
      if (pc !== 0) return pc;
      const sa = STATUS_ORDER[a.status] ?? 3;
      const sb = STATUS_ORDER[b.status] ?? 3;
      if (sa !== sb) return sa - sb;
      const td = timeSortVal(a) - timeSortVal(b);
      if (td !== 0) return td;
      return a.memberName.localeCompare(b.memberName, 'ja');
    });
    const groups: { place: string; items: Shift[] }[] = [];
    for (const s of sorted) {
      const place = s.place ?? '';
      const last = groups[groups.length - 1];
      if (last && last.place === place) {
        last.items.push(s);
      } else {
        groups.push({ place, items: [s] });
      }
    }
    return groups;
  }, [shifts]);

  const renderShift = (s: Shift) => {
    const isUnavailable = s.timeType === 'none';
    const timeLabel = getTimeLabel(s);
    return (
      <div key={s.id} className="flex items-start gap-2 p-3 rounded-lg bg-gray-50">
        <Badge color={
          isUnavailable                   ? 'gray'      :
          s.status === 'delete_requested' ? 'red'       :
          s.status === 'confirmed'        ? 'confirmed' :
          s.status === 'reviewed'         ? 'reviewed'  : 'plan'
        }>
          {isUnavailable ? '不可' :
            s.status === 'delete_requested' ? '削除依頼' :
            s.status === 'confirmed'        ? '確定' :
            s.status === 'reviewed'         ? '確認済' : '予定'}
        </Badge>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900">
            {isUnavailable ? s.memberName : s.subject}
          </p>
          {!isUnavailable && timeLabel && (
            <p className="text-xs text-gray-500">{timeLabel}</p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700">{formatDateJP(date)} のシフト</p>
      {events.length > 0 && (
        <div className="space-y-1.5">
          {events.map((ev) => (
            <div key={ev.id} className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-100">
              <Badge color="red">行事等</Badge>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-red-800">{ev.subject}</p>
                {ev.note && <p className="text-xs text-red-500 mt-0.5">{ev.note}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
      {placeGroups.length === 0 && events.length === 0 ? (
        <p className="text-sm text-gray-400">この日のシフトはありません</p>
      ) : placeGroups.length === 0 ? null : (
        placeGroups.map((group) => (
          <div key={group.place}>
            <div className="flex items-center gap-2 my-2">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs font-semibold text-gray-500 px-1 shrink-0">
                {group.place || '場所未設定'}
              </span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>
            <div className="space-y-1.5">
              {group.items.map(renderShift)}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
