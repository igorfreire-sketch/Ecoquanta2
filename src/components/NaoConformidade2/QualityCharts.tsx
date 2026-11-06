import React from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
type DashboardMetricSlice = { name: string; value: number };
const DISTRIBUTION_COLORS = [
  "#F05D28",
  "#334155",
  "#64748B",
  "#0F766E",
  "#D97706",
  "#0284C7",
  "#94A3B8",
];

function compactDistribution(
  data: DashboardMetricSlice[],
  remainderLabel: string,
) {
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
}: {
  title: string;
  subtitle: string;
  data: DashboardMetricSlice[];
  remainderLabel: string;
  emptyMessage: string;
}) {
  const chartData = compactDistribution(data, remainderLabel);
  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <section className="rounded-2xl bg-white p-6 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)]">
      <p className="text-[10px] font-extrabold uppercase tracking-[1.2px] text-[#94A3B8]">
        DISTRIBUIÇÃO
      </p>
      <h2 className="mt-1 text-[18px] font-black text-[#2D2D2D]">{title}</h2>
      <p className="mt-1 text-[11px] font-medium text-[#757575]">{subtitle}</p>

      {chartData.length === 0 ? (
        <div className="mt-5 flex min-h-[260px] items-center justify-center rounded-2xl bg-[#F8FAFC] px-6 text-center text-[13px] font-bold text-[#64748B]">
          {emptyMessage}
        </div>
      ) : (
        <div className="mt-4 grid items-center gap-4 sm:grid-cols-[minmax(220px,0.85fr)_minmax(220px,1.15fr)]">
          <div
            className="relative h-[260px] min-w-0"
            role="img"
            aria-label={`${title}: ${total.toLocaleString("pt-BR")} issues`}
          >
            <ResponsiveContainer
              width="100%"
              height={260}
              initialDimension={{ width: 260, height: 260 }}
            >
              <PieChart>
                <Pie
                  data={chartData}
                  isAnimationActive={false}
                  cx="50%"
                  cy="50%"
                  innerRadius={66}
                  outerRadius={96}
                  paddingAngle={2}
                  cornerRadius={5}
                  dataKey="value"
                  nameKey="name"
                  stroke="#FFFFFF"
                  strokeWidth={3}
                >
                  {chartData.map((item, index) => (
                    <Cell
                      key={item.name}
                      fill={
                        DISTRIBUTION_COLORS[index % DISTRIBUTION_COLORS.length]
                      }
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => [
                    Number(value).toLocaleString("pt-BR"),
                    "Issues",
                  ]}
                  contentStyle={{
                    borderRadius: "12px",
                    border: "1px solid #E5E7EB",
                    boxShadow: "0 14px 30px -20px rgba(15,23,42,0.5)",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <strong className="text-[28px] font-black leading-none text-[#1E293B]">
                {total.toLocaleString("pt-BR")}
              </strong>
              <span className="mt-2 text-[9px] font-extrabold uppercase tracking-[1px] text-[#94A3B8]">
                Issues
              </span>
            </div>
          </div>

          <div className="space-y-2">
            {chartData.map((item, index) => (
              <div
                key={item.name}
                className="grid grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-2 rounded-xl bg-[#F8FAFC] px-3 py-2"
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{
                    backgroundColor:
                      DISTRIBUTION_COLORS[index % DISTRIBUTION_COLORS.length],
                  }}
                />
                <span
                  className="truncate text-[11px] font-bold text-[#475569]"
                  title={item.name}
                >
                  {item.name}
                </span>
                <span className="text-[12px] font-black text-[#1E293B]">
                  {item.value.toLocaleString("pt-BR")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
