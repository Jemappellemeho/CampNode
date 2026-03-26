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
  sourceUrl?: string; 
  file?: File; 

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

  // State für die DBpedia-Vorschläge (wird gefüllt, sobald ein Hauptthema gewählt wird)
  const [suggestions, setSuggestions] = useState<any[]>([]);


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
// Fügt ein Thema zur Liste hinzu und fragt DBpedia nach verwandten Unterthemen
const addTopic = async (item: any) => {
  const topic: TopicInput = {
    id: genId(),
    title: item.label,
    wikidataId: item.id,
    isAISuggested: false,
    accepted: true,
  };

  // Thema zur lokalen Liste der ausgewählten Themen hinzufügen
  setTopics(prev => [...prev, topic]);
  setResults([]);
  setSearch("");

  // Wenn das Thema eine Wikidata-ID hat (aus der Suche), suchen wir passende Unterthemen
  if (item.id) {
    try {
      const res = await axios.get(`http://localhost:3000/api/wiki/suggestions/${item.id}`);
      setSuggestions(res.data);
    } catch (err) {
      console.log("Fehler bei Vorschlägen:", err);
    }
  }
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
  // createCourse: Erstellt den Kurs und danach alle Themen nacheinander.
  // Da wir PDFs hochladen, nutzen wir FormData (Multipart/Form-Data).
  const createCourse = async () => {
    if (!courseTitle) return;
    if (topics.length === 0) return;

    try {
      setLoading(true);

      // Token aus dem LocalStorage holen (wurde beim Login gespeichert)
      const token = localStorage.getItem('token');
      if (!token) {
        alert("Bitte logge dich zuerst ein.");
        return;
      }

      // Gemeinsamer Header für die Authentifizierung
      const authHeaders = { Authorization: `Bearer ${token}` };

      // 1. Kurs erstellen (Metadaten)
      const courseRes = await axios.post(
        "http://localhost:3000/api/courses",
        {
          title: courseTitle,
          description: ""
        },
        { headers: authHeaders } // Token mitschicken!
      );

      const courseId = courseRes.data.course.id;

      // 2. Themen erstellen (jedes Thema einzeln senden)
      for (const topic of topics) {
        const formData = new FormData();
        formData.append("name", topic.title);
        formData.append("courseId", courseId);
        
        if (topic.wikidataId) formData.append("wikidataId", topic.wikidataId);
        if (topic.sourceUrl) formData.append("sourceUrl", topic.sourceUrl);
        if (topic.file) formData.append("file", topic.file);

        // POST-Request mit Token UND Multipart-Header
        await axios.post(
          "http://localhost:3000/api/topics",
          formData,
          { 
            headers: { 
              ...authHeaders, 
              "Content-Type": "multipart/form-data" 
            } 
          }
        );
      }
      
      alert("Kurs erfolgreich mit allen Quellen erstellt!");

      setCourseTitle("");
      setTopics([]);

    } catch (err: any) {
      console.error("Fehler beim Erstellen des Kurses:", err.response?.data || err.message);
      alert("Fehler beim Speichern: " + (err.response?.data?.error || "Siehe Konsole"));
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

        {/* Sektion für DBpedia-Vorschläge: Erscheint nur, wenn Daten vorhanden sind */}
        {suggestions.length > 0 && (
  <div style={{ background: '#f0f0f0', padding: '15px', marginTop: '10px', borderRadius: '12px', border: '1px solid #ccc' }}>
    <h4 style={{ marginTop: 0 }}>💡 Vorgeschlagene Unterthemen (DBpedia):</h4>
    <p style={{ fontSize: '0.9em', color: '#666' }}>Klicke auf ein Thema, um es deiner Roadmap hinzuzufügen.</p>
    {suggestions.map((sug, idx) => (
      <button 
        key={idx} 
        onClick={() => {
          // Vorschlag als neues Thema hinzufügen
          addTopic({ label: sug.label, id: '' }); 
          // Aus der Vorschlagliste entfernen, da es jetzt ausgewählt ist
          setSuggestions(prev => prev.filter(s => s.uri !== sug.uri));
        }}
        style={{ 
          margin: '5px', 
          padding: '8px 12px', 
          cursor: 'pointer',
          borderRadius: '20px',
          border: '1px solid #007bff',
          backgroundColor: 'white',
          color: '#007bff'
        }}
      >
        + {sug.label}
      </button>
    ))}
  </div>
  )}

        

      {/* ===== Selected topics ===== */}
      <h3>Topics</h3>
      {topics.map(t => (
        <div key={t.id}>
          {t.title}
          {/* In der topics.map Schleife vor dem 'remove' Button einfügen */}
          <div style={{ padding: '10px', borderLeft: '3px solid #007bff', margin: '10px 0' }}>
            <input 
              placeholder="Web-Link hinzufügen (optional)" 
              style={{ display: 'block', marginBottom: '5px', width: '100%' }}
              onChange={(e) => {
                const val = e.target.value;
                setTopics(prev => prev.map(topic => topic.id === t.id ? { ...topic, sourceUrl: val } : topic));
              }}
            />
            <input 
              type="file" 
              accept="application/pdf"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setTopics(prev => prev.map(topic => topic.id === t.id ? { ...topic, file } : topic));
                }
              }}
            />
          </div>
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