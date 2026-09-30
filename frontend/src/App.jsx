import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import DispatcherDashboard from './pages/DispatcherDashboard';
import AdminDashboard from './pages/AdminDashboard';
import ManagerDashboard from './pages/ManagerDashboard';
import TechnicianDashboard from './pages/TechnicianDashboard';
import CrosswalkDetails from './pages/CrosswalkDetails';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/dispatcher" element={<DispatcherDashboard />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/manager" element={<ManagerDashboard />} />
        <Route path="/technician" element={<TechnicianDashboard />} />
        <Route path="/crosswalk/:id" element={<CrosswalkDetails />} />
      </Routes>
    </Router>
  );
}

export default App;