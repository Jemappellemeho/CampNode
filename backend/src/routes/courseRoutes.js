const express = require("express");
const router = express.Router();
const courseController = require("../controllers/courseController");
const { verifyToken } = require("../middleware/authMiddleware");

// Route: POST /api/courses
// Create a new course (Protected by verifyToken middleware)
router.post("/", verifyToken, courseController.createCourse);

// Route: GET /api/courses/me
// Get all courses that the logged-in user is involved in
router.get("/me", verifyToken, courseController.getMyCourses);

// Route: GET /api/courses
// Get a list of all courses
router.get("/", verifyToken, courseController.getAllCourses);

// Route: POST /api/courses/join
// Join a course using a unique join code
router.post("/join", verifyToken, courseController.joinCourse);

// Route: GET /api/courses/:id
// Get full details of a single course
router.get("/:id", verifyToken, courseController.getCourseById);

// Route: PUT /api/courses/:id
// Update course details (title, description, visibility)
router.put("/:id", verifyToken, courseController.updateCourse);

// Route: DELETE /api/courses/:id
// Delete a course
router.delete("/:id", verifyToken, courseController.deleteCourse);

// Route: POST /api/courses/:id/topics
// Add a new topic or subtopic to the course
router.post("/:id/topics", verifyToken, courseController.addTopic);

// Route: PUT /api/courses/:id/topics/:topicId
// Update an existing topic (name, links, order, etc)
router.put("/:id/topics/:topicId", verifyToken, courseController.updateTopic);

module.exports = router;
