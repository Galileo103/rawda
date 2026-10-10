import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ActivityPlayer } from '../features/activities/ActivityPlayer'
import { DiscoverBoard } from '../features/discover/DiscoverBoard'
import { GameScreen } from '../features/games/GameScreen'
import { GamesHub, GardenScreen } from '../features/games/GamesHub'
import { HomeScreen } from '../features/home/HomeScreen'
import { MapScreen } from '../features/map/MapScreen'
import { ParentArea } from '../features/parent/ParentArea'
import { QuranScreen } from '../features/quran/QuranScreen'
import { SurahScreen } from '../features/quran/SurahScreen'
import { RewardsScreen } from '../features/rewards/RewardsScreen'
import { StoryLibrary } from '../features/stories/StoryLibrary'
import { StoryReader } from '../features/stories/StoryReader'
import { GalleryScreen } from '../features/studio/GalleryScreen'
import { StudioScreen } from '../features/studio/StudioScreen'
import { SetupWizard } from '../features/welcome/SetupWizard'
import { WelcomeScreen } from '../features/welcome/WelcomeScreen'
import { AppStateProvider } from './AppState'
import { ChildShell } from './ChildShell'
import { ErrorBoundary } from './ErrorBoundary'

// Hash routing works identically on the web, in an installed PWA, and inside the Android (Capacitor) WebView.
export function App() {
  return (
    <ErrorBoundary>
      <AppStateProvider>
        <HashRouter>
          <Routes>
            <Route path="/" element={<WelcomeScreen />} />
            <Route path="/setup" element={<SetupWizard />} />
            <Route element={<ChildShell />}>
              <Route path="/home" element={<HomeScreen />} />
              <Route path="/map/:areaId" element={<MapScreen />} />
              <Route path="/play/:activityId" element={<ActivityPlayer />} />
              <Route path="/discover/:activityId" element={<DiscoverBoard />} />
              <Route path="/stories" element={<StoryLibrary />} />
              <Route path="/stories/:storyId" element={<StoryReader />} />
              <Route path="/studio" element={<StudioScreen />} />
              <Route path="/studio/gallery" element={<GalleryScreen />} />
              <Route path="/rewards" element={<RewardsScreen />} />
              <Route path="/quran" element={<QuranScreen />} />
              <Route path="/quran/:number" element={<SurahScreen />} />
              <Route path="/games" element={<GamesHub />} />
              <Route path="/games/:gameId" element={<GameScreen />} />
              <Route path="/garden" element={<GardenScreen />} />
            </Route>
            <Route path="/parent/*" element={<ParentArea />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </HashRouter>
      </AppStateProvider>
    </ErrorBoundary>
  )
}
