const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../utils/prisma");

// User Registration Logic
exports.register = async (req, res) => {
  try {
    const { email, password, role } = req.body;

    // 1. Check if the user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: "Email already taken" });
    }

    // 2. Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 3. Save the new user to the database
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        role: role || "STUDENT",
      },
    });

    res.status(201).json({ message: "User successfully created", userId: user.id });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Failed to register user", details: error.message, stack: error.stack });
  }
};

// User Login Logic
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Find the user
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    
    // 2. Compare passwords
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // 3. Generate a JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || "supersecret", 
      { expiresIn: "7d" }
    );
    
    res.json({
      message: "Login successful",
      token,
      user: { id: user.id, email: user.email, role: user.role, name: user.name }
    });
  } catch (error) {
    res.status(500).json({ error: "Login failed", details: error.message });
  }
};