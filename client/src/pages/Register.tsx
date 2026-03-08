import { useState } from 'react';
import logoFull from '../assets/logo_full.png';
import { useTheme } from '../ThemeContext';

function Register() {
  const { theme, toggleTheme } = useTheme();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'student'
  });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            const response = await fetch('http://localhost:3000/api/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: formData.email,
                    password: formData.password,
                    role: formData.role.toUpperCase() // "student" → "STUDENT"
                })
            });

            const data = await response.json();

            if (response.ok) {
                alert('Registration successful! User ID: ' + data.userId);
                // TODO: Redirect to login or dashboard
            } else {
                alert('Error: ' + data.error);
            }
        } catch (error) {
            console.error('Registration error:', error);
            alert('Failed to connect to server. Is backend running?');
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-yellow-300 via-green-400 to-blue-500 dark:from-gray-800 dark:via-gray-900 dark:to-black flex items-center justify-center p-4 transition-colors">
            {/* Theme toggle - top right */}
            <button
                onClick={toggleTheme}
                className="absolute top-4 right-4 px-3 py-2 bg-white/20 backdrop-blur-sm text-white rounded-lg hover:bg-white/30 transition-colors"
            >
                {theme === 'light' ? '🌙' : '☀️'}
            </button>

            <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-6 sm:p-8">
                {/* Logo */}
                <div className="mb-6 sm:mb-8">
                    <img
                        src={logoFull}
                        alt="CampNode Logo"
                        className="w-full max-w-sm mx-auto"
                    />
                </div>

                <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-white mb-2 text-center">
                    Create Account
                </h2>
                <p className="text-gray-600 dark:text-gray-400 text-sm sm:text-base mb-6 text-center">
                    Join the learning playground
                </p>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Name */}
                    <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Full Name
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              placeholder="Maria Schmidt"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Email
            </label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
              className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              placeholder="maria@example.com"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Password
            </label>
            <input
              type="password"
              required
              value={formData.password}
              onChange={(e) => setFormData({...formData, password: e.target.value})}
              className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              placeholder="••••••••"
            />
          </div>

                  {/* Role */}
                  <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          I am a
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                          <button
                              type="button"
                              onClick={() => setFormData({ ...formData, role: 'student' })}
                              className={`py-3 px-4 rounded-xl font-medium transition-all ${formData.role === 'student'
                                      ? 'bg-green-500 text-white shadow-lg'
                                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                  }`}
                          >
                              Student
                          </button>
                          <button
                              type="button"
                              onClick={() => setFormData({ ...formData, role: 'professor' })}
                              className={`py-3 px-4 rounded-xl font-medium transition-all ${formData.role === 'professor'
                                      ? 'bg-red-500 text-white shadow-lg'
                                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                  }`}
                          >
                              Professor
                          </button>
                      </div>
                  </div>

          {/* Submit */}
          <button
            type="submit"
            className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-4 px-6 rounded-xl transition-all transform hover:scale-105 shadow-lg mt-6"
          >
            Create Account
          </button>
        </form>

        {/* Login link */}
        <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-6">
          Already have an account?{' '}
          <a href="#" className="text-blue-500 hover:text-blue-600 font-medium">
            Log in
          </a>
        </p>
      </div>
    </div>
  );
}

export default Register;