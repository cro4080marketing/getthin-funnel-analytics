"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts"
import { formatNumber, formatPercentage } from "@/lib/utils"

interface FunnelStep {
  stepNumber: number
  stepName: string
  entries: number
  conversionRate: number
  dropOffRate: number
}

interface FunnelChartProps {
  steps: FunnelStep[]
  loading?: boolean
}

const COLORS = {
  normal: "#3b82f6", // blue-500
  warning: "#eab308", // yellow-500
  critical: "#ef4444", // red-500
}

function getStepColor(dropOffRate: number): string {
  if (dropOffRate > 40) return COLORS.critical
  if (dropOffRate > 25) return COLORS.warning
  return COLORS.normal
}

export function FunnelChart({ steps, loading }: FunnelChartProps) {
  if (loading) {
    return (
      <div className="h-[400px] w-full animate-pulse bg-gray-100 rounded-lg" />
    )
  }

  const chartData = steps.map((step) => ({
    name: `Step ${step.stepNumber}`,
    fullName: step.stepName,
    entries: step.entries,
    dropOffRate: step.dropOffRate,
    conversionRate: step.conversionRate,
  }))

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="rounded-lg border bg-white p-3 shadow-lg">
          <p className="font-medium text-gray-900">{data.fullName}</p>
          <p className="text-sm text-gray-500">{data.name}</p>
          <div className="mt-2 space-y-1">
            <p className="text-sm">
              <span className="text-gray-500">Entries:</span>{" "}
              <span className="font-medium">{formatNumber(data.entries)}</span>
            </p>
            <p className="text-sm">
              <span className="text-gray-500">Conversion:</span>{" "}
              <span className="font-medium text-green-600">
                {formatPercentage(data.conversionRate)}
              </span>
            </p>
            <p className="text-sm">
              <span className="text-gray-500">Drop-off:</span>{" "}
              <span
                className={`font-medium ${
                  data.dropOffRate > 40
                    ? "text-red-600"
                    : data.dropOffRate > 25
                    ? "text-yellow-600"
                    : "text-gray-600"
                }`}
              >
                {formatPercentage(data.dropOffRate)}
              </span>
            </p>
          </div>
        </div>
      )
    }
    return null
  }

  return (
    <div className="rounded-lg border bg-white p-6">
      <div className="mb-4">
        <h3 className="font-semibold text-gray-900">Funnel Overview</h3>
        <p className="text-sm text-gray-500">
          User flow through each step
        </p>
      </div>
      <div className="h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 20, right: 30, left: 100, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
            <XAxis
              type="number"
              tickFormatter={(value) => formatNumber(value)}
              fontSize={12}
            />
            <YAxis
              type="category"
              dataKey="fullName"
              width={90}
              fontSize={12}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="entries" radius={[0, 4, 4, 0]} maxBarSize={40}>
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={getStepColor(entry.dropOffRate)}
                />
              ))}
              <LabelList
                dataKey="entries"
                position="right"
                formatter={(value) => formatNumber(Number(value))}
                fontSize={12}
                fill="#374151"
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 flex items-center justify-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-blue-500" />
          <span className="text-gray-600">Normal (&lt;25% drop-off)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-yellow-500" />
          <span className="text-gray-600">Warning (25-40%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-red-500" />
          <span className="text-gray-600">Critical (&gt;40%)</span>
        </div>
      </div>
    </div>
  )
}
