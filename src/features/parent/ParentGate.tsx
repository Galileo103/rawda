import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../app/AppState'
import { Icon } from '../../design/Icon'
import { Button, Field, Screen } from '../../design/ui'
import { fmt } from '../../i18n'
import { hashPin, isValidPin, makeWordsChallenge, newSalt, verifyPin } from '../../services/parentGate'
import { updateSettings } from '../../services/repos/settings'
import s from './parent.module.css'

const HOLD_MS = 3000
const MAX_TRIES = 5
const LOCKOUT_S = 30

type Step = 'hold' | 'pin' | 'words' | 'newpin'

/**
 * Two-step parent gate: press-and-hold (a deliberate action), then the parent PIN.
 * If the PIN is forgotten, a number written in words (unreadable for a pre-reader) allows choosing a new one.
 */
export function ParentGate({ onUnlock }: { onUnlock: () => void }) {
  const { settings, t } = useApp()
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('hold')
  const [progress, setProgress] = useState(0)
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [error, setError] = useState('')
  const [tries, setTries] = useState(0)
  const [lockedUntil, setLockedUntil] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [challenge, setChallenge] = useState(() => makeWordsChallenge(t.digitWords, Math.random, settings.uiLang === 'ar' ? '، ' : ', '))
  const holdStart = useRef<number | null>(null)
  const raf = useRef(0)

  useEffect(() => {
    if (lockedUntil <= Date.now()) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [lockedUntil])
  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  const startHold = () => {
    holdStart.current = performance.now()
    const tick = () => {
      if (holdStart.current === null) return
      const p = Math.min(1, (performance.now() - holdStart.current) / HOLD_MS)
      setProgress(p)
      if (p >= 1) {
        holdStart.current = null
        setStep('pin')
        return
      }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }
  const stopHold = () => {
    holdStart.current = null
    cancelAnimationFrame(raf.current)
    setProgress(0)
  }

  const submitPin = async () => {
    if (lockedUntil > Date.now()) return
    if (await verifyPin(pin, settings.pinHash, settings.pinSalt)) {
      onUnlock()
      return
    }
    const n = tries + 1
    setTries(n)
    setPin('')
    setError(t.gate.wrongPin)
    if (n >= MAX_TRIES) {
      setLockedUntil(Date.now() + LOCKOUT_S * 1000)
      setNow(Date.now())
      setTries(0)
    }
  }

  const submitWords = () => {
    if (pin === challenge.digits) {
      setPin('')
      setError('')
      setStep('newpin')
    } else {
      setError(t.gate.wordsWrong)
      setPin('')
      setChallenge(makeWordsChallenge(t.digitWords, Math.random, settings.uiLang === 'ar' ? '، ' : ', '))
    }
  }

  const submitNewPin = async () => {
    if (!isValidPin(pin)) return setError(t.setup.pinInvalid)
    if (pin !== pin2) return setError(t.setup.pinMismatch)
    const salt = newSalt()
    await updateSettings({ pinSalt: salt, pinHash: await hashPin(pin, salt) })
    onUnlock()
  }

  const lockedSecs = Math.max(0, Math.ceil((lockedUntil - now) / 1000))
  const pinInput = (value: string, set: (v: string) => void, onEnter: () => void, label: string, autoFocus = true) => (
    <Field label={label}>
      <input
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={step === 'words' ? 3 : 4}
        autoFocus={autoFocus}
        autoComplete="off"
        value={value}
        dir="ltr"
        style={{ fontSize: '2rem', letterSpacing: '0.5em', textAlign: 'center', maxWidth: 240, marginInline: 'auto' }}
        onChange={(e) => {
          set(e.target.value.replace(/\D/g, ''))
          setError('')
        }}
        onKeyDown={(e) => e.key === 'Enter' && onEnter()}
      />
    </Field>
  )

  return (
    <Screen className={s.gate} child={false}>
      <Icon name="lock" size={48} />
      <h1 style={{ margin: 0 }}>{t.gate.title}</h1>

      {step === 'hold' && (
        <>
          <button
            type="button"
            className={s.holdBtn}
            onPointerDown={startHold}
            onPointerUp={stopHold}
            onPointerLeave={stopHold}
            onPointerCancel={stopHold}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !e.repeat && startHold()}
            onKeyUp={stopHold}
            onContextMenu={(e) => e.preventDefault()}
            aria-describedby="hold-hint"
          >
            <svg className={s.holdRing} viewBox="0 0 100 100" aria-hidden="true">
              <circle cx="50" cy="50" r="46" fill="none" stroke="var(--line)" strokeWidth="6" />
              <circle cx="50" cy="50" r="46" fill="none" stroke="var(--teal)" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${progress * 289} 289`} transform="rotate(-90 50 50)" />
            </svg>
            {t.gate.hold}
          </button>
          <p id="hold-hint" style={{ margin: 0 }}>
            {t.gate.holdHint}
          </p>
        </>
      )}

      {step === 'pin' && (
        <div style={{ display: 'grid', gap: 14, width: 'min(420px, 100%)' }}>
          {lockedSecs > 0 ? <p className={s.err}>{fmt(t.gate.locked, { s: lockedSecs })}</p> : pinInput(pin, setPin, () => void submitPin(), t.gate.enterPin)}
          {error && lockedSecs === 0 && (
            <p className={s.err} role="alert">
              {error}
            </p>
          )}
          <Button variant="teal" icon="check" onClick={() => void submitPin()} disabled={pin.length !== 4 || lockedSecs > 0}>
            {t.common.confirm}
          </Button>
          <Button variant="ghost" onClick={() => (setStep('words'), setPin(''), setError(''))}>
            {t.gate.forgot}
          </Button>
        </div>
      )}

      {step === 'words' && (
        <div style={{ display: 'grid', gap: 14, width: 'min(420px, 100%)' }}>
          <p style={{ margin: 0, fontWeight: 700 }}>{t.gate.wordsTitle}</p>
          <p className={s.challenge} lang={settings.uiLang}>
            {challenge.words}
          </p>
          {pinInput(pin, setPin, submitWords, t.gate.wordsTitle)}
          {error && (
            <p className={s.err} role="alert">
              {error}
            </p>
          )}
          <Button variant="teal" icon="check" onClick={submitWords} disabled={pin.length !== 3}>
            {t.common.confirm}
          </Button>
        </div>
      )}

      {step === 'newpin' && (
        <div style={{ display: 'grid', gap: 14, width: 'min(420px, 100%)' }}>
          {pinInput(pin, setPin, () => undefined, t.gate.newPin)}
          {pinInput(pin2, setPin2, () => void submitNewPin(), t.setup.pinRepeat, false)}
          {error && (
            <p className={s.err} role="alert">
              {error}
            </p>
          )}
          <Button variant="teal" icon="check" onClick={() => void submitNewPin()}>
            {t.common.save}
          </Button>
        </div>
      )}

      <Button variant="secondary" icon="home" onClick={() => navigate(settings.onboarded ? '/home' : '/')}>
        {t.gate.back}
      </Button>
    </Screen>
  )
}
