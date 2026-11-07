// End-to-end tests of the demo API: patient -> doctor -> admin -> AI agent.
// Run: npm test (from backend/)
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createApp } from "../src/app.js";
import { AnthropicProvider, OfflineProvider } from "../src/agent/providers.js";
import { DEMO_ACCOUNTS, demoPdf } from "../src/repo/demo-seed.js";

const dir = mkdtempSync(join(tmpdir(), "inhayat-test-"));
const env = { FRONTEND_ORIGIN: "http://localhost:3000" } as NodeJS.ProcessEnv;
const { app } = createApp({ env, dataDir: dir, provider: new OfflineProvider() });
let base = "";
let server: ReturnType<typeof app.listen>;

before(async () => { server = app.listen(0); await new Promise(r => server.once("listening", r)); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
after(() => { server.close(); rmSync(dir, { recursive: true, force: true }); });

async function call(path: string, init: { method?: string; token?: string; body?: unknown } = {}) {
  const res = await fetch(base + path, { method: init.method ?? (init.body ? "POST" : "GET"), headers: { "content-type": "application/json", ...(init.token ? { authorization: `Bearer ${init.token}` } : {}) }, body: init.body ? JSON.stringify(init.body) : undefined });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}
const login = async (body: object) => { const r = await call("/api/auth/demo/login", { body }); assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data.token as string; };

async function upload(token: string, caseId: string, name: string, content: Buffer, type = "application/pdf") {
  const signed = await call("/api/documents/upload", { token, body: { fileName: name, fileType: type, fileSize: content.length } });
  assert.equal(signed.status, 200);
  const put = await fetch(base + signed.data.uploadUrl, { method: "PUT", headers: { "content-type": type }, body: content });
  assert.equal(put.status, 200);
  return call("/api/documents/complete", { token, body: { caseId, objectKey: signed.data.objectKey, originalName: name, kind: "lab_result" } });
}

test("demo config exposes demo accounts", async () => {
  const r = await call("/api/config");
  assert.equal(r.data.mode, "demo");
  assert.equal(r.data.demoAccounts.patient.phone, DEMO_ACCOUNTS.patient.phone);
});

test("rejects missing or forged tokens", async () => {
  assert.equal((await call("/api/me")).status, 401);
  const token = await login({ phone: DEMO_ACCOUNTS.patient.phone, password: DEMO_ACCOUNTS.patient.password });
  assert.equal((await call("/api/me", { token: token.slice(0, -2) + "xx" })).status, 401);
  assert.equal((await call("/api/auth/demo/login", { body: { phone: DEMO_ACCOUNTS.patient.phone, password: "wrong" } })).status, 401);
});

test("full flow: patient shares with doctor, doctor works, patient revokes", async () => {
  // New patient registers and creates a case
  const reg = await call("/api/auth/demo/register", { body: { phone: "+998991112233", password: "Parol1234" } });
  assert.equal(reg.status, 200);
  const patient = reg.data.token as string;
  assert.equal((await call("/api/auth/demo/register", { body: { phone: "+998991112233", password: "Parol1234" } })).status, 409);
  assert.equal((await call("/api/patient/profile", { method: "PUT", token: patient, body: { full_name: "Sinov Bemor", region: "Navoiy" } })).data.full_name, "Sinov Bemor");
  const created = await call("/api/cases", { token: patient, body: { pathway: "kidney", region: "Navoiy" } });
  assert.equal(created.status, 200);
  const caseId = created.data.id as string;

  // Upload: real PDF accepted, fake PDF rejected
  assert.equal((await upload(patient, caseId, "tahlil.pdf", demoPdf("tahlil"))).status, 200);
  assert.equal((await upload(patient, caseId, "fake.pdf", Buffer.from("not a pdf at all"))).status, 400);
  let bundle = (await call(`/api/cases/${caseId}`, { token: patient })).data;
  assert.equal(bundle.documents.length, 1);
  assert.equal(bundle.viewer, "patient");
  const docId = bundle.documents[0].id as string;

  // Patient opens own document
  const own = await call(`/api/documents/${docId}/url`, { token: patient });
  const file = await fetch(base + own.data.url);
  assert.equal(file.headers.get("content-type"), "application/pdf");
  assert.equal((await file.arrayBuffer()).byteLength > 100, true);

  // Checklist + patient can only post messages
  assert.deepEqual((await call(`/api/cases/${caseId}/checklist`, { method: "PUT", token: patient, body: { completed: ["clinic", "hack"] } })).data.completed, ["clinic"]);
  assert.equal((await call(`/api/cases/${caseId}/notes`, { token: patient, body: { kind: "conclusion", body: "fake" } })).status, 403);
  assert.equal((await call(`/api/cases/${caseId}/notes`, { token: patient, body: { body: "Salom doktor" } })).status, 200);

  // Doctor cannot see it before sharing
  const doctor = await login({ email: DEMO_ACCOUNTS.doctor.email, password: DEMO_ACCOUNTS.doctor.password });
  assert.equal((await call(`/api/cases/${caseId}`, { token: doctor })).status, 404);
  assert.equal((await call(`/api/documents/${docId}/url`, { token: doctor })).status, 404);

  // Share with an approved doctor
  const directory = (await call("/api/staff/directory", { token: patient })).data as { id: string; full_name: string }[];
  assert.equal(directory.length, 2);
  const doctorId = (await call("/api/me", { token: doctor })).data.user.id as string;
  assert.equal((await call(`/api/cases/${caseId}/shares/${doctorId}`, { method: "PUT", token: patient, body: { active: true } })).status, 200);

  // Doctor works on the case
  const list = (await call("/api/staff/cases", { token: doctor })).data as { case: { id: string }; patient: { full_name: string } }[];
  assert.ok(list.some(r => r.case.id === caseId && r.patient.full_name === "Sinov Bemor"));
  assert.equal((await call(`/api/cases/${caseId}`, { token: doctor })).data.viewer, "staff");
  assert.equal((await call(`/api/documents/${docId}/url`, { token: doctor })).status, 200);
  assert.equal((await call(`/api/cases/${caseId}/notes`, { token: doctor, body: { kind: "conclusion", body: "Tahlillar yetarli" } })).status, 200);
  assert.equal((await call(`/api/cases/${caseId}/status`, { token: doctor, body: { status: "under_review" } })).status, 200);

  bundle = (await call(`/api/cases/${caseId}`, { token: patient })).data;
  assert.equal(bundle.case.status, "under_review");
  assert.equal(bundle.accessLog.length, 1);
  assert.equal(bundle.accessLog[0].viewer_name, "Karimov Anvar Rustamovich");
  assert.deepEqual(bundle.notes.map((n: { kind: string }) => n.kind), ["message", "conclusion", "status"]);

  // Revoke: access disappears immediately
  assert.equal((await call(`/api/cases/${caseId}/shares/${doctorId}`, { method: "PUT", token: patient, body: { active: false } })).status, 200);
  assert.equal((await call(`/api/cases/${caseId}`, { token: doctor })).status, 404);
  assert.equal((await call(`/api/documents/${docId}/url`, { token: doctor })).status, 404);
  assert.equal((await call(`/api/cases/${caseId}/notes`, { token: doctor, body: { body: "x" } })).status, 404);
  assert.equal((await call(`/api/cases/${caseId}/status`, { token: doctor, body: { status: "closed" } })).status, 404);

  // Another patient never sees this case
  const other = await login({ phone: DEMO_ACCOUNTS.patient.phone, password: DEMO_ACCOUNTS.patient.password });
  assert.equal((await call(`/api/cases/${caseId}`, { token: other })).status, 404);
});

test("staff application must be approved by an admin", async () => {
  const reg = await call("/api/auth/demo/register", { body: { email: "test.doc@example.uz", password: "LongPassword1" } });
  const staff = reg.data.token as string;
  const staffId = reg.data.user.id as string;
  const applied = await call("/api/staff/me", { method: "PUT", token: staff, body: { full_name: "Test Doktor Aliyevich", role: "doctor", speciality: "Nefrolog", license_number: "LIC-999", organization: "Test klinika", region: "Navoiy", phone: "+998901110000" } });
  assert.equal(applied.data.status, "pending");
  assert.equal((await call("/api/staff/cases", { token: staff })).status, 403);

  const patient = await login({ phone: DEMO_ACCOUNTS.patient.phone, password: DEMO_ACCOUNTS.patient.password });
  const caseId = (await call("/api/cases", { token: patient })).data[0].id as string;
  assert.equal((await call(`/api/cases/${caseId}/shares/${staffId}`, { method: "PUT", token: patient, body: {} })).status, 400);

  // Non-admins cannot review
  assert.equal((await call(`/api/admin/staff/${staffId}`, { method: "PATCH", token: staff, body: { status: "approved" } })).status, 403);
  const adminToken = await login({ email: DEMO_ACCOUNTS.admin.email, password: DEMO_ACCOUNTS.admin.password });
  assert.equal((await call(`/api/admin/staff/${staffId}`, { method: "PATCH", token: adminToken, body: { status: "rejected" } })).status, 400);
  assert.equal((await call(`/api/admin/staff/${staffId}`, { method: "PATCH", token: adminToken, body: { status: "approved" } })).data.status, "approved");
  assert.equal((await call(`/api/cases/${caseId}/shares/${staffId}`, { method: "PUT", token: patient, body: {} })).status, 200);

  // Editing an approved application sends it back to review
  const again = await call("/api/staff/me", { method: "PUT", token: staff, body: { full_name: "Test Doktor Aliyevich", role: "doctor", speciality: "Nefrolog", license_number: "LIC-000", organization: "Boshqa klinika", region: "Navoiy", phone: "+998901110000" } });
  assert.equal(again.data.status, "pending");
  assert.equal((await call(`/api/cases/${caseId}`, { token: staff })).status, 404);
});

test("admin dashboard lists alerts; non-admins are refused", async () => {
  const patient = await login({ phone: DEMO_ACCOUNTS.patient.phone, password: DEMO_ACCOUNTS.patient.password });
  assert.equal((await call("/api/admin/dashboard", { token: patient })).status, 403);
  assert.equal((await call("/api/agent/chat", { token: patient, body: { messages: [{ role: "user", content: "salom" }] } })).status, 403);
  const adminToken = await login({ email: DEMO_ACCOUNTS.admin.email, password: DEMO_ACCOUNTS.admin.password });
  const dash = (await call("/api/admin/dashboard", { token: adminToken })).data;
  assert.ok(dash.stats.cases >= 3);
  const titles = dash.alerts.map((a: { title: string }) => a.title);
  assert.ok(titles.includes("Bemor javob kutmoqda"), titles.join(", "));
  assert.ok(titles.includes("Murojaat harakatsiz"));
  assert.ok(titles.includes("Demo rejim"));
  // Overview must not leak message text
  assert.ok(!JSON.stringify(dash.cases).includes("jigar testlarim"));
});

test("offline agent answers with tools", async () => {
  const adminToken = await login({ email: DEMO_ACCOUNTS.admin.email, password: DEMO_ACCOUNTS.admin.password });
  const r = await call("/api/agent/chat", { token: adminToken, body: { messages: [{ role: "user", content: "Saytdagi muammolarni tekshir" }] } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const last = r.data.messages[r.data.messages.length - 1];
  assert.equal(last.role, "assistant");
  assert.match(last.content, /Tekshiruv natijasi/);
  const audit = (await call("/api/agent/audit", { token: adminToken })).data;
  assert.ok(audit.some((a: { tool: string }) => a.tool === "scan_for_issues"));
});

test("LLM agent: approval-gated action, Anthropic request format", async () => {
  const requests: { messages: { role: string; content: unknown }[]; tools: { name: string }[] }[] = [];
  let pendingStaffId = "";
  const fakeFetch = (async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    requests.push(body);
    const step = requests.length;
    const content = step === 1
      ? [{ type: "tool_use", id: "t1", name: "list_staff_applications", input: { status: "pending" } }]
      : step === 2
        ? [{ type: "text", text: "Tasdiqlashni taklif qilaman." }, { type: "tool_use", id: "t2", name: "review_staff_application", input: { staff_id: pendingStaffId, decision: "approved" } }]
        : [{ type: "text", text: "Tasdiqlash tugmasini bosing." }];
    return new Response(JSON.stringify({ content }), { status: 200 });
  }) as unknown as typeof fetch;

  const dir2 = mkdtempSync(join(tmpdir(), "inhayat-agent-"));
  const { app: app2 } = createApp({ env, dataDir: dir2, provider: new AnthropicProvider("test-key", "claude-test", fakeFetch) });
  const srv = app2.listen(0);
  await new Promise(r => srv.once("listening", r));
  const b2 = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  const post = async (path: string, token: string, body: unknown) => (await fetch(b2 + path, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) })).json();
  try {
    const adminLogin = await (await fetch(b2 + "/api/auth/demo/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: DEMO_ACCOUNTS.admin.email, password: DEMO_ACCOUNTS.admin.password }) })).json();
    const token = adminLogin.token as string;
    const staffList = await (await fetch(b2 + "/api/admin/staff", { headers: { authorization: `Bearer ${token}` } })).json();
    pendingStaffId = staffList.find((s: { status: string }) => s.status === "pending").id;

    const r = await post("/api/agent/chat", token, { messages: [{ role: "user", content: "Kutayotgan shifokorni tasdiqla" }] });
    assert.equal(r.pendingActions.length, 1);
    assert.equal(r.pendingActions[0].tool, "review_staff_application");
    // Not executed yet
    let staff = await (await fetch(b2 + "/api/admin/staff", { headers: { authorization: `Bearer ${token}` } })).json();
    assert.equal(staff.find((s: { id: string }) => s.id === pendingStaffId).status, "pending");
    // Tool results were sent back as Anthropic tool_result blocks
    const second = requests[1].messages[requests[1].messages.length - 1];
    assert.equal(second.role, "user");
    assert.equal((second.content as { type: string }[])[0].type, "tool_result");
    assert.ok(requests[0].tools.some(t => t.name === "scan_for_issues"));

    const decided = await post(`/api/agent/actions/${r.pendingActions[0].id}`, token, { approve: true });
    assert.equal(decided.executed, true);
    staff = await (await fetch(b2 + "/api/admin/staff", { headers: { authorization: `Bearer ${token}` } })).json();
    assert.equal(staff.find((s: { id: string }) => s.id === pendingStaffId).status, "approved");
    // Cannot be replayed
    assert.equal((await fetch(b2 + `/api/agent/actions/${r.pendingActions[0].id}`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ approve: true }) })).status, 404);
  } finally {
    srv.close();
    rmSync(dir2, { recursive: true, force: true });
  }
});

test("OpenAI-compatible provider maps tool calls both ways", async () => {
  const { OpenAICompatibleProvider } = await import("../src/agent/providers.js");
  const { TOOLS } = await import("../src/agent/tools.js");
  let sent: { messages: { role: string; tool_calls?: unknown[]; tool_call_id?: string }[]; tools: { type: string }[] } | null = null;
  const fakeFetch = (async (url: string, init: { body: string; headers: Record<string, string> }) => {
    assert.equal(url, "https://llm.example/v1/chat/completions");
    assert.equal(init.headers.authorization, "Bearer k");
    sent = JSON.parse(init.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: null, tool_calls: [{ id: "c9", type: "function", function: { name: "get_platform_stats", arguments: "{}" } }] } }] }));
  }) as unknown as typeof fetch;
  const p = new OpenAICompatibleProvider("k", "m", "https://llm.example/v1/", fakeFetch);
  const out = await p.complete("sys", [
    { role: "user", content: "salom" },
    { role: "assistant", content: "", tool_calls: [{ id: "c1", name: "system_health", input: {} }] },
    { role: "tool", tool_call_id: "c1", name: "system_health", content: "{}" },
  ], TOOLS);
  assert.deepEqual(out.tool_calls, [{ id: "c9", name: "get_platform_stats", input: {} }]);
  assert.equal(sent!.messages[0].role, "system");
  assert.equal(sent!.messages[2].tool_calls!.length, 1);
  assert.equal(sent!.messages[3].tool_call_id, "c1");
  assert.equal(sent!.tools[0].type, "function");
});
