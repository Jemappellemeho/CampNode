import { useState, useEffect } from 'react';
import { useTheme } from '../ThemeContext';
import { useNavigate } from 'react-router-dom';

function Profile() {
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const saved = localStorage.getItem('user');
    if (saved) setUser(JSON.parse(saved));
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  if (!user) return <div>Loading...</div>;

  return (
    <div className="max-w-4xl mx-auto mt-8 px-4">
      {/* Profile Card */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl p-8 mb-6 transition-colors">
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <div className="w-24 h-24 rounded-full bg-blue-500 flex items-center justify-center text-white text-3xl font-bold">
              {user.name ? user.name[0].toUpperCase() : user.email[0].toUpperCase()}
            </div>
            <div>
              <h1 className="text-3xl font-bold dark:text-white">{user.name || 'User'}</h1>
              <p className="text-gray-500">{user.email}</p>
              <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-bold ${
                user.role === 'PROFESSOR' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'
              }`}>
                {user.role}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <button
              onClick={toggleTheme}
              className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 dark:text-white text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 rounded-xl bg-red-100 text-red-600 text-sm font-medium hover:bg-red-200 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Profile;