import React from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
type DashboardMetricSlice = { name: string; value: number };
const DISTRIBUTION_COLORS = [
  '#F05D28',
  '#334155',
  '#64748B',
  '#0F766E',
  '#D97706',
  '#0284C7',
  '#94A3B8',
];

function compactDistribution(data: DashboardMetricSlice[], remainderLabel: string) {
  if (data.length <= 7) return data;
  return [
    ...data.slice(0, 6),
    {
      name: `${remainderLabel} (${data.length - 6})`,
      value: data.slice(6).reduce((sum, item) => sum + item.value, 0),
    },
  ];
}

export function DistributionDonut({
  title,
  subtitle,
  data,
  remainderLabel,
  emptyMessage,
}
