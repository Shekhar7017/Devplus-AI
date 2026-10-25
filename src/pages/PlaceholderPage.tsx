import { Construction } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

interface PlaceholderPageProps {
  title: string;
  milestone: string;
  description: string;
}

export function PlaceholderPage({ title, milestone, description }: PlaceholderPageProps) {
  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-xl font-semibold text-white">{title}</h2>
        <Badge tone="warning">
          <Construction className="w-3 h-3" />
          {milestone}
        </Badge>
      </div>
      <div className="rounded-xl bg-neutral-900/50 border border-neutral-800/60 border-dashed p-12 text-center">
        <div className="w-14 h-14 rounded-2xl bg-neutral-800/80 flex items-center justify-center mx-auto mb-4">
          <Construction className="w-7 h-7 text-neutral-500" />
        </div>
        <h3 className="text-base font-semibold text-white mb-2">Coming in {milestone}</h3>
        <p className="text-sm text-neutral-400 max-w-md mx-auto leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
}
