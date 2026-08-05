import multer from "multer";
import {
  listDownloadsFolderFilesService,
  uploadToDownloadsFolderService,
  deleteFromDownloadsFolderService,
} from "../services/downloadsFolder.service.js";

export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 },
}).single("file");

export async function listDownloadsFolderController(req, res) {
  const items = await listDownloadsFolderFilesService();
  res.json({ items });
}

export async function uploadDownloadsFolderController(req, res) {
  const file = await uploadToDownloadsFolderService({
    buffer: req.file?.buffer,
    originalName: req.file?.originalname,
  });
  res.status(201).json(file);
}

export async function deleteDownloadsFolderController(req, res) {
  await deleteFromDownloadsFolderService(req.params.fileName);
  res.json({ success: true });
}
