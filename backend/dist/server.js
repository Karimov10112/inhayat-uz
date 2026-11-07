"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const supabase_js_1 = require("@supabase/supabase-js");
const cors_1 = __importDefault(require("cors"));
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const node_crypto_1 = require("node:crypto");
const PORT = Number(process.env.PORT || 4000);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
const app = (0, express_1.default)();
app.use((0, cors_1.default)({ origin: process.env.FRONTEND_ORIGIN || "http://localhost:3000" }));
app.use(express_1.default.json({ limit: "32kb" }));
function config(name) {
    const value = process.env[name];
    if (!value)
        throw new Error(`${name} is not configured.`);
    return value;
}
function supabase() {
    return (0, supabase_js_1.createClient)(config("NEXT_PUBLIC_SUPABASE_URL"), config("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
        auth: { persistSession: false, autoRefreshToken: false },
    });
}
function r2() {
    return new client_s3_1.S3Client({
        region: "auto",
        endpoint: `https://${config("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: config("R2_ACCESS_KEY_ID"), secretAccessKey: config("R2_SECRET_ACCESS_KEY") },
    });
}
async function authenticatedUser(request) {
    const header = request.header("authorization");
    if (!header?.startsWith("Bearer "))
        return null;
    const { data: { user } } = await supabase().auth.getUser(header.slice(7));
    return user;
}
function validDocument(bytes, mime) {
    if (!bytes.length || bytes.length > MAX_UPLOAD_BYTES)
        return false;
    if (mime === "application/pdf")
        return bytes.slice(0, 5).every((value, index) => value === [0x25, 0x50, 0x44, 0x46, 0x2d][index]);
    if (mime === "image/jpeg")
        return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (mime === "image/png")
        return [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
    return false;
}
app.get("/health", (_request, response) => response.json({ ok: true, service: "lifebridge-backend" }));
app.post("/api/documents/upload", async (request, response) => {
    try {
        const user = await authenticatedUser(request);
        if (!user)
            return response.status(401).json({ error: "Autentifikatsiya talab qilinadi." });
        const { fileName, fileType, fileSize } = request.body || {};
        if (typeof fileName !== "string" || !fileName.trim() || fileName.length > 240 || !ALLOWED_TYPES.has(fileType) || !Number.isInteger(fileSize) || fileSize <= 0 || fileSize > MAX_UPLOAD_BYTES) {
            return response.status(400).json({ error: "Faqat PDF, JPG yoki PNG va 10 MB gacha bo‘lgan fayllar qabul qilinadi." });
        }
        const objectKey = `patients/${user.id}/${(0, node_crypto_1.randomUUID)()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const uploadUrl = await (0, s3_request_presigner_1.getSignedUrl)(r2(), new client_s3_1.PutObjectCommand({ Bucket: config("R2_BUCKET"), Key: objectKey, ContentType: fileType, ContentLength: fileSize }), { expiresIn: 300 });
        return response.json({ uploadUrl, objectKey, expiresIn: 300 });
    }
    catch (error) {
        console.error("Document upload signing failed", error instanceof Error ? error.message : error);
        return response.status(500).json({ error: "Yuklash havolasini yaratib bo‘lmadi." });
    }
});
app.post("/api/documents/complete", async (request, response) => {
    try {
        const user = await authenticatedUser(request);
        if (!user)
            return response.status(401).json({ error: "Hisobingizga kiring." });
        const { objectKey, caseId, originalName } = request.body || {};
        if (typeof objectKey !== "string" || objectKey.length > 500 || !objectKey.startsWith(`patients/${user.id}/`) || typeof caseId !== "string" || !/^[0-9a-f-]{36}$/i.test(caseId) || typeof originalName !== "string" || !originalName.trim() || originalName.length > 240) {
            return response.status(400).json({ error: "Hujjat ma’lumotlari noto‘g‘ri." });
        }
        const client = supabase();
        const { data: ownedCase } = await client.from("cases").select("id").eq("id", caseId).eq("patient_id", user.id).maybeSingle();
        if (!ownedCase)
            return response.status(404).json({ error: "Yo‘l xaritasi topilmadi." });
        const target = { Bucket: config("R2_BUCKET"), Key: objectKey };
        const head = await r2().send(new client_s3_1.HeadObjectCommand(target));
        if (!head.ContentLength || head.ContentLength > MAX_UPLOAD_BYTES)
            return response.status(400).json({ error: "Fayl hajmi ruxsat etilmagan." });
        const prefix = await r2().send(new client_s3_1.GetObjectCommand({ ...target, Range: "bytes=0-15" }));
        const bytes = await prefix.Body?.transformToByteArray();
        if (!bytes || !validDocument(bytes, head.ContentType || ""))
            return response.status(400).json({ error: "Fayl mazmuni ruxsat etilgan formatga mos emas." });
        const { error } = await client.from("medical_documents").insert({ case_id: caseId, patient_id: user.id, kind: "lab_result", r2_object_key: objectKey, original_name: originalName, mime_type: head.ContentType, bytes: head.ContentLength });
        if (error)
            return response.status(409).json({ error: "Hujjat saqlanmadi. Qayta urinib ko‘ring." });
        return response.json({ saved: true });
    }
    catch (error) {
        console.error("Document completion failed", error instanceof Error ? error.message : error);
        return response.status(500).json({ error: "Hujjatni tekshirib bo‘lmadi. Qayta urinib ko‘ring." });
    }
});
app.listen(PORT, () => console.log(`LifeBridge backend listening on http://localhost:${PORT}`));
