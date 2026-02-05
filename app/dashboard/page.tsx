'use client'

export const dynamic = 'force-dynamic'

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-2xl font-bold text-gray-900">
            Get Thin MD - Funnel Analytics
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Real-time monitoring and insights for medical questionnaire funnels
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Dashboard</h2>
          <p className="text-gray-600">
            Connect your Embeddables API to start monitoring your funnels.
          </p>
        </div>
      </main>
    </div>
  );
}
