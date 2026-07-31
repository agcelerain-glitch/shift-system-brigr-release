// UI基本部品: ボタン・バッジ・入力・カード・モーダル・タブ・空状態

import { useState } from 'react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { X } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

// グラデーション: ボタン上部18%で明→基調色に変化（光が当たっているシェーン効果）
const variantCls: Record<Variant, string> = {
  primary:
    'bg-[linear-gradient(to_bottom,#60a5fa,#2563eb_18%,#2563eb)] text-white shadow-sm ' +
    'hover:bg-[linear-gradient(to_bottom,#93c5fd,#3b82f6_18%,#3b82f6)] hover:shadow-md hover:scale-[1.02] ' +
    'active:scale-[0.97] active:shadow-sm transition-all duration-150',
  secondary:
    'bg-[linear-gradient(to_bottom,#ffffff,#f3f4f6_18%,#f3f4f6)] text-gray-700 border border-gray-200 shadow-sm ' +
    'hover:bg-[linear-gradient(to_bottom,#f9fafb,#e5e7eb_18%,#e5e7eb)] hover:border-gray-300 hover:shadow-md hover:scale-[1.02] ' +
    'active:scale-[0.97] active:shadow-sm transition-all duration-150',
  ghost:
    'text-gray-600 ' +
    'hover:bg-gray-100 hover:text-gray-800 ' +
    'active:scale-[0.97] transition-all duration-150',
  danger:
    'bg-[linear-gradient(to_bottom,#f87171,#dc2626_18%,#dc2626)] text-white shadow-sm ' +
    'hover:bg-[linear-gradient(to_bottom,#fca5a5,#ef4444_18%,#ef4444)] hover:shadow-md hover:scale-[1.02] ' +
    'active:scale-[0.97] active:shadow-sm transition-all duration-150',
  success:
    'bg-[linear-gradient(to_bottom,#4ade80,#16a34a_18%,#16a34a)] text-white shadow-sm ' +
    'hover:bg-[linear-gradient(to_bottom,#86efac,#22c55e_18%,#22c55e)] hover:shadow-md hover:scale-[1.02] ' +
    'active:scale-[0.97] active:shadow-sm transition-all duration-150',
};
const sizeCls: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-lg',
  md: 'px-4 py-2 text-sm rounded-lg',
  lg: 'px-5 py-2.5 text-base rounded-xl',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed ${variantCls[variant]} ${sizeCls[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Badge({ children, color = 'gray', className = '' }: { children: ReactNode; color?: 'gray' | 'plan' | 'confirmed' | 'reviewed' | 'today' | 'blue' | 'red'; className?: string }) {
  const cls = {
    gray: 'bg-gray-100 text-gray-600',
    plan: 'bg-plan-soft text-plan-strong border border-plan-base',
    confirmed: 'bg-confirmed-soft text-confirmed-strong border border-confirmed-base',
    reviewed: 'bg-gray-100 text-gray-400 border border-gray-300',
    today: 'bg-red-50 text-red-600 border border-red-300',
    blue: 'bg-brand-100 text-brand-700',
    red: 'bg-red-100 text-red-700',
  }[color];
  return <span data-badge className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cls} ${className}`}>{children}</span>;
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent transition ${className}`}
      {...props}
    />
  );
}

export function Textarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent transition ${className}`}
      {...props}
    />
  );
}

// フローティングラベル付きテキストエリア: フォーカスまたは入力がある時にラベルが縁上へ移動
export function FloatTextarea({
  label,
  value,
  onChange,
  rows = 4,
  className = '',
  disabled,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  const [focused, setFocused] = useState(false);
  const floating = focused || (typeof value === 'string' && value.length > 0);

  return (
    <div className={`relative ${className}`}>
      <textarea
        value={value}
        onChange={onChange}
        rows={rows}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className={`w-full rounded-lg border px-3 pb-2 pt-6 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent transition ${
          focused ? 'border-brand-400' : 'border-gray-300'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
        {...props}
      />
      <span
        className={`absolute left-3 pointer-events-none transition-all duration-200 z-10 ${
          floating
            ? `top-0 -translate-y-1/2 text-xs font-semibold px-1.5 bg-white ${focused ? 'text-brand-600' : 'text-purple-500'}`
            : 'top-4 text-sm text-gray-400 font-normal'
        }`}
      >
        {label}
      </span>
    </div>
  );
}

export function Select({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent transition ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`bg-white rounded-2xl shadow-card border border-gray-100 ${className}`}>{children}</div>;
}

export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-cardLg w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col animate-pop">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2 bg-gray-50">{footer}</div>}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, active, onChange }: { tabs: { id: T; label: string }[]; active: T; onChange: (id: T) => void }) {
  return (
    <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors relative ${
            active === t.id ? 'text-brand-600' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {t.label}
          {active === t.id && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-600 rounded-full" />}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, hint }: { icon: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="text-gray-300 mb-3">{icon}</div>
      <p className="text-gray-500 font-medium">{title}</p>
 {hint && <p className="text-sm text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}
