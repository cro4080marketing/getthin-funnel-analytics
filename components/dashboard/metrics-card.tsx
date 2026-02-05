"use client"

import { Card, CardContent } from "@/components/ui/card"
import { cn, formatNumber, formatPercentage } from "@/lib/utils"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"

interface MetricsCardProps {
  title: string
  value: string | number
  change?: number
  changeLabel?: string
  format?: "number" | "percentage" | "none"
  icon?: React.ReactNode
  reverseColors?: boolean // For metrics where decrease is good (e.g., drop-off rate)
}

export function MetricsCard({
  title,
  value,
  change,
  changeLabel = "vs previous period",
  format = "number",
  icon,
  reverseColors = false,
}: MetricsCardProps) {
  const formattedValue =
    format === "percentage"
      ? formatPercentage(value as number)
      : format === "number"
      ? formatNumber(value as number)
      : value

  const getTrendIcon = () => {
    if (change === undefined || change === 0) {
      return <Minus className="h-4 w-4 text-gray-400" />
    }
    if (change > 0) {
      return <TrendingUp className={cn("h-4 w-4", reverseColors ? "text-red-500" : "text-green-500")} />
    }
    return <TrendingDown className={cn("h-4 w-4", reverseColors ? "text-green-500" : "text-red-500")} />
  }

  const getTrendColor = () => {
    if (change === undefined || change === 0) return "text-gray-500"
    if (change > 0) return reverseColors ? "text-red-600" : "text-green-600"
    return reverseColors ? "text-green-600" : "text-red-600"
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-500">{title}</p>
          {icon && <div className="text-gray-400">{icon}</div>}
        </div>
        <div className="mt-2">
          <p className="text-3xl font-bold text-gray-900">{formattedValue}</p>
        </div>
        {change !== undefined && (
          <div className="mt-2 flex items-center gap-1">
            {getTrendIcon()}
            <span className={cn("text-sm font-medium", getTrendColor())}>
              {change > 0 ? "+" : ""}
              {formatPercentage(change)}
            </span>
            <span className="text-sm text-gray-500">{changeLabel}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
