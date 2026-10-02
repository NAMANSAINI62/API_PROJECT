import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import { Login, Register } from './pages/AuthPages';
import { Overview } from './pages/Overview';
import { Projects } from './pages/Projects';
import { ApiKeys } from './pages/ApiKeys';
import { Logs } from './pages/Logs';
import { Playground } from './pages/Playground';
import { Usage } from './pages/Usage';
import { Settings } from './pages/Settings';

const ProtectedRoute = ({ children }) => {
  const { token } = useAuth();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <Layout>{children}</Layout>;
};

const PublicRoute = ({ children }) => {
  const { token } = useAuth();
  if (token) {
    return <Navigate to="/overview" replace />;
  }
  return children;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />

          {/* Protected Dashboard Routes */}
          <Route path="/overview" element={<ProtectedRoute><Overview /></ProtectedRoute>} />
          <Route path="/projects" element={<ProtectedRoute><Projects /></ProtectedRoute>} />
          <Route path="/api-keys" element={<ProtectedRoute><ApiKeys /></ProtectedRoute>} />
          <Route path="/playground" element={<ProtectedRoute><Playground /></ProtectedRoute>} />
          <Route path="/logs" element={<ProtectedRoute><Logs /></ProtectedRoute>} />
          <Route path="/usage" element={<ProtectedRoute><Usage /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />

          {/* Default Redirect */}
          <Route path="*" element={<Navigate to="/overview" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
