import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <div
      className={`rounded-xl bg-neutral-900/50 border border-neutral-800/60 ${className}`}
    >
      {children}
    </div>
  );
}
