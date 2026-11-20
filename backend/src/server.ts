import "dotenv/config";
import { createApp } from "./app.js";

const PORT = Number(process.env.PORT || 4000);
const { app, mode, system, demo } = createApp();

const server = app.listen(PORT, process.env.BIND_HOST || "127.0.0.1", () => {
  console.log(`InHayat backend: http://localhost:${PORT}`);
  console.log(`  rejim: ${mode} · fayllar: ${system.storage} · admin monitor: ${system.aiProvider}`);
});
server.headersTimeout = 10000;
server.requestTimeout = 30000;
server.keepAliveTimeout = 5000;
server.maxRequestsPerSocket = 200;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => server.close(() => { demo.flush(); process.exit(0); }));
}
