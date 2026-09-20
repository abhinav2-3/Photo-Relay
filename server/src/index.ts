import express, { Request, Response } from "express";
import http from "http";
import { Server, Socket } from "socket.io";
import multer from "multer";
import cors from "cors";
import fs from "fs";
import path from "path";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 5000;
const UPLOAD_TOKEN = process.env.UPLOAD_TOKEN as string;
const UPLOAD_DIR = path.join(__dirname, "..", "uploads");

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

app.use(cors());

let receiverSocket: Socket | null = null;

io.on("connection", (socket) => {
  receiverSocket = socket;
  socket.on("disconnect", () => {
    if (receiverSocket?.id === socket.id) receiverSocket = null;
  });
});

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/", "video/"];
    if (allowed.some((type) => file.mimetype.startsWith(type))) cb(null, true);
    else cb(new Error("Only image/video files allowed"));
  },
});

const uploadLimiter = rateLimit({ windowMs: 60 * 1000, max: 10 });

app.get("/upload/:token", (req: Request, res: Response) => {
  if (req.params.token !== UPLOAD_TOKEN) {
    return res.status(404).send("Not found");
  }
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <title>Send Media</title>
      <style>
        * { box-sizing: border-box; }
        html, body {
          height: 100%;
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          background: linear-gradient(160deg, #eef2ff 0%, #f8fafc 100%);
        }
        body {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px 16px;
          padding-top: max(24px, env(safe-area-inset-top));
          padding-bottom: max(24px, env(safe-area-inset-bottom));
        }
        .card {
          background: #fff;
          padding: 28px 22px;
          border-radius: 20px;
          width: 100%;
          max-width: 380px;
          box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
        }
        .icon {
          width: 52px;
          height: 52px;
          border-radius: 14px;
          background: #eef2ff;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 16px;
          font-size: 24px;
        }
        h2 { margin: 0 0 4px; font-size: 19px; color: #0f172a; }
        p.sub { margin: 0 0 20px; font-size: 13px; color: #64748b; }

        .drop-zone {
          border: 2px dashed #c7d2fe;
          border-radius: 14px;
          padding: 22px 14px;
          text-align: center;
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s;
          position: relative;
        }
        .drop-zone.has-file { border-style: solid; border-color: #2563eb; background: #f5f7ff; }
        .drop-zone input[type="file"] {
          position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%;
        }
        .drop-zone .placeholder { color: #64748b; font-size: 14px; }
        .drop-zone .placeholder strong { color: #2563eb; }

        .preview { margin-top: 14px; display: none; }
        .preview img, .preview video {
          width: 100%; max-height: 220px; object-fit: cover; border-radius: 12px; display: block;
        }
        .file-name { margin-top: 8px; font-size: 12px; color: #475569; word-break: break-all; }

        button {
          width: 100%;
          padding: 14px;
          background: #2563eb;
          color: #fff;
          border: none;
          border-radius: 12px;
          font-size: 15px;
          font-weight: 600;
          margin-top: 18px;
          cursor: pointer;
          transition: background 0.15s;
        }
        button:disabled { background: #cbd5e1; cursor: not-allowed; }
        button:active:not(:disabled) { background: #1d4ed8; }

        .progress-wrap {
          display: none;
          background: #e5e7eb;
          border-radius: 8px;
          height: 8px;
          margin-top: 16px;
          overflow: hidden;
        }
        .progress-bar { height: 100%; width: 0%; background: #2563eb; transition: width 0.15s; }
        .percent { text-align: right; font-size: 12px; color: #64748b; margin-top: 4px; }

        .status { margin-top: 12px; font-size: 14px; text-align: center; font-weight: 500; }
        .status.success { color: #16a34a; }
        .status.error { color: #dc2626; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="icon">📤</div>
        <h2>Send a Photo or Video</h2>
        <p class="sub">Choose a file below, it'll be delivered privately.</p>

        <div class="drop-zone" id="dropZone">
          <input type="file" id="fileInput" accept="image/*,video/*" />
          <div class="placeholder" id="placeholder"><strong>Tap to choose</strong> a photo or video</div>
        </div>

        <div class="preview" id="preview">
          <div class="file-name" id="fileName"></div>
        </div>

        <button id="sendBtn" disabled>Send</button>

        <div class="progress-wrap" id="progressWrap">
          <div class="progress-bar" id="progressBar"></div>
        </div>
        <div class="percent" id="percent"></div>
        <div class="status" id="status"></div>
      </div>

      <script>
        const fileInput = document.getElementById('fileInput');
        const dropZone = document.getElementById('dropZone');
        const placeholder = document.getElementById('placeholder');
        const preview = document.getElementById('preview');
        const fileName = document.getElementById('fileName');
        const sendBtn = document.getElementById('sendBtn');
        const progressWrap = document.getElementById('progressWrap');
        const progressBar = document.getElementById('progressBar');
        const percent = document.getElementById('percent');
        const status = document.getElementById('status');

        fileInput.addEventListener('change', () => {
          const file = fileInput.files[0];
          if (!file) return;

          dropZone.classList.add('has-file');
          placeholder.innerHTML = '<strong>' + file.name + '</strong> selected';
          fileName.textContent = (file.size / (1024 * 1024)).toFixed(2) + ' MB';
          preview.style.display = 'block';
          sendBtn.disabled = false;
          status.textContent = '';
          progressWrap.style.display = 'none';
          progressBar.style.width = '0%';
          percent.textContent = '';
        });

        sendBtn.addEventListener('click', () => {
          const file = fileInput.files[0];
          if (!file) {
            status.textContent = 'Please choose a file first';
            status.className = 'status error';
            return;
          }

          const formData = new FormData();
          formData.append('media', file);

          const xhr = new XMLHttpRequest();
          xhr.open('POST', '/upload/${req.params.token}');

          sendBtn.disabled = true;
          status.textContent = '';
          status.className = 'status';
          progressWrap.style.display = 'block';
          progressBar.style.width = '0%';

          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
              const pct = Math.round((e.loaded / e.total) * 100);
              progressBar.style.width = pct + '%';
              percent.textContent = pct + '%';
            }
          });

          xhr.onload = () => {
            if (xhr.status === 200) {
              status.textContent = 'Sent successfully ✓';
              status.className = 'status success';
              progressBar.style.width = '100%';
              percent.textContent = '100%';
              fileInput.value = '';
              placeholder.innerHTML = '<strong>Tap to choose</strong> a photo or video';
              dropZone.classList.remove('has-file');
              sendBtn.disabled = true;
            } else {
              sendBtn.disabled = false;
              status.textContent = 'Upload failed';
              status.className = 'status error';
            }
          };

          xhr.onerror = () => {
            sendBtn.disabled = false;
            status.textContent = 'Upload failed';
            status.className = 'status error';
          };

          xhr.send(formData);
        });
      </script>
    </body>
    </html>
  `);
});

app.post(
  "/upload/:token",
  uploadLimiter,
  upload.single("media"),
  (req: Request, res: Response) => {
    if (req.params.token !== UPLOAD_TOKEN) {
      return res.status(404).send("Not found");
    }
    if (!req.file) {
      return res.status(400).send("No file uploaded");
    }

    const filePath = req.file.path;
    const originalName = req.file.originalname;
    const mimeType = req.file.mimetype;

    fs.readFile(filePath, (err, data) => {
      if (err) {
        return res.status(500).send("Failed to read file");
      }

      if (!receiverSocket) {
        fs.unlink(filePath, () => { });
        return res.status(503).send("Receiver not online, try again later");
      }

      receiverSocket.emit("new-media", {
        filename: originalName,
        mimeType,
        data: data.toString("base64"),
      });

      fs.unlink(filePath, () => { });
      res.send("Uploaded successfully");
    });
  }
);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});