const prisma = require("../utils/prisma");
const crypto = require("crypto"); // Built-in Node module for generating random codes
const axios = require("axios");
const { scrapeUrl } = require("../services/scraperService");
const { parsePdf } = require("../services/pdfService");

async function fetchWikiText(wikidataId) {
  try {
    const entityUrl = `https://www.wikidata.org/wiki/Special:EntityData/${wikidataId}.json`;
    const entityRes = await axios.get(entityUrl, { headers: { "User-Agent": "WissenGraph/1.0" } });
    const entity = entityRes.data.entities[wikidataId];
    const wikiTitle = entity.sitelinks?.["enwiki"]?.title || entity.sitelinks?.["dewiki"]?.title;
    if (!wikiTitle) return null;
    const lang = entity.sitelinks?.["enwiki"] ? "en" : "de";
    const wikiUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&titles=${encodeURIComponent(wikiTitle)}&format=json&origin=*`;
    const wikiRes = await axios.get(wikiUrl, { headers: { "User-Agent": "CampNode/1.0" } });
    const pages = wikiRes.data.query.pages;
    const pageId = Object.keys(pages)[0];
    return pages[pageId].extract || null;
  } catch (err) { return null; }
}

// Create a new course
exports.createCourse = async (req, res) => {
  try {
    const { title, description } = req.body;

    // The instructor ID comes from the JWT token via authMiddleware
    // This ensures we know exactly who is making the request
    const instructorId = req.user.userId;

    if (req.user.role !== "PROFESSOR") {
      return res.status(403).json({ error: "Only professors can create courses." });
    }

    // Generate a random 6-character join code (e.g., "A3F9C1")
    const joinCode = crypto.randomBytes(3).toString("hex").toUpperCase();

    const course = await prisma.course.create({
      data: {
        title,
        description,
        joinCode,
        isPublic: req.body.isPublic ?? true,
        instructorId,
      },
    });

    res.status(201).json({ message: "Course created successfully", course });
  } catch (error) {
    res.status(500).json({ error: "Error creating course" });
  }
};

// Fetch all courses
exports.getAllCourses = async (req, res) => {
  try {
    const courses = await prisma.course.findMany({
      // We also fetch instructor details (without fetching their password)
      include: {
        instructor: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
      },
    });

    res.status(200).json(courses);
  } catch (error) {
    console.error("Error fetching courses:", error);
    res.status(500).json({ error: "Error fetching courses" });
  }
};

// Join a course as a student
exports.joinCourse = async (req, res) => {
  try {
    const { joinCode } = req.body;
    const userId = req.user.userId; // From JWT token

    // 1. Find the course by join code (ignore case)
    const course = await prisma.course.findUnique({
      where: { joinCode: joinCode.toUpperCase() },
      // Include students to check if the user is already enrolled
      include: { students: true }
    });

    if (!course) {
      return res.status(404).json({ error: "Course not found with this code." });
    }

    // 2. Check if the user is already enrolled
    const isAlreadyEnrolled = course.students.some(student => student.id === userId);
    
    if (isAlreadyEnrolled) {
      return res.status(400).json({ error: "You are already enrolled in this course." });
    }

    // 3. Add the student to the course (saving the many-to-many relationship in Prisma)
    await prisma.course.update({
      where: { id: course.id },
      data: {
        students: {
          connect: { id: userId }
        }
      }
    });

    res.status(200).json({ message: "Successfully joined the course!", courseId: course.id });
  } catch (error) {
    console.error("Error joining course:", error);
    res.status(500).json({ error: "An error occurred while joining." });
  }
};

// Get a single course with all its related data (topics, students, etc.)
exports.getCourseById = async (req, res) => {
  try {
    const { id } = req.params; // ID from URL, e.g., /api/courses/123
    const course = await prisma.course.findUnique({
      where: { id },
      include: {
        instructor: { select: { id: true, email: true, role: true } },
        topics: {
          where: { parentTopicId: null }, // Only fetch root topics first
          orderBy: { order: 'asc' },
          include: {
            quizzes: {
              orderBy: { createdAt: "desc" }
            },
            subtopics: {
              orderBy: { order: 'asc' },
              include: {
                quizzes: {
                  orderBy: { createdAt: "desc" }
                }
              }
            }
          }
        },
        // Include each student's course-scoped progress so the professor view can reuse existing progress logic.
        students: {
          select: {
            id: true,
            email: true,
            progress: {
              where: {
                topic: {
                  courseId: id,
                }
              },
              select: {
                topicId: true,
                completed: true,
              }
            }
          }
        }
      }
    });

    if (!course) return res.status(404).json({ error: "Course not found" });

    // Map Prisma schema relations to what the frontend expects
    const formattedCourse = {
      ...course,
      topics: course.topics.map(t => ({
        ...t,
        subtopics: t.subtopics || [] // Prevents frontend from crashing on topic.subtopics.map
      }))
    };
    
    res.json(formattedCourse);
  } catch (error) {
    console.error("Error fetching course by ID:", error);
    res.status(500).json({ error: "Error fetching course" });
  }
};

// Update course title, description, and visibility (only for professors)
exports.updateCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, isPublic } = req.body;

    if (req.user.role !== "PROFESSOR") {
      return res.status(403).json({ error: "Only professors can edit courses" });
    }

    const updatedCourse = await prisma.course.update({
      where: { id },
      data: { 
        ...(title !== undefined && { title }), 
        ...(description !== undefined && { description }), 
        ...(isPublic !== undefined && { isPublic }) 
      }
    });

    res.json({ message: "Course updated successfully", course: updatedCourse });
  } catch (error) {
    res.status(500).json({ error: "Error updating course" });
  }
};

// Delete a course - topics remain intact (caching strategy)
exports.deleteCourse = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.role !== "PROFESSOR") {
      return res.status(403).json({ error: "Only professors can delete courses" });
    }

    const course = await prisma.course.findUnique({ where: { id } });

    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    // Ensure users can only delete their own courses
    if (course.instructorId !== req.user.userId) {
      return res.status(403).json({ error: "This is not your course" });
    }

    // Disconnect topics from the course instead of deleting them.
    // This allows quizzes and Wikipedia contents to be reused in future courses!
    await prisma.topic.updateMany({
      where: { courseId: id },
      data: { courseId: null }
    });

    // Now safely delete the course
    await prisma.course.delete({ where: { id } });

    res.json({ message: "Course deleted successfully" });
  } catch (error) {
    console.error("Error deleting course:", error.message);
    res.status(500).json({ error: "Error deleting course" });
  }
};

// Fetch all courses related to the logged-in user (either as Professor or Student)
exports.getMyCourses = async (req, res) => {
  try {
    const userId = req.user.userId;

    const courses = await prisma.course.findMany({
      where: {
        OR: [
          // Courses created by the user (if Professor)
          { instructorId: userId },

          // Courses the user is enrolled in (if Student)
          {
            students: {
              some: {
                id: userId,
              },
            },
          },
        ],
      },
      // Include count summaries for the dashboard UI
      include: {
        _count: {
          select: {
            students: true, 
            topics: true,  
          }
        }
      }
    });

    res.json(courses);
  } catch (err) {
    console.error("getMyCourses failed:", err);
    res.status(500).json({ error: "Failed to load your courses" });
  }
};

// Add a topic or subtopic to a course
exports.addTopic = async (req, res) => {
  try {
    const { name, description, parentTopicId, order, aiSuggested, wikidataId, sourceUrl, articleUrl, videoUrl, podcastUrl } = req.body;
    // Multipart form fields may arrive as strings, so Prisma order must be normalized.
    const normalizedOrder = Number.isFinite(Number(order)) ? Number(order) : 0;
    
    if (req.user.role !== "PROFESSOR") {
      return res.status(403).json({ error: "Only professors can add topics" });
    }

    let content = null;
    // articleUrl stays as an external source pointer only.
    // Uploaded PDFs are parsed to text and are not persisted as files.
    let resolvedArticleUrl = articleUrl || sourceUrl || null;
    if (sourceUrl) {
      content = await scrapeUrl(sourceUrl);
    } else if (req.file) {
      content = await parsePdf(req.file.buffer);
      resolvedArticleUrl = null;
    } else if (wikidataId) {
      console.log("Fetching WikiText on create for:", wikidataId);
      const wikiText = await fetchWikiText(wikidataId);
      if (wikiText) content = wikiText;
    }

    const topic = await prisma.topic.create({
      data: {
        name,
        description,
        courseId: req.params.id,
        parentTopicId: parentTopicId || null,
        order: normalizedOrder,
        aiSuggested: aiSuggested || false,
        wikidataId: wikidataId || null,
        articleUrl: resolvedArticleUrl,
        videoUrl: videoUrl || null,
        podcastUrl: podcastUrl || null,
        content: content,
      },
    });
    
    res.status(201).json(topic);
  } catch (err) {
    console.error("Error creating topic:", err);
    res.status(500).json({ error: "Failed to create topic" });
  }
};

// Update a specific topic (useful for saving podcast/video links and reordering)
exports.updateTopic = async (req, res) => {
  try {
    const { name, description, order, parentTopicId, videoUrl, articleUrl, podcastUrl, aiSuggested, sourceUrl } = req.body;
    // Keep reorder updates numeric for Prisma.
    const normalizedOrder = order !== undefined && Number.isFinite(Number(order)) ? Number(order) : undefined;
    
    if (req.user.role !== "PROFESSOR") {
      return res.status(403).json({ error: "Only professors can edit topics" });
    }

    const currentTopic = await prisma.topic.findUnique({
      where: { id: req.params.topicId }
    });

    let nextContent = currentTopic?.content || undefined;
    let nextArticleUrl = currentTopic?.articleUrl || null;
    if (sourceUrl) {
      nextContent = await scrapeUrl(sourceUrl);
      nextArticleUrl = sourceUrl;
    } else if (req.file) {
      nextContent = await parsePdf(req.file.buffer);
      nextArticleUrl = null;
    } else if (articleUrl !== undefined) {
      nextArticleUrl = articleUrl || null;
    }

    const topic = await prisma.topic.update({
      where: { id: req.params.topicId },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(normalizedOrder !== undefined && { order: normalizedOrder }),
        ...(parentTopicId !== undefined && { parentTopicId }),
        ...(videoUrl !== undefined && { videoUrl }),
        ...((articleUrl !== undefined || sourceUrl !== undefined || req.file) && { articleUrl: nextArticleUrl }),
        ...(podcastUrl !== undefined && { podcastUrl }),
        ...(aiSuggested !== undefined && { aiSuggested }),
        ...(nextContent !== undefined && { content: nextContent }),
      },
    });

    res.json(topic);
  } catch (err) {
    console.error("Error updating topic:", err);
    res.status(500).json({ error: "Failed to update topic" });
  }
};

// Delete a specific topic or subtopic
exports.deleteTopic = async (req, res) => {
  try {
    const { topicId } = req.params;

    if (req.user.role !== "PROFESSOR") {
      return res.status(403).json({ error: "Only professors can delete topics" });
    }

    // Delete the selected topic together with its direct subtopics and dependent records.
    const subtopics = await prisma.topic.findMany({
      where: { parentTopicId: topicId },
      select: { id: true }
    });

    const topicIdsToDelete = [topicId, ...subtopics.map((subtopic) => subtopic.id)];

    await prisma.$transaction([
      prisma.progress.deleteMany({
        where: { topicId: { in: topicIdsToDelete } }
      }),
      prisma.quiz.deleteMany({
        where: { topicId: { in: topicIdsToDelete } }
      }),
      prisma.topic.deleteMany({
        where: { id: { in: topicIdsToDelete } }
      })
    ]);

    res.json({ message: "Topic deleted successfully" });
  } catch (err) {
    console.error("Error deleting topic:", err);
    res.status(500).json({ error: "Failed to delete topic" });
  }
};
