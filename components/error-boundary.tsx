'use client'

import React from 'react'
import { captureWebException } from '@/lib/sentry/capture'

interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    captureWebException(error, {
      tags: {
        runtime: 'browser',
        surface: 'error-boundary',
        endpoint_family: 'client-render',
      },
      contexts: {
        react: {
          componentStack: errorInfo.componentStack,
        },
      },
    })

    // Log the error to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('ErrorBoundary caught an error:', error, errorInfo)
    }
  }

  render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return (
        this.props.fallback || (
          <div style={{
            padding: '40px',
            textAlign: 'center',
            background: 'var(--surface-color)',
            borderRadius: '16px',
            margin: '20px',
            boxShadow: 'var(--shadow-md)'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
            <h2 style={{ color: 'var(--text-primary)', marginBottom: '8px' }}>
              エラーが発生しました
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
              申し訳ございません。データの読み込み中にエラーが発生しました。
            </p>
            <button 
              onClick={() => window.location.reload()}
              style={{
                padding: '12px 24px',
                background: 'var(--primary-color)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '16px'
              }}
            >
              ページを再読み込み
            </button>
          </div>
        )
      )
    }

    return this.props.children
  }
}
