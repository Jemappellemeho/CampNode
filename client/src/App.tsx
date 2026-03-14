// =============================================================
// FILE LOCATION: client/src/App.tsx
// REPLACE your existing App.tsx entirely
//
// KEY CHANGE: every page is now wrapped in <Layout>
// This means every page automatically gets the shared header.
// =============================================================

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import Register from './pages/Register';
import Login from './pages/Login';
import Profile from './pages/Profile';
import Playground from './pages/Playground';
import ProfDashboard from "./pages/ProfDashboard";
import CourseCreator from "./pages/CourseCreator";
import CourseManager from "./pages/CourseManager";

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Login />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/playground" element={<Playground />} />
          <Route path="/prof/dashboard" element={<ProfDashboard />} />
          <Route path="/prof/create-course" element={<CourseCreator />} />
          <Route path="/prof/course/:courseId" element={<CourseManager />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;