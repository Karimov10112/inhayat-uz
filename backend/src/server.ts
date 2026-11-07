import "dotenv/config";
import { createApp } from "./app.js";

const PORT = Number(process.env.PORT || 4000);
const { app, mode, store, system } = createApp();

app.listen(PORT, () => {
  console.log(`InHayat backend: http://localhost:${PORT}`);
  console.log(`  ma’lumotlar: ${mode === "demo" ? "DEMO (backend/.demo-data/db.json)" : "Supabase"} · fayllar: ${store.kind} · AI: ${system.aiProvider}`);
});
