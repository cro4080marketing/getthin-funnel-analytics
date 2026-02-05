"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { cn, formatNumber, formatPercentage } from "@/lib/utils"
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react"

interface StepData {
  stepNumber: number
  stepName: string
  entries: number
  exits: number
  conversionRate: number
  dropOffRate: number
  change?: number // percentage change vs previous period
  avgTimeOnStep?: number // seconds
}

interface StepBreakdownProps {
  steps: StepData[]
  loading?: boolean
}

function getStatusBadge(dropOffRate: number, change?: number) {
  // Critical if drop-off > 40% or significant increase
  if (dropOffRate > 40 || (change && change > 15)) {
    return <Badge variant="critical">Critical</Badge>
  }
  // Warning if drop-off 25-40% or moderate increase
  if (dropOffRate > 25 || (change && change > 10)) {
    return <Badge variant="warning">Warning</Badge>
  }
  // Normal
  return <Badge variant="success">Normal</Badge>
}

function getTrendIndicator(change?: number) {
  if (change === undefined || Math.abs(change) < 0.5) {
    return <Minus className="h-4 w-4 text-gray-400" />
  }
  if (change > 0) {
    return <TrendingUp className="h-4 w-4 text-red-500" />
  }
  return <TrendingDown className="h-4 w-4 text-green-500" />
}

function formatTime(seconds?: number): string {
  if (!seconds) return "-"
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

export function StepBreakdown({ steps, loading }: StepBreakdownProps) {
  if (loading) {
    return (
      <div className="rounded-lg border bg-white p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 w-48 bg-gray-200 rounded" />
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 bg-gray-100 rounded" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-white">
      <div className="p-4 border-b">
        <h3 className="font-semibold text-gray-900">Step-by-Step Breakdown</h3>
        <p className="text-sm text-gray-500 mt-1">
          Performance metrics for each funnel step
        </p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[60px]">Step</TableHead>
            <TableHead>Name</TableHead>
            <TableHead className="text-right">Entries</TableHead>
            <TableHead className="text-right">Exits</TableHead>
            <TableHead className="text-right">Conversion</TableHead>
            <TableHead className="text-right">Drop-off</TableHead>
            <TableHead className="text-right">Trend</TableHead>
            <TableHead className="text-right">Avg Time</TableHead>
            <TableHead className="text-center">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {steps.map((step) => (
            <TableRow
              key={step.stepNumber}
              className={cn(
                step.dropOffRate > 40 && "bg-red-50",
                step.dropOffRate > 25 && step.dropOffRate <= 40 && "bg-yellow-50"
              )}
            >
              <TableCell className="font-medium">{step.stepNumber}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {step.stepName}
                  {step.dropOffRate > 40 && (
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right font-medium">
                {formatNumber(step.entries)}
              </TableCell>
              <TableCell className="text-right text-gray-500">
                {formatNumber(step.exits)}
              </TableCell>
              <TableCell className="text-right font-medium text-green-600">
                {formatPercentage(step.conversionRate)}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right font-medium",
                  step.dropOffRate > 40
                    ? "text-red-600"
                    : step.dropOffRate > 25
                    ? "text-yellow-600"
                    : "text-gray-600"
                )}
              >
                {formatPercentage(step.dropOffRate)}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  {getTrendIndicator(step.change)}
                  {step.change !== undefined && (
                    <span
                      className={cn(
                        "text-sm",
                        step.change > 0 ? "text-red-600" : "text-green-600"
                      )}
                    >
                      {step.change > 0 ? "+" : ""}
                      {formatPercentage(step.change)}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right text-gray-500">
                {formatTime(step.avgTimeOnStep)}
              </TableCell>
              <TableCell className="text-center">
                {getStatusBadge(step.dropOffRate, step.change)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
