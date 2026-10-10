import { Route, Routes } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import DemoApp from './pages/DemoApp';
import MediSyncApp from './pages/MediSyncApp';
import PublicAvailabilityPage from './pages/PublicAvailabilityPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/app" element={<DemoApp />} />
      <Route path="/dashboard" element={<DemoApp />} />
      <Route path="/medisync" element={<MediSyncApp lang="en" onToggleLang={() => {}} />} />
      <Route path="/public" element={<PublicAvailabilityPage lang="en" onToggleLang={() => {}} />} />
    </Routes>
  );
}
