// =============================================================
// FILE LOCATION: client/src/pages/CourseCreator.tsx
// REPLACE existing file entirely
// Header handled by Layout.tsx — no header here
// AI suggestions are RED (matches playground node colors)
// =============================================================

import React, { useState } from "react";
import axios from "axios";

// TopicInput represents a topic selected from Wikidata search results.
// wikidataId (Q-number) is required — the backend uses it to fetch the Wikipedia article.
// isAISuggested and accepted are placeholders for future AI recommendation feature.
interface TopicInput {
  id: string;
  title: string;
  wikidataId: string;
  isAISuggested: boolean;
  accepted: boolean;
}

/*
  CourseCreator component
  Used to manually create course + topics
  Topics must be selected from Wikidata search
*/
// Note: in production the UI uses CreateCourseModal instead — this component
const CourseCreator: React.FC = () => {
  const [courseTitle, setCourseTitle] = useState("");
  const [topics, setTopics] = useState<TopicInput[]>([]);

  // wikidata search
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<any[]>([]);

  const [loading, setLoading] = useState(false);

  // Generate a temporary frontend-only id for list rendering.
  // This is NOT the database id — it is replaced once the topic is saved.
  const genId = () =>
    Math.random().toString(36).substring(2, 9);


  // Query the backend Wikidata search proxy.
  // Waits for at least 3 characters to avoid unnecessary API calls.
  const searchWiki = async (q: string) => {
    setSearch(q);

    if (q.length < 3) {
      setResults([]);
      return;
    }

    try {
      const res = await axios.get(
        `http://localhost:3000/api/wiki/search?q=${q}`
      );
      setResults(res.data);
    } catch (err) {
      console.log(err);
    }
  };


  // Add a topic from the search results to the local list.
  // item.id is the Wikidata Q-number — must be saved as wikidataId.
  const addTopic = (item: any) => {
    const topic: TopicInput = {
      id: genId(),
      title: item.label,
      wikidataId: item.id,
      isAISuggested: false,
      accepted: true,
    };

    setTopics(prev => [...prev, topic]);
    setResults([]);
    setSearch("");
  };


  // Remove a topic from the local list before the course is saved
  const removeTopic = (id: string) => {
    setTopics(prev =>
      prev.filter(t => t.id !== id)
    );
  };


  // Create the course and all its topics in sequence:
  // 1. POST /api/courses  — creates the course, returns courseId
  // 2. POST /api/topics   — creates one topic per entry, linked by courseId
  const createCourse = async () => {
    if (!courseTitle) return;
    if (topics.length === 0) return;

    try {
      setLoading(true);

      // create course
      const courseRes = await axios.post(
        "http://localhost:3000/api/courses",
        {
          title: courseTitle,
          description: ""
        }
      );

      const courseId = courseRes.data.id;

      // create topics
      for (const topic of topics) {
        await axios.post(
          "http://localhost:3000/api/topics",
          {
            name: topic.title,
            courseId: courseId,
            wikidataId: topic.wikidataId,
            language: "en"
          }
        );
      }
      alert("Course created");

      setCourseTitle("");
      setTopics([]);

    } catch (err) {
      console.log(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      {/* ===== Course title ===== */}
      <h2>Create course</h2>
      <input
        value={courseTitle}
        onChange={e => setCourseTitle(e.target.value)}
        placeholder="Course title"
      />

      {/* ===== Wikidata search ===== */}
      <h3>Search topic</h3>
      <input
        value={search}
        onChange={e => searchWiki(e.target.value)}
        placeholder="Search topic from Wikipedia"
      />

      <div>
        {results.map(r => (
          <div key={r.id}>
            <button
              onClick={() => addTopic(r)}
            >
              {r.label}
            </button>
          </div>
        ))}
      </div>


      {/* ===== Selected topics ===== */}
      <h3>Topics</h3>
      {topics.map(t => (
        <div key={t.id}>
          {t.title}
          <button
            onClick={() => removeTopic(t.id)}
          >
            remove
          </button>
        </div>
      ))}

      {/* ===== Create button ===== */}
      <button
        onClick={createCourse}
        disabled={loading}
      >
        Create course
      </button>
    </div>
  );
};
export default CourseCreator;