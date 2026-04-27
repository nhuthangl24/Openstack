/**
 * SSH WebSocket Proxy Server — chạy song song với Next.js
 * Port 3001, nhận WebSocket → proxy tới SSH của VM
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { WebSocketServer, WebSocket } from "ws";
import { Client, type ClientChannel } from "ssh2";

const PORT = parseInt(process.env.SSH_WS_PORT || "3001", 10);
const wss = new WebSocketServer({ port: PORT });

console.log(`🔌 SSH WebSocket proxy listening on ws://0.0.0.0:${PORT}`);

wss.on("connection", (ws: WebSocket) => {
  let sshClient: Client | null = null;
  let shellStream: ClientChannel | null = null;
  let initialized = false;
  const inputBuffer: Buffer[] = [];

  // ── Nhận message đầu tiên: JSON với host, username, password, cols, rows
  const onInit = (raw: Buffer) => {
    let host = "", username = "ubuntu", password = "", cols = 80, rows = 24;
    try {
      const init = JSON.parse(raw.toString()) as {
        host?: string;
        username?: string;
        password?: string;
        cols?: number | string;
        rows?: number | string;
      };
      host     = (init.host     || "").trim();
      username = (init.username || "ubuntu").trim();
      password = (init.password || "").trim();
      cols     = parseInt(String(init.cols ?? "")) || 80;
      rows     = parseInt(String(init.rows ?? "")) || 24;
    } catch {
      sendText(ws, "\r\n\x1b[31m❌ Invalid init payload\x1b[0m\r\n");
      ws.close();
      return;
    }

    if (!host) {
      sendText(ws, "\r\n\x1b[31m❌ No host specified\x1b[0m\r\n");
      ws.close();
      return;
    }

    sendText(ws, `\r\n\x1b[90mConnecting to \x1b[0m\x1b[36m${username}@${host}\x1b[90m...\x1b[0m\r\n`);

    sshClient = new Client();

    sshClient.on("ready", () => {
      sendText(ws, `\x1b[32m✓ Connected\x1b[0m\r\n\r\n`);
      sshClient!.shell({ term: "xterm-256color", cols, rows }, (err, stream) => {
        if (err) {
          sendText(ws, `\r\n\x1b[31m❌ Shell error: ${err.message}\x1b[0m\r\n`);
          ws.close();
          return;
        }
        shellStream = stream;
        initialized = true;
        inputBuffer.forEach(b => stream.write(b));
        inputBuffer.length = 0;

        stream.on("data", (data: Buffer) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(data);
        });
        stream.stderr.on("data", (data: Buffer) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(data);
        });
        stream.on("close", () => {
          sendText(ws, "\r\n\x1b[33mSession closed.\x1b[0m\r\n");
          ws.close();
        });
      });
    });

    sshClient.on("error", (err: Error) => {
      sendText(ws, `\r\n\x1b[31m❌ SSH Error: ${err.message}\x1b[0m\r\n`);
      ws.close();
    });

    sshClient.connect({
      host,
      port: 22,
      username,
      password,
      readyTimeout: 15000,
      algorithms: {
        serverHostKey: ["ssh-rsa", "ecdsa-sha2-nistp256", "ssh-ed25519"],
      },
    });

    // Subsequent messages = terminal input or resize
    ws.off("message", onInit);
    ws.on("message", (msg: Buffer) => {
      try {
        const ctrl = JSON.parse(msg.toString()) as {
          type?: string;
          rows?: number;
          cols?: number;
        };
        if (ctrl.type === "resize" && shellStream) {
          shellStream.setWindow(ctrl.rows ?? rows, ctrl.cols ?? cols, 0, 0);
        }
        return;
      } catch { /* not JSON = terminal data */ }

      if (initialized && shellStream) {
        shellStream.write(msg);
      } else {
        inputBuffer.push(msg);
      }
    });
  };

  ws.once("message", onInit);

  ws.on("close", () => {
    if (shellStream) try { shellStream.close(); } catch {}
    if (sshClient)  try { sshClient.end();     } catch {}
  });

  ws.on("error", () => {
    if (sshClient) try { sshClient.end(); } catch {}
  });
});

function sendText(ws: WebSocket, text: string) {
  if (ws.readyState === WebSocket.OPEN) ws.send(Buffer.from(text));
}
