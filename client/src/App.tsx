import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
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
import { initAuth } from "./utils/api";

function App() {
  // authReady: Warten bis initAuth() fertig ist, bevor die App gerendert wird.
  // Verhindert kurzes Aufflackern der Login-Seite beim Refresh obwohl der User eingeloggt ist.
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    // Beim App-Start: Token aus dem httpOnly Cookie wiederherstellen
    initAuth().finally(() => setAuthReady(true));
  }, []);

  if (!authReady) {
    // Kurzes Laden während der Token wiederhergestellt wird
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>Loading...</div>;
  }

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
