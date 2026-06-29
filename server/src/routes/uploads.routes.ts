import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { env } from '../config/env';
import { snowflake } from '../utils/snowflake';
import { requireAuth } from '../middleware/auth.middleware';

const MAX_SIZE = 25 * 1024 * 1024; // 25 MB

// Executable / dangerous extensions are hard-rejected (spec §8/§12).
const BLOCKED_EXT = new Set([
  '.exe', '.bat', '.cmd', '.sh', '.msi', '.com', '.scr', '.js', '.jar', '.app',
  '.dll', '.vbs', '.ps1', '.deb', '.rpm', '.bin', '.cpl', '.gadget',
]);

const ALLOWED_MIME_PREFIXES = ['image/', 'video/mp4', 'application/pdf', 'audio/'];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, env.UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${snowflake()}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (BLOCKED_EXT.has(ext)) return cb(new Error('File type not allowed'));
    const mime = file.mimetype;
    const allowed =
      ALLOWED_MIME_PREFIXES.some((p) => mime.startsWith(p)) ||
      mime === 'application/octet-stream'; // generic fallback, ext already checked
    if (!allowed) return cb(new Error('Mime type not allowed'));
    cb(null, true);
  },
});

export function fileUrl(filename: string): string {
  return `/uploads/${filename}`;
}

const router = Router();

// Generic attachment upload endpoint; returns a URL to reference in message:send.
// Channel-scoped ATTACH_FILES permission is enforced at message-send time.
router.post('/channels/:id/attachments', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  res.json({
    url: fileUrl(req.file.filename),
    filename: req.file.originalname,
    size_bytes: req.file.size,
    mime_type: req.file.mimetype,
  });
});

export default router;
