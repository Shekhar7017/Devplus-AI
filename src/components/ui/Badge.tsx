import { ReactNode } from 'react';

type Tone = 'primary' | 'accent' | 'neutral' | 'warning' | 'danger';

interface BadgeProps {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}

const tones: Record<Tone, string> = {
  primary: 'bg-primary-500/10 text-primary-300 border-primary-500/20',
  accent: 'bg-accent-500/10 text-accent-300 border-accent-500/20',
  neutral: 'bg-neutral-800 text-neutral-400 border-neutral-700',
  warning: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
  danger: 'bg-red-500/10 text-red-300 border-red-500/20',
};

export function Badge({ tone = 'neutral', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
