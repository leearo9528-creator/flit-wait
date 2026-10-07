import { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes } from 'react'

export function Page({ children, title, sub, wide }: { children: ReactNode; title?: string; sub?: string; wide?: boolean }) {
  return (
    <div className={`mx-auto min-h-dvh px-4 pb-24 pt-6 ${wide ? 'max-w-5xl' : 'max-w-md'}`}>
      {title && (
        <header className="mb-5">
          {sub && <div className="text-xs font-medium text-gray-500">{sub}</div>}
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        </header>
      )}
      {children}
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200 ${className}`}>{children}</div>
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; size?: 'md' | 'lg' | 'sm'; loading?: boolean }
export function Button({ variant = 'primary', size = 'md', loading, className = '', children, disabled, ...rest }: BtnProps) {
  const v = {
    primary: 'bg-gray-900 text-white hover:bg-gray-800 disabled:bg-gray-300',
    secondary: 'bg-white text-gray-900 ring-1 ring-gray-300 hover:bg-gray-50 disabled:text-gray-400',
    danger: 'bg-red-600 text-white hover:bg-red-500 disabled:bg-red-200',
    ghost: 'bg-transparent text-gray-700 hover:bg-gray-100',
  }[variant]
  const s = { sm: 'h-9 px-3 text-sm', md: 'h-12 px-4 text-base', lg: 'h-14 px-5 text-lg' }[size]
  return (
    <button {...rest} disabled={disabled || loading}
      className={`inline-flex w-full items-center justify-center rounded-xl font-semibold transition active:scale-[0.98] ${v} ${s} ${className}`}>
      {loading ? '처리 중…' : children}
    </button>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-sm font-medium text-gray-700">{label}</div>
      {children}
      {hint && <div className="mt-1 text-xs text-gray-500">{hint}</div>}
    </label>
  )
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`h-12 w-full rounded-xl border border-gray-300 bg-white px-4 text-base outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10 ${props.className ?? ''}`} />
}

export function Stepper({ value, onChange, min = 1, max = 4 }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <div className="flex h-12 items-center justify-between rounded-xl border border-gray-300 bg-white px-2">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} className="h-9 w-12 rounded-lg text-2xl text-gray-700 active:bg-gray-100">−</button>
      <div className="text-lg font-semibold">{value}명</div>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} className="h-9 w-12 rounded-lg text-2xl text-gray-700 active:bg-gray-100">+</button>
    </div>
  )
}

export function Alert({ kind = 'info', children }: { kind?: 'info' | 'error' | 'success' | 'warn'; children: ReactNode }) {
  const c = {
    info: 'bg-blue-50 text-blue-900 ring-blue-200',
    error: 'bg-red-50 text-red-900 ring-red-200',
    success: 'bg-green-50 text-green-900 ring-green-200',
    warn: 'bg-amber-50 text-amber-900 ring-amber-200',
  }[kind]
  return <div className={`rounded-xl px-4 py-3 text-sm ring-1 ${c}`}>{children}</div>
}

export function Badge({ children, tone = 'gray' }: { children: ReactNode; tone?: 'gray' | 'green' | 'amber' | 'red' | 'blue' }) {
  const c = {
    gray: 'bg-gray-100 text-gray-700', green: 'bg-green-100 text-green-800', amber: 'bg-amber-100 text-amber-800',
    red: 'bg-red-100 text-red-800', blue: 'bg-blue-100 text-blue-800',
  }[tone]
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${c}`}>{children}</span>
}

export function Spinner() {
  return <div className="flex justify-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-gray-900" /></div>
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-10 text-center text-sm text-gray-500">{children}</div>
}
