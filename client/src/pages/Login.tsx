import { useState } from 'react';
import logoFull from '../assets/logo_full.png';
import { useTheme } from '../ThemeContext';

function Login() {
  const { theme, toggleTheme } = useTheme();
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  
  try {
    const response = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: formData.email,
          password: formData.password
      })
    });

            const data = await response.json();

            if (response.ok) {
                // Save the token for authenticated requests
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));

                alert('Login successful! Welcome ' + data.user.email);
                // TODO: Redirect to dashboard based on role
            } else {
                alert('Error: ' + data.error);
            }
        } catch (error) {
            console.error('Login error:', error);
            alert('Failed to connect to server. Is backend running?');
        }
    };
    return (
        <div className="min-h-screen bg-gradient-to-br from-yellow-300 via-green-400 to-blue-500 dark:from-gray-800 dark:via-gray-900 dark:to-black flex items-center justify-center p-4 transition-colors">
            {/* Theme toggle */}
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
          Welcome Back
        </h2>
        <p className="text-gray-600 dark:text-gray-400 text-sm sm:text-base mb-6 text-center">
          Continue your learning journey
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
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

          {/* Forgot password */}
          <div className="text-right">
            <a href="#" className="text-sm text-blue-500 hover:text-blue-600">
              Forgot password?
            </a>
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-4 px-6 rounded-xl transition-all transform hover:scale-105 shadow-lg"
          >
            Log In
          </button>
        </form>

        {/* Register link */}
        <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-6">
          Don't have an account?{' '}
          <a href="#" className="text-blue-500 hover:text-blue-600 font-medium">
            Sign up
          </a>
        </p>
      </div>
    </div>
  );
}

export default Login;