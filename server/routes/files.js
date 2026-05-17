import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';

export const filesRouter = express.Router();
const uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR || './data/uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${crypto.randomUUID()}-${safe}`);
  },
});
const upload = multer({ storage });

filesRouter.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({ file_url: fileUrl, url: fileUrl, filename: req.file.originalname, size: req.file.size });
});
