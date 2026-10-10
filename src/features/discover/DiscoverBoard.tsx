import { useLiveQuery } from 'dexie-react-hooks'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../../app/AppState'
import { activityAvailable, activityById, pick } from '../../content/loader'
import type { LessonItem } from '../../content/schemas'
import { Icon } from '../../design/Icon'
import { Mascot } from '../../design/Mascot'
import { Screen, SpeechBubble, TopBar } from '../../design/ui'
import { Visual } from '../../design/Visual'
import { audio } from '../../services/audio/AudioService'
import { takenLessonItems } from '../../services/repos/progress'
import { useSpeakOnMount, voice } from '../common'
import s from './discover.module.css'

type BoardPrompt = 'chooseLetter' | 'chooseNumber' | 'chooseColor' | 'chooseShape' | 'chooseIslamic' | 'chooseScience' | 'chooseLogic'

/** Hala's question for a Discover board ("Which colour shall we discover today?"). */
function boardPrompt(activity: { id: string; areaId: string } | undefined): BoardPrompt {
  if (activity?.id === 'colors-discover') return 'chooseColor'
  if (activity?.id === 'shapes-discover') return 'chooseShape'
  switch (activity?.areaId) {
    case 'numbers':
      return 'chooseNumber'
    case 'islamic':
      return 'chooseIslamic'
    case 'science':
      return 'chooseScience'
    case 'logic':
      return 'chooseLogic'
    default:
      return 'chooseLetter'
  }
}

/**
 * Every new thing a Discover activity teaches (letters, numbers, colours, shapes, ideas…), in order.
 * A parent or child picks any letter to learn; learned ones carry a ✓,
 * and the next new one glows. Nothing is locked.
 */
export function DiscoverBoard() {
  const { activityId } = useParams()
  const { settings, t, langs } = useApp()
  const navigate = useNavigate()
  const activity = activityId ? activityById(activityId) : undefined
  const taken = useLiveQuery(() => takenLessonItems(activityId ? [activityId] : []), [activityId], new Map<string, Set<string>>())
  const lang = settings.practiceLang
  const prompt = voice(lang)[boardPrompt(activity)]

  useSpeakOnMount(prompt, lang, !!activity)

  if (!activity || activity.template !== 'lesson' || settings.disabledAreas.includes(activity.areaId) || !activityAvailable(activity, langs)) {
    return <Navigate to="/home" replace />
  }
  const done = taken.get(activity.id) ?? new Set<string>()
  const items = activity.items as LessonItem[]
  const nextId = items.find((i) => !done.has(i.id))?.id

  return (
    <Screen>
      <TopBar backTo={`/map/${activity.areaId}`} backLabel={t.common.back} title={pick(activity.title, lang)} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <Mascot mood="happy" size={86} />
        <SpeechBubble text={prompt} lang={lang} />
      </div>
      <div className={s.legend}>
        <span>
          <i className={s.dot} style={{ background: 'var(--leaf)' }} /> {t.discover.learned}
        </span>
        <span>
          <i className={s.dot} style={{ background: 'var(--sun)' }} /> {t.discover.next}
        </span>
      </div>
      <nav className={s.board} aria-label={pick(activity.title, lang)}>
        {items.map((item) => {
          const learned = done.has(item.id)
          return (
            <button
              key={item.id}
              type="button"
              className={[s.tile, learned ? s.learned : '', item.id === nextId ? s.next : ''].join(' ')}
              onClick={() => {
                audio.sfx('tap')
                navigate(`/play/${activity.id}?item=${item.id}`)
              }}
              aria-label={`${pick(item.meet, lang)}${learned ? ` (${t.discover.learned})` : ''}`}
              data-testid={`discover-${item.id}`}
            >
              <Visual v={item.focus} lang={lang} size={64} />
              {learned && (
                <span className={s.badge}>
                  <Icon name="check" size={18} />
                </span>
              )}
            </button>
          )
        })}
      </nav>
    </Screen>
  )
}
