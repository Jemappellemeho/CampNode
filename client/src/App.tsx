import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "./ThemeContext";
import Layout from "./components/Layout";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Profile from "./pages/Profile";
import CoursePlayer from "./pages/CoursePlayer";
import CourseManager from "./pages/CourseManager";
import Playground from "./pages/Playground";

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/landing" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Pages that use the shared Layout with top nav */}
          <Route element={<Layout />}>
            <Route path="/playground/:courseId" element={<Playground />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/profile" element={<Profile />} />
            {/* NOTE: route changed from /prof/manage/:courseId to /prof/course/:courseId 
                to match CourseManager and the Dashboard navigate() call */}
            <Route path="/prof/course/:courseId" element={<CourseManager />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
