import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import logoFull from '../assets/logo_full.png';
import { useTheme } from '../ThemeContext';

function Login() {
  const { theme, toggleTheme } = useTheme();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await axios.post('http://localhost:3000/api/auth/login', formData);
      const data = response.data;

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      navigate('/dashboard');
    } catch (err: any) {
      console.error('Login error:', err);
      alert(err.response?.data?.error || 'Login failed');
    }
  };

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 transition-colors ${theme === 'dark' ? 'bg-gray-900' : 'bg-gradient-to-br from-yellow-300 via-green-400 to-blue-500'}`}>
      <button
        onClick={toggleTheme}
        className="absolute top-4 right-4 px-3 py-2 bg-white/20 backdrop-blur-sm text-white rounded-lg hover:bg-white/30 transition-colors"
      >
        {theme === 'light' ? '🌙' : '☀️'}
      </button>

      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-6 sm:p-8">
        <img src={logoFull} alt="Logo" className="w-full max-w-sm mx-auto mb-6" />
        <h2 className="text-2xl font-bold text-center mb-2">Welcome Back</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="w-full p-3 rounded-xl border"
          />
          <input
            type="password"
            placeholder="Password"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            className="w-full p-3 rounded-xl border"
          />
          <button type="submit" className="w-full bg-blue-500 text-white py-3 rounded-xl">Log In</button>
        </form>
        <p className="text-center mt-4">
          Don't have an account? <Link to="/register" className="text-blue-500">Sign up</Link>
        </p>
      </div>
    </div>
  );
}

export default Login;