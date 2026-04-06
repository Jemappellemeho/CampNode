// Local uploaded asset helper.
// This service manages teacher-uploaded PDFs stored inside backend/uploads
// and works only with public /uploads/... URLs.

const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const uploadsDir = path.join(__dirname, "../../uploads");

async function storeUploadedPdf(file) {
  if (!file?.buffer) return null;

  // Create the uploads folder on demand for local development.
  await fs.mkdir(uploadsDir, { recursive: true });

  const safeBaseName = (file.originalname || "document.pdf")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-");
  const extension = path.extname(safeBaseName) || ".pdf";
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${extension}`;
  const absolutePath = path.join(uploadsDir, filename);

  await fs.writeFile(absolutePath, file.buffer);

  return `/uploads/${filename}`;
}

async function removeUploadedAsset(assetUrl) {
  if (!assetUrl || typeof assetUrl !== "string" || !assetUrl.startsWith("/uploads/")) {
    return;
  }

  // External links are intentionally ignored here.
  const filename = assetUrl.replace("/uploads/", "");
  if (!filename) return;

  const absolutePath = path.join(uploadsDir, filename);
  try {
    await fs.unlink(absolutePath);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

module.exports = { storeUploadedPdf, removeUploadedAsset };
