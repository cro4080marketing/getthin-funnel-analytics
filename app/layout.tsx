import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Funnel Analytics Dashboard',
  description: 'Get Thin MD Quiz Funnel Analytics',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
