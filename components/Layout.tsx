import React, { ReactNode, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Wine, CalendarDays, PieChart, Settings, LogOut, Menu, X, WifiOff, History } from 'lucide-react';
import { db } from '../services/storage';
import { User } from '../types';
import { checkSupabaseConnection } from '../services/supabaseClient';

interface LayoutProps {
  children: ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [supabaseConnected, setSupabaseConnected] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const u = db.getCurrentUser();
    if (!u) {
      navigate('/login');
    } else {
      setUser(u);
    }
  }, [navigate]);

  useEffect(() => {
    // Check connection once on mount
    checkSupabaseConnection().then(setSupabaseConnected);
  }, []);

  const handleLogout = () => {
    db.logout();
    navigate('/login');
  };

  const navItems = [
    { label: 'Evenimente', icon: <CalendarDays size={20} />, path: '/' },
    { label: 'Istoric', icon: <History size={20} />, path: '/history' },
    { label: 'Analize', icon: <PieChart size={20} />, path: '/analytics' },
    { label: 'Setări', icon: <Settings size={20} />, path: '/settings' },
  ];

  if (location.pathname === '/login') return <>{children}</>;

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 w-full bg-rose-900 text-white z-20 flex items-center justify-between p-4 shadow-md">
        <div className="flex items-center gap-2 font-bold text-lg">
          <Wine /> Corks SIE
        </div>
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
          {mobileMenuOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Sidebar */}
      <aside className={`fixed lg:static z-10 bg-white border-r border-gray-200 w-64 h-full transform transition-transform duration-200 ease-in-out ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} flex flex-col pt-20 lg:pt-0`}>
        <div className="h-16 flex items-center px-6 border-b border-gray-100 hidden lg:flex">
          <Wine className="text-rose-700 mr-2" />
          <span className="font-bold text-xl text-gray-800">Corks SIE</span>
        </div>

        <div className="p-4 flex-1">
          <div className="mb-6 px-2">
            <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Utilizator</p>
            <p className="font-medium text-sm truncate">{user?.name}</p>
            <span className="inline-block px-2 py-0.5 rounded text-xs bg-rose-100 text-rose-800 font-medium capitalize mt-1">
              {user?.role}
            </span>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive ? 'bg-rose-50 text-rose-700' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {item.icon}
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-gray-100">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <LogOut size={20} />
            Deconectare
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto pt-16 lg:pt-0 w-full relative">
        {!supabaseConnected && (
            <div className="bg-yellow-100 text-yellow-800 text-xs text-center py-1.5 px-4 font-medium border-b border-yellow-200 flex items-center justify-center gap-2">
                <WifiOff size={14}/>
                Supabase neconfigurat sau inaccesibil. Datele manuale se salvează doar local pe acest device.
            </div>
        )}
        <div className="max-w-7xl mx-auto p-4 lg:p-8">
          {children}
        </div>
      </main>
      
      {/* Overlay for mobile */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-0 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
    </div>
  );
};

export default Layout;