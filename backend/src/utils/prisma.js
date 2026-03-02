const { PrismaClient } = require("@prisma/client");

// Wir erstellen eine einzige Instanz des Clients
const prisma = new PrismaClient();

module.exports = prisma;
