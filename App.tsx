import React, { useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import EventDetail from './pages/EventDetail';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import History from './pages/History';
import { db } from './services/storage';
import { syncEvents } from './services/wp';

const App = () => {
  useEffect(() => {
    // Auto-sync on first load if no data exists
    const initializeData = async () => {
      const events = db.getEvents();
      const lastSync = db.getLastSync();
      
      // If no events or no recent sync (older than 1 hour), auto-sync
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      if (events.length === 0 || !lastSync || lastSync < oneHourAgo) {
        console.log('[App] Auto-syncing data on startup...');
        try {
          await syncEvents();
          console.log('[App] Auto-sync completed successfully');
          
          // Refresh twice after sync
          console.log('[App] Refreshing page (1/2)...');
          setTimeout(() => {
            window.location.reload();
            setTimeout(() => {
              console.log('[App] Refreshing page (2/2)...');
              window.location.reload();
            }, 1000);
          }, 500);
        } catch (error) {
          console.error('[App] Auto-sync failed:', error);
        }
      } else {
        console.log('[App] Data already synced, skipping auto-sync');
      }
    };
    
    initializeData();
  }, []);

  return (
    <HashRouter>
      <Layout>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/event/:id" element={<EventDetail />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/history" element={<History />} />
          <Route path="/" element={<Dashboard />} />
        </Routes>
      </Layout>
    </HashRouter>
  );
};

export default App;