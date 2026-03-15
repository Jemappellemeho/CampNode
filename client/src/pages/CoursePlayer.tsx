import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import axios from "axios";

export default function CoursePlayer() {

  const { courseId } = useParams();

  const [course, setCourse] = useState<any>(null);
  const [topics, setTopics] = useState<any[]>([]);
  const [content, setContent] = useState<string>("");

  const token = localStorage.getItem("token");

  useEffect(() => {
    loadCourse();
  }, []);

  const loadCourse = async () => {

    const res = await axios.get(
      `http://localhost:3000/api/courses/${courseId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    setCourse(res.data);
    setTopics(res.data.topics);
  };

  const loadContent = async (topicId: string) => {

    const res = await axios.get(
      `http://localhost:3000/api/topics/${topicId}/content`
    );

    setContent(res.data.content);
  };

  if (!course) return <div>Loading...</div>;

  return (
    <div style={{ display: "flex", height: "100vh" }}>

      {/* LEFT — topics */}

      <div style={{
        width: 300,
        borderRight: "1px solid #ddd",
        padding: 10
      }}>

        <h3>{course.title}</h3>

        {topics.map(t => (
          <div
            key={t.id}
            style={{
              padding: 10,
              cursor: "pointer",
              borderBottom: "1px solid #eee"
            }}
            onClick={() => loadContent(t.id)}
          >
            {t.name}
          </div>
        ))}

      </div>

      {/* RIGHT — article */}

      <div style={{
        flex: 1,
        padding: 20,
        overflow: "auto"
      }}>

        <h2>Article</h2>

        <p style={{ whiteSpace: "pre-wrap" }}>
          {content}
        </p>
      </div>
    </div>
  );
}