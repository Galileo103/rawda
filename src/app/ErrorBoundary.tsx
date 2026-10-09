import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Mascot } from '../design/Mascot'

interface State {
  error?: Error
}

/** Last-resort safety net: a calm screen with one big button, never a stack trace. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = {}

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[rawda] unexpected error', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main
        style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: 24, background: 'var(--bg)', textAlign: 'center' }}
      >
        <Mascot mood="think" size={150} />
        <p style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>
          عذرًا، حدث خطأ بسيط
          <br />
          <span lang="en">Oops — something went a little wrong</span>
        </p>
        <button
          type="button"
          onClick={() => {
            location.hash = '#/home'
            location.reload()
          }}
          style={{ minHeight: 72, minWidth: 200, borderRadius: 999, border: 0, background: 'var(--coral)', color: '#fff', fontSize: '1.5rem', fontWeight: 800, cursor: 'pointer' }}
        >
          ↻
          <span className="sr-only">Reload</span>
        </button>
      </main>
    )
  }
}
