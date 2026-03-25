import { Routes, Route, Navigate } from 'react-router-dom';
import ExhibitionLeaderboard from './pages/ExhibitionLeaderboard';
import ExhibitionPitcherProfiler from './pages/ExhibitionPitcherProfiler';
import ExhibitionProspects from './pages/ExhibitionProspects';
import ExhibitionVelocityContact from './pages/ExhibitionVelocityContact';
import ExhibitionPlayerDetail from './pages/ExhibitionPlayerDetail';

export default function App() {
  return (
    <Routes>
      <Route path="/exhibition" element={<ExhibitionLeaderboard />} />
      <Route path="/exhibition/pitcher-profiler" element={<ExhibitionPitcherProfiler />} />
      <Route path="/exhibition/prospects" element={<ExhibitionProspects />} />
      <Route path="/exhibition/velocity-contact" element={<ExhibitionVelocityContact />} />
      <Route path="/exhibition/:pcode" element={<ExhibitionPlayerDetail />} />
      <Route path="*" element={<Navigate to="/exhibition" replace />} />
    </Routes>
  );
}
