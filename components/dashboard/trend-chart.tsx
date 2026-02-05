"use client"

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import { format } from "date-fns"
import { formatPercentage } from "@/lib/utils"

interface TrendDataPoint {
  date: string
  conversionRate: number
  dropOffRate?: number
}

interface TrendChartProps {
  data: TrendDataPoint[]
  loading?: boolean
  showDropOff?: boolean
}

export function TrendChart({ data, loading, showDropOff = false }: TrendChartProps) {
  if (loading) {
    return (
      <div className="h-[300px] w-full animate-pulse bg-gray-100 rounded-lg" />
    )
  }

  const formattedData = data.map((point) => ({
    ...point,
    formattedDate: format(new Date(point.date), "MMM d"),
  }))

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-lg border bg-white p-3 shadow-lg">
          <p className="font-medium text-gray-900">{label}</p>
          <div className="mt-2 space-y-1">
            {payload.map((entry: any, index: number) => (
              <p key={index} className="text-sm">
                <span
                  className="inline-block w-3 h-3 rounded-full mr-2"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-gray-500">{entry.name}:</span>{" "}
                <span className="font-medium">{formatPercentage(entry.value)}</span>
              </p>
            ))}
          </div>
        </div>
      )
    }
    return null
  }

  return (
    <div className="rounded-lg border bg-white p-6">
      <div className="mb-4">
        <h3 className="font-semibold text-gray-900">Conversion Trend</h3>
        <p className="text-sm text-gray-500">
          Daily conversion rate over time
        </p>
      </div>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={formattedData}
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="formattedDate"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${value}%`}
              domain={[0, "auto"]}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Line
              type="monotone"
              dataKey="conversionRate"
              name="Conversion Rate"
              stroke="#22c55e"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            {showDropOff && (
              <Line
                type="monotone"
                dataKey="dropOffRate"
                name="Avg Drop-off Rate"
                stroke="#ef4444"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
