"use client"

import { useState } from "react"
import { format, subDays, startOfDay, endOfDay } from "date-fns"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Calendar, ChevronDown } from "lucide-react"

export interface DateRange {
  startDate: Date
  endDate: Date
  label: string
}

const presetRanges: { label: string; getValue: () => DateRange }[] = [
  {
    label: "Today",
    getValue: () => ({
      startDate: startOfDay(new Date()),
      endDate: endOfDay(new Date()),
      label: "Today",
    }),
  },
  {
    label: "Yesterday",
    getValue: () => ({
      startDate: startOfDay(subDays(new Date(), 1)),
      endDate: endOfDay(subDays(new Date(), 1)),
      label: "Yesterday",
    }),
  },
  {
    label: "Last 7 Days",
    getValue: () => ({
      startDate: startOfDay(subDays(new Date(), 7)),
      endDate: endOfDay(new Date()),
      label: "Last 7 Days",
    }),
  },
  {
    label: "Last 30 Days",
    getValue: () => ({
      startDate: startOfDay(subDays(new Date(), 30)),
      endDate: endOfDay(new Date()),
      label: "Last 30 Days",
    }),
  },
  {
    label: "Last 90 Days",
    getValue: () => ({
      startDate: startOfDay(subDays(new Date(), 90)),
      endDate: endOfDay(new Date()),
      label: "Last 90 Days",
    }),
  },
]

interface DateRangePickerProps {
  value: DateRange
  onChange: (range: DateRange) => void
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="relative">
      <Button
        variant="outline"
        onClick={() => setIsOpen(!isOpen)}
        className="w-[240px] justify-between"
      >
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          <span>{value.label}</span>
        </div>
        <ChevronDown className="h-4 w-4 opacity-50" />
      </Button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 top-full z-20 mt-2 w-[240px] rounded-md border bg-white p-2 shadow-lg">
            <div className="space-y-1">
              {presetRanges.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => {
                    onChange(preset.getValue())
                    setIsOpen(false)
                  }}
                  className={cn(
                    "w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-gray-100",
                    value.label === preset.label && "bg-gray-100 font-medium"
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="mt-2 border-t pt-2">
              <p className="px-3 py-1 text-xs text-gray-500">
                {format(value.startDate, "MMM d, yyyy")} -{" "}
                {format(value.endDate, "MMM d, yyyy")}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
