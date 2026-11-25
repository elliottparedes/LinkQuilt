"use client";

import dynamic from "next/dynamic";

const ViewsChartInner = dynamic(
  () => import("./views-chart-inner").then((m) => m.ViewsChartInner),
  { ssr: false },
);

interface ChartProps {
  data: Array<{ date: string; views: number; clicks: number }>;
  locale?: string;
}

export function ViewsChart(props: ChartProps) {
  return (
    <div className="relative min-h-50 min-w-0 flex-1">
      <ViewsChartInner {...props} />
    </div>
  );
}
