const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const courseController = require("../controllers/courseController");
const { verifyToken } = require("../middleware/authMiddleware");
const multer = require("multer");

const upload = multer({ storage: multer.memoryStorage() });

// B11: throttle join-by-code attempts. The join code is only 6 hex chars (~24 bits),
// so without a limiter it could be brute-forced. Max 20 attempts per 15 min per IP.
const joinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Too many join attempts. Please try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Route: POST /api/courses
// Create a new course (Protected by verifyToken middleware)
router.post("/", verifyToken, courseController.createCourse);

// Route: GET /api/courses/me
// Get all courses that the logged-in user is involved in
router.get("/me", verifyToken, courseController.getMyCourses);

// Route: GET /api/courses
// Get a list of all courses
router.get("/", verifyToken, courseController.getAllCourses);

// Route: GET /api/courses/public
// Get public courses for the discovery page
router.get("/public", verifyToken, courseController.getPublicCourses);

// Route: POST /api/courses/join
// Join a course using a unique join code
router.post("/join", verifyToken, joinLimiter, courseController.joinCourse);

// Route: POST /api/courses/:id/join-public
// Join a public course directly from the discovery page
router.post("/:id/join-public", verifyToken, courseController.joinPublicCourse);

// Route: POST /api/courses/:id/leave-public
// Leave a public course from the dashboard
router.post("/:id/leave-public", verifyToken, courseController.leavePublicCourse);

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
router.post("/:id/topics", verifyToken, upload.single("pdf"), courseController.addTopic);

// Route: PUT /api/courses/:id/topics/:topicId
// Update an existing topic (name, links, order, etc)
router.put("/:id/topics/:topicId", verifyToken, upload.single("pdf"), courseController.updateTopic);

// Route: DELETE /api/courses/:id/topics/:topicId
// Delete a specific topic or subtopic
router.delete("/:id/topics/:topicId", verifyToken, courseController.deleteTopic);

module.exports = router;
