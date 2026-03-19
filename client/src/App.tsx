<<<<<<< Updated upstream
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import Register from './pages/Register';
import Login from './pages/Login';
import Profile from './pages/Profile';
import Playground from './pages/Playground';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Login />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/playground" element={<Playground />} />
      </Routes>
    </BrowserRouter>
=======
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "./ThemeContext";
import Layout from "./components/Layout";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Profile from "./pages/Profile";
import CoursePlayer from "./pages/CoursePlayer";
import Playground from "./pages/Playground";
import Quiz from "./pages/Quiz";

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/landing" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route element={<Layout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/playground" element={<Playground />} />
            <Route path="/playground/:courseId" element={<CoursePlayer />} />
            <Route path="/quiz/:topicId" element={<Quiz />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
>>>>>>> Stashed changes
  );
}

export default App;