import { TrendingUp, TrendingDown, Star, AlertTriangle, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import type { Insight } from '@/lib/insights';
import { Card, CardContent } from '@/components/ui/card';

const ICONS: Record<Insight['type'], typeof TrendingUp> = {
  trend: TrendingUp,
  top_menu: Star,
  bottom_menu: AlertTriangle,
  peak_hour: Clock,
};

const SEVERITY_CLASSES: Record<Insight['severity'], string> = {
  positive: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-800',
  neutral: 'bg-[var(--surface-2)] text-[var(--ink)]',
};

export function InsightCard({ insight }: { insight: Insight }) {
  const Icon = insight.severity === 'warning' && insight.type === 'trend' ? TrendingDown : ICONS[insight.type];
  return (
    <motion.div variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}>
      <Card>
        <CardContent className="flex items-start gap-3 pt-4">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${SEVERITY_CLASSES[insight.severity]}`}>
            <Icon className="h-5 w-5" />
          </div>
          <p className="text-sm text-[var(--ink)]">{insight.message}</p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
