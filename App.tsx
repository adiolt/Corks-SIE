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
      
      // Check if we've already done the initial sync + refresh cycle
      const hasInitialized = localStorage.getItem('app_initialized');
      const refreshCount = parseInt(localStorage.getItem('refresh_count') || '0');
      
      // If we're in the middle of refreshing, increment counter and continue
      if (refreshCount > 0 && refreshCount < 3) {
        console.log(`[App] Refresh ${refreshCount}/2 completed`);
        localStorage.setItem('refresh_count', String(refreshCount + 1));
        
        if (refreshCount < 2) {
          setTimeout(() => {
            console.log(`[App] Triggering refresh ${refreshCount + 1}/2...`);
            window.location.reload();
          }, 1000);
        } else {
          // Done with all refreshes
          localStorage.removeItem('refresh_count');
          console.log('[App] Initialization complete');
        }
        return;
      }
      
      // If no events or no recent sync (older than 1 hour), and haven't initialized yet
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      if (!hasInitialized && (events.length === 0 || !lastSync || lastSync < oneHourAgo)) {
        console.log('[App] Auto-syncing data on startup...');
        try {
          await syncEvents();
          console.log('[App] Auto-sync completed successfully');
          
          // Mark as initialized and start refresh cycle
          localStorage.setItem('app_initialized', 'true');
          localStorage.setItem('refresh_count', '1');
          
          // Start first refresh
          setTimeout(() => {
            console.log('[App] Triggering refresh 1/2...');
            window.location.reload();
          }, 1000);
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