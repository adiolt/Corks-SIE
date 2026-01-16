import React, { useEffect, useState } from 'react';
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
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncComplete, setSyncComplete] = useState(false);

  useEffect(() => {
    // Auto-sync on first load if no data exists
    const initializeData = async () => {
      const events = db.getEvents();
      const lastSync = db.getLastSync();
      
      // Check if we've already done the initial sync
      const hasInitialized = sessionStorage.getItem('app_initialized');
      
      // If no events or no recent sync (older than 1 hour), and haven't initialized this session
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      if (!hasInitialized && (events.length === 0 || !lastSync || lastSync < oneHourAgo)) {
        console.log('[App] Auto-syncing data on startup...');
        setIsSyncing(true);
        
        try {
          // Run sync and wait for full completion
          const result = await syncEvents();
          console.log('[App] Auto-sync result:', result);
          
          // Wait for storage operations to complete
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Mark as initialized for this session
          sessionStorage.setItem('app_initialized', 'true');
          setIsSyncing(false);
          setSyncComplete(true);
          
          console.log('[App] Auto-sync completed successfully');
        } catch (error) {
          console.error('[App] Auto-sync failed:', error);
          setIsSyncing(false);
        }
      } else {
        console.log('[App] Data already synced, skipping auto-sync');
        setSyncComplete(true);
      }
    };
    
    initializeData();
  }, []);

  if (isSyncing) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50">
        <div className="bg-white p-8 rounded-xl shadow-lg text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-rose-600 mx-auto mb-4"></div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Sincronizare Inițială...</h2>
          <p className="text-gray-600 text-sm">Încărcăm datele evenimentelor</p>
        </div>
      </div>
    );
  }

  return (
    <HashRouter>
      <Layout>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/event/:id" element={<EventDetail key={syncComplete ? 'synced' : 'initial'} />} />
          <Route path="/analytics" element={<Analytics key={syncComplete ? 'synced' : 'initial'} />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/history" element={<History key={syncComplete ? 'synced' : 'initial'} />} />
          <Route path="/" element={<Dashboard key={syncComplete ? 'synced' : 'initial'} />} />
        </Routes>
      </Layout>
    </HashRouter>
  );
};

export default App;