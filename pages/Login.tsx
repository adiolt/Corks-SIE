import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wine } from 'lucide-react';
import { db } from '../services/storage';

const Login = () => {
  const [email, setEmail] = useState('manager@corks.ro');
  const [password, setPassword] = useState('demo');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const user = db.login(email);
    if (user) {
      navigate('/');
    } else {
      setError('Email invalid. Încearcă: admin@corks.ro sau manager@corks.ro');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-rose-100 p-3 rounded-full mb-4">
            <Wine size={32} className="text-rose-700" />
          </div>
          <h1 className="text-xl font-bold text-gray-800 text-center">Corks SIE<br/><span className="text-base font-normal text-gray-500">(Sistem Inteligent de Evenimente)</span></h1>
          <p className="text-gray-400 text-xs mt-2">Autentificare echipă</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded text-sm text-center">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none transition"
              placeholder="nume@corks.ro"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Parolă</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none transition"
              placeholder="••••••"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-rose-700 hover:bg-rose-800 text-white font-semibold py-2.5 rounded-lg transition shadow-md"
          >
            Intră în cont
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-gray-400">
          &copy; {new Date().getFullYear()} Corks Cozy Bar
        </div>
      </div>
    </div>
  );
};

export default Login;