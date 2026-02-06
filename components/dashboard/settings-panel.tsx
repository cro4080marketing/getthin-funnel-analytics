"use client"

import { useState } from "react"
import { GripVertical, Pencil, Trash2, Plus, Star, Bell, Palette, RefreshCw, CheckCircle, AlertCircle, X, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface CustomConversion {
  id: string
  name: string
  stepKey: string
  stepName: string
}

interface SettingsPanelProps {
  customConversions: CustomConversion[]
  starredSteps: string[]
  alertThresholds: {
    dropOffWarning: number
    dropOffCritical: number
    volumeAlert: number
    conversionAlert: number
  }
  availableSteps: Array<{ stepKey: string; stepName: string; stepNumber: number }>
  onAddConversion?: (conv: Omit<CustomConversion, 'id'>) => void
  onEditConversion?: (id: string, conv: Omit<CustomConversion, 'id'>) => void
  onRemoveConversion?: (id: string) => void
  onUpdateThresholds?: (thresholds: any) => void
  onToggleStarredStep?: (stepKey: string) => void
  onSyncComplete?: () => void
  className?: string
}

export function SettingsPanel({
  customConversions,
  starredSteps,
  alertThresholds,
  availableSteps,
  onAddConversion,
  onEditConversion,
  onRemoveConversion,
  onUpdateThresholds,
  onToggleStarredStep,
  onSyncComplete,
  className,
}: SettingsPanelProps) {
  const [editingThresholds, setEditingThresholds] = useState(false)
  const [thresholds, setThresholds] = useState(alertThresholds)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null)

  // Inline form state for add/edit
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formName, setFormName] = useState("")
  const [formStepKey, setFormStepKey] = useState("")

  const resetForm = () => {
    setShowForm(false)
    setEditingId(null)
    setFormName("")
    setFormStepKey("")
  }

  const startAdd = () => {
    setEditingId(null)
    setFormName("")
    setFormStepKey(availableSteps[0]?.stepKey || "")
    setShowForm(true)
  }

  const startEdit = (conv: CustomConversion) => {
    setEditingId(conv.id)
    setFormName(conv.name)
    setFormStepKey(conv.stepKey)
    setShowForm(true)
  }

  const saveForm = () => {
    if (!formName.trim() || !formStepKey) return
    const step = availableSteps.find(s => s.stepKey === formStepKey)
    if (!step) return

    if (editingId) {
      onEditConversion?.(editingId, {
        name: formName.trim(),
        stepKey: formStepKey,
        stepName: step.stepName,
      })
    } else {
      onAddConversion?.({
        name: formName.trim(),
        stepKey: formStepKey,
        stepName: step.stepName,
      })
    }
    resetForm()
  }

  return (
    <div className={cn("space-y-8", className)}>
      {/* Custom Conversions Section */}
      <section className="rounded-lg border bg-white">
        <div className="p-4 border-b bg-gray-50">
          <div className="flex items-center gap-2">
            <Star className="h-5 w-5 text-violet-600" />
            <h3 className="font-semibold text-gray-900">Custom Conversions</h3>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            These metrics appear on your Overview dashboard
          </p>
        </div>

        <div className="p-4 space-y-2">
          {customConversions.length === 0 && !showForm ? (
            <p className="text-sm text-gray-500 text-center py-4">
              No custom conversions configured
            </p>
          ) : (
            customConversions.map((conv) => (
              editingId === conv.id && showForm ? (
                <div key={conv.id} className="p-3 rounded-lg border-2 border-violet-200 bg-violet-50 space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                    <input
                      type="text"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="e.g. Lead Capture"
                      className="w-full px-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Step</label>
                    <select
                      value={formStepKey}
                      onChange={(e) => setFormStepKey(e.target.value)}
                      className="w-full px-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                    >
                      {availableSteps.map((step) => (
                        <option key={step.stepKey} value={step.stepKey}>
                          {step.stepNumber}. {step.stepName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={resetForm}>
                      <X className="h-3.5 w-3.5 mr-1" /> Cancel
                    </Button>
                    <Button size="sm" onClick={saveForm} disabled={!formName.trim()} className="bg-violet-600 hover:bg-violet-700">
                      <Check className="h-3.5 w-3.5 mr-1" /> Save
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  key={conv.id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <GripVertical className="h-4 w-4 text-gray-400 cursor-grab" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{conv.name}</p>
                    <p className="text-sm text-gray-500 truncate">Step: {conv.stepName}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(conv)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                      onClick={() => onRemoveConversion?.(conv.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )
            ))
          )}

          {/* Inline add form */}
          {showForm && !editingId && (
            <div className="p-3 rounded-lg border-2 border-violet-200 bg-violet-50 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Lead Capture"
                  className="w-full px-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Step</label>
                <select
                  value={formStepKey}
                  onChange={(e) => setFormStepKey(e.target.value)}
                  className="w-full px-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  {availableSteps.map((step) => (
                    <option key={step.stepKey} value={step.stepKey}>
                      {step.stepNumber}. {step.stepName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={resetForm}>
                  <X className="h-3.5 w-3.5 mr-1" /> Cancel
                </Button>
                <Button size="sm" onClick={saveForm} disabled={!formName.trim()} className="bg-violet-600 hover:bg-violet-700">
                  <Check className="h-3.5 w-3.5 mr-1" /> Add
                </Button>
              </div>
            </div>
          )}

          {!showForm && (
            <Button
              variant="outline"
              className="w-full mt-4"
              onClick={startAdd}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Custom Conversion
            </Button>
          )}
        </div>
      </section>

      {/* Starred Steps Section */}
      <section className="rounded-lg border bg-white">
        <div className="p-4 border-b bg-gray-50">
          <div className="flex items-center gap-2">
            <Star className="h-5 w-5 text-amber-500" />
            <h3 className="font-semibold text-gray-900">Starred Steps</h3>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Filter the Funnel view to show only these steps
          </p>
        </div>

        <div className="p-4">
          <div className="flex flex-wrap gap-2">
            {availableSteps.map((step) => {
              const isStarred = starredSteps.includes(step.stepKey)
              return (
                <button
                  key={step.stepKey}
                  onClick={() => onToggleStarredStep?.(step.stepKey)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors",
                    isStarred
                      ? "bg-amber-50 border-amber-200 text-amber-700"
                      : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                  )}
                >
                  <Star className={cn("h-3 w-3", isStarred && "fill-current")} />
                  <span className="max-w-[150px] truncate">{step.stepName}</span>
                </button>
              )
            })}
          </div>
          {starredSteps.length > 0 && (
            <p className="text-sm text-gray-500 mt-4">
              {starredSteps.length} steps starred
            </p>
          )}
        </div>
      </section>

      {/* Alert Thresholds Section */}
      <section className="rounded-lg border bg-white">
        <div className="p-4 border-b bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-violet-600" />
              <h3 className="font-semibold text-gray-900">Alert Thresholds</h3>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditingThresholds(!editingThresholds)}
            >
              {editingThresholds ? "Cancel" : "Edit"}
            </Button>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Configure when alerts are triggered
          </p>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Drop-off Warning
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={thresholds.dropOffWarning}
                  onChange={(e) =>
                    setThresholds({ ...thresholds, dropOffWarning: Number(e.target.value) })
                  }
                  disabled={!editingThresholds}
                  className={cn(
                    "w-20 px-3 py-2 text-sm border rounded-lg",
                    editingThresholds ? "bg-white" : "bg-gray-50"
                  )}
                />
                <span className="text-sm text-gray-500">%</span>
                <Badge variant="warning" className="ml-auto">Warning</Badge>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Drop-off Critical
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={thresholds.dropOffCritical}
                  onChange={(e) =>
                    setThresholds({ ...thresholds, dropOffCritical: Number(e.target.value) })
                  }
                  disabled={!editingThresholds}
                  className={cn(
                    "w-20 px-3 py-2 text-sm border rounded-lg",
                    editingThresholds ? "bg-white" : "bg-gray-50"
                  )}
                />
                <span className="text-sm text-gray-500">%</span>
                <Badge variant="critical" className="ml-auto">Critical</Badge>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Volume Alert (below)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={thresholds.volumeAlert}
                  onChange={(e) =>
                    setThresholds({ ...thresholds, volumeAlert: Number(e.target.value) })
                  }
                  disabled={!editingThresholds}
                  className={cn(
                    "w-20 px-3 py-2 text-sm border rounded-lg",
                    editingThresholds ? "bg-white" : "bg-gray-50"
                  )}
                />
                <span className="text-sm text-gray-500">daily starts</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Conversion Alert (below)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={thresholds.conversionAlert}
                  onChange={(e) =>
                    setThresholds({ ...thresholds, conversionAlert: Number(e.target.value) })
                  }
                  disabled={!editingThresholds}
                  className={cn(
                    "w-20 px-3 py-2 text-sm border rounded-lg",
                    editingThresholds ? "bg-white" : "bg-gray-50"
                  )}
                />
                <span className="text-sm text-gray-500">% completion</span>
              </div>
            </div>
          </div>

          {editingThresholds && (
            <div className="flex justify-end pt-2">
              <Button
                onClick={() => {
                  onUpdateThresholds?.(thresholds)
                  setEditingThresholds(false)
                }}
                className="bg-violet-600 hover:bg-violet-700"
              >
                Save Changes
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* Data Sync Section */}
      <section className="rounded-lg border bg-white">
        <div className="p-4 border-b bg-gray-50">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-violet-600" />
            <h3 className="font-semibold text-gray-900">Data Sync</h3>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Re-sync data from Embeddables API
          </p>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-sm text-gray-600">
            Trigger a full re-sync to fetch the latest data from Embeddables. This clears stale analytics and repopulates with fresh data.
          </p>

          <Button
            onClick={async () => {
              setSyncing(true)
              setSyncResult(null)
              try {
                const res = await fetch('/api/cron/sync-data')
                const data = await res.json()
                if (data.success) {
                  setSyncResult({
                    success: true,
                    message: `Synced ${data.entriesProcessed} entries across ${data.daysProcessed} days. Starts: ${data.funnelMetrics?.totalStarts}, Completions: ${data.funnelMetrics?.totalCompletions}`,
                  })
                  onSyncComplete?.()
                } else {
                  setSyncResult({
                    success: false,
                    message: data.error || 'Sync failed',
                  })
                }
              } catch (err) {
                setSyncResult({
                  success: false,
                  message: err instanceof Error ? err.message : 'Network error',
                })
              } finally {
                setSyncing(false)
              }
            }}
            disabled={syncing}
            className="bg-violet-600 hover:bg-violet-700"
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", syncing && "animate-spin")} />
            {syncing ? 'Syncing...' : 'Sync Now'}
          </Button>

          {syncResult && (
            <div className={cn(
              "flex items-start gap-2 p-3 rounded-lg text-sm",
              syncResult.success ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
            )}>
              {syncResult.success
                ? <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                : <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              }
              <span>{syncResult.message}</span>
            </div>
          )}
        </div>
      </section>

      {/* Display Preferences Section */}
      <section className="rounded-lg border bg-white">
        <div className="p-4 border-b bg-gray-50">
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-violet-600" />
            <h3 className="font-semibold text-gray-900">Display Preferences</h3>
          </div>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Auto-refresh interval</p>
              <p className="text-sm text-gray-500">How often to update data</p>
            </div>
            <select className="px-3 py-2 border rounded-lg text-sm bg-white">
              <option value="1">1 minute</option>
              <option value="5" selected>5 minutes</option>
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Default tab</p>
              <p className="text-sm text-gray-500">Which tab to show on load</p>
            </div>
            <select className="px-3 py-2 border rounded-lg text-sm bg-white">
              <option value="overview">Overview</option>
              <option value="funnel">Funnel</option>
              <option value="alerts">Alerts</option>
            </select>
          </div>
        </div>
      </section>
    </div>
  )
}
