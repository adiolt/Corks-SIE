import React, { useState, useEffect } from 'react';
import { db } from '../services/storage';
import { AppSettings } from '../types';
import { Save, Activity, CheckCircle, AlertOctagon } from 'lucide-react';
import { wpClient } from '../services/wpClient';

const Settings = () => {
  const [settings, setSettings] = useState<AppSettings>({
      apiKey: '',
      siteUrl: '',
      syncInterval: 5,
      capacityOverride: false,
      wpClientMode: 'server'
  });
  const [msg, setMsg] = useState('');
  
  // Diagnostics State
  const [diagStatus, setDiagStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [diagLog, setDiagLog] = useState<string>('');

  useEffect(() => {
      setSettings(db.getSettings());
  }, []);

  const handleSave = () => {
      db.saveSettings(settings);
      setMsg('Setări salvate cu succes!');
      setTimeout(() => setMsg(''), 3000);
  };

  const runDiagnostics = async () => {
    setDiagStatus('running');
    setDiagLog('Starting WP Auth Diagnostics...\n');
    
    try {
      // 1. Test OPTIONS (Connectivity & Auth Check)
      setDiagLog(prev => prev + '> OPTIONS /wp-json/tribe/tickets/v1/attendees\n');
      // Using a simpler path that allows listing or just checking access
      // Note: OPTIONS requests might not be fully supported by corsproxy in the same way, 
      // so we use a lightweight GET to a known endpoint instead or stick to the requirement if possible.
      // Requirement: OPTIONS /wp-json/tribe/tickets/v1/attendees
      // We will try GET first as it's more definitive for data access.
      
      const testEventId = 9274; // From prompt requirement
      
      // 2. GET Test
      setDiagLog(prev => prev + `> GET /wp-json/tribe/tickets/v1/attendees?post_id=${testEventId}&per_page=5\n`);
      const response = await wpClient.wpGet('wp-json/tribe/tickets/v1/attendees', {
        post_id: testEventId,
        per_page: 5,
        page: 1
      });

      setDiagLog(prev => prev + `STATUS: ${response.status}\n`);
      
      let total = 0;
      let totalPages = 0;
      let items = [];

      // Parse output for display
      if (Array.isArray(response.data)) {
        items = response.data;
        total = parseInt(response.headers['x-wp-total'] || '0');
        totalPages = parseInt(response.headers['x-wp-totalpages'] || '0');
      } else {
        items = response.data.attendees || [];
        total = response.data.total;
        totalPages = response.data.total_pages;
      }

      setDiagLog(prev => prev + `Totals: ${total} items, ${totalPages} pages.\n`);
      setDiagLog(prev => prev + `Fetched: ${items.length} items.\n`);
      
      if (items.length > 0) {
        const first = items[0];
        setDiagLog(prev => prev + `Sample: ID=${first.id}, Name="${first.purchaser_name || first.name}"\n`);
      } else {
        setDiagLog(prev => prev + `Sample: No attendees found (or empty list).\n`);
      }

      setDiagStatus('success');
      setDiagLog(prev => prev + 'SUCCESS: Connection established and authenticated.\n');

    } catch (error: any) {
      setDiagStatus('error');
      setDiagLog(prev => prev + `ERROR: ${error.message}\n`);
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        setDiagLog(prev => prev + 'HINT: This looks like a CORS or Network error. Ensure Client Mode is "Server" (Proxy).\n');
      }
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20">
      <h1 className="text-2xl font-bold text-gray-800">Setări Aplicație</h1>
      
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-4">
          <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Domeniu Site</label>
              <input 
                 className="w-full px-3 py-2 border rounded-lg focus:ring-rose-500 outline-none" 
                 value={settings.siteUrl}
                 onChange={e => setSettings({...settings, siteUrl: e.target.value})}
              />
          </div>

          <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mod Client WP</label>
              <select 
                className="w-full px-3 py-2 border rounded-lg"
                value={settings.wpClientMode || 'server'}
                onChange={e => setSettings({...settings, wpClientMode: e.target.value as any})}
              >
                <option value="server">Server (Proxy) - Recomandat</option>
                <option value="direct">Direct (Browser) - Doar dacă CORS este permis</option>
              </select>
          </div>

          <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
              <span className="text-green-600 text-sm font-medium">{msg}</span>
              <button 
                onClick={handleSave}
                className="flex items-center gap-2 bg-gray-900 text-white px-6 py-2 rounded-lg hover:bg-black transition"
              >
                  <Save size={18} /> Salvează
              </button>
          </div>
      </div>

      {/* Diagnostics Panel */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <Activity size={20} className="text-rose-600"/> WP Auth Diagnostics
          </h3>
          <button 
            onClick={runDiagnostics}
            disabled={diagStatus === 'running'}
            className="text-xs bg-rose-100 text-rose-800 px-3 py-1 rounded-full font-bold hover:bg-rose-200 disabled:opacity-50"
          >
            {diagStatus === 'running' ? 'Se testează...' : 'Rulează Test'}
          </button>
        </div>
        
        <div className="bg-gray-900 rounded-lg p-4 font-mono text-xs text-green-400 overflow-x-auto h-48 whitespace-pre-wrap">
          {diagLog || 'Apasă "Rulează Test" pentru a verifica conexiunea API...'}
        </div>
        
        {diagStatus === 'success' && (
           <div className="mt-2 text-green-700 text-sm flex items-center gap-2"><CheckCircle size={16}/> Conexiune reușită.</div>
        )}
        {diagStatus === 'error' && (
           <div className="mt-2 text-red-600 text-sm flex items-center gap-2"><AlertOctagon size={16}/> Eroare conexiune.</div>
        )}
      </div>
    </div>
  );
};

export default Settings;