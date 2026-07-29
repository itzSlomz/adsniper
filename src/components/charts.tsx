"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const PLATFORM_COLORS: Record<string, string> = {
  meta: "#1877F2",
  google: "#34A853",
  linkedin: "#0A66C2",
  x: "#111111",
  snapchat: "#E7C500",
  tiktok: "#FE2C55",
  other: "#9CA3AF",
};

export function AdPressureChart({
  data,
}: {
  data: Record<string, string | number>[];
}) {
  const platforms = ["meta", "google", "linkedin", "x", "snapchat", "tiktok", "other"];
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 36)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 8 }}>
        <XAxis type="number" allowDecimals={false} fontSize={11} />
        <YAxis type="category" dataKey="brand" width={110} fontSize={11} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {platforms.map((p) => (
          <Bar key={p} dataKey={p} stackId="ads" fill={PLATFORM_COLORS[p]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SeriesLineChart({
  data,
  series,
  yLabel,
  percent = false,
}: {
  data: Record<string, string | number | null>[];
  series: { key: string; color?: string }[];
  yLabel?: string;
  percent?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ left: 8, right: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" fontSize={10} minTickGap={24} />
        <YAxis
          fontSize={10}
          width={44}
          tickFormatter={(v) => (percent ? `${Math.round(Number(v) * 100)}%` : String(v))}
          label={yLabel ? { value: yLabel, angle: -90, fontSize: 10 } : undefined}
        />
        <Tooltip formatter={(v) => (percent ? `${(Number(v) * 100).toFixed(1)}%` : v)} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {series.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            stroke={s.color ?? ["#C8102E", "#1877F2", "#34A853", "#F59E0B", "#8B5CF6", "#0A66C2", "#111827", "#EC4899", "#14B8A6"][i % 9]}
            dot={false}
            strokeWidth={2}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function StackedBars({
  data,
  xKey,
  bars,
  height = 220,
}: {
  data: Record<string, string | number>[];
  xKey: string;
  bars: { key: string; color: string }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: 8, right: 8 }}>
        <XAxis dataKey={xKey} fontSize={10} interval={0} angle={-20} textAnchor="end" height={50} />
        <YAxis fontSize={10} width={40} allowDecimals={false} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {bars.map((b) => (
          <Bar key={b.key} dataKey={b.key} stackId="s" fill={b.color} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
