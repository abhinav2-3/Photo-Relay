import { io } from "socket.io-client";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const SERVER_URL = process.env.SERVER_URL as string;
const SAVE_DIR = process.env.SAVE_DIR || "./received";

if (!fs.existsSync(SAVE_DIR)) fs.mkdirSync(SAVE_DIR, { recursive: true });

const socket = io(SERVER_URL);

socket.on("connect", () => {
  console.log("Connected to server:", socket.id);
});

socket.on("new-media", (payload: { filename: string; mimeType: string; data: string }) => {
  const buffer = Buffer.from(payload.data, "base64");
  const timestamp = Date.now();
  const ext = path.extname(payload.filename) || "";
  const savePath = path.join(SAVE_DIR, `${timestamp}${ext}`);

  fs.writeFile(savePath, buffer, (err) => {
    if (err) {
      console.error("Failed to save file:", err);
      return;
    }
    console.log("Saved:", savePath);
  });
});

socket.on("disconnect", () => {
  console.log("Disconnected from server. Retrying...");
});
