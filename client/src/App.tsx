import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "./ThemeContext";
import Layout from "./components/Layout";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Profile from "./pages/Profile";
import CourseManager from "./pages/CourseManager";
import Playground from "./pages/Playground";
import Quiz from "./pages/Quiz"; 
import PublicCourses from "./pages/PublicCourses";

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          {/* Auth Flow */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/landing" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Authenticated Layout Wrapper */}
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/courses/public" element={<PublicCourses />} />
            <Route path="/profile" element={<Profile />} />
            
            {/* Playground Routing:
              Supports both specific course context and general entry 
              to prevent 'No routes matched' errors during navigation.
            */}
            <Route path="/playground/:courseId" element={<Playground />} />
            <Route path="/playground" element={<Playground />} />
            
            {/* Administrative Management */}
            <Route path="/prof/course/:courseId" element={<CourseManager />} />
            
            {/* Evaluation Module */}
            <Route path="/quiz/:topicId" element={<Quiz />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
