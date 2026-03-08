const express = require("express");
const router = express.Router();
const courseController = require("../controllers/courseController");
const { verifyToken } = require("../middleware/authMiddleware");

// Route: POST /api/courses
// WICHTIG: Hier stecken wir "verifyToken" dazwischen!
router.post("/", verifyToken, courseController.createCourse);

// Route: GET /api/courses (Alle Kurse abrufen, nur für eingeloggte User)
router.get("/", verifyToken, courseController.getAllCourses);

// Route: POST /api/courses/join (Kurs mit Code beitreten)
router.post("/join", verifyToken, courseController.joinCourse);




module.exports = router;
