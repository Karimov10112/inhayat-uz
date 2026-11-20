import { createClient } from "npm:@supabase/supabase-js@2";

const name = "inhayat-api";
const url = Deno.env.get("SUPABASE_URL") ?? "";
const apiKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers });
}

export default {
  async fetch(request: Request): Promise<Response> {
    try {
      const target = new URL(request.url);
      const path = target.pathname.replace(/^\/(?:functions\/v1\/)?inhayat-api(?=\/|$)/, "");
      if (request.method !== "GET") return json({ error: "So‘rov usuli ruxsat etilmagan." }, 405);
      if (path === "/health") return json({ ok: true, service: name, mode: "supabase", readyForCutover: false });
      if (!["/api/me", "/api/notifications", "/api/admin/stats"].includes(path)) return json({ error: "Topilmadi." }, 404);

      const authorization = request.headers.get("authorization");
      const token = authorization?.match(/^Bearer ([A-Za-z0-9._-]{20,4096})$/i)?.[1];
      if (!authorization || !token) return json({ error: "Hisobingizga qayta kiring." }, 401);
      if (!url || !apiKey) return json({ error: "Xizmat vaqtincha ishlamayapti." }, 503);
      const db = createClient(url, apiKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: authorization } },
      });
      const { data: { user }, error: authError } = await db.auth.getUser(token);
      if (authError || !user) return json({ error: "Hisobingizga qayta kiring." }, 401);
      const isAdmin = user.app_metadata?.role === "admin";

      if (path === "/api/notifications") {
        const after = target.searchParams.get("after");
        if (after && (!/^[0-9]{1,19}$/.test(after) || BigInt(after) > 9223372036854775807n)) return json({ error: "Bildirishnoma kursori noto‘g‘ri." }, 400);
        const result = await db.rpc("case_notification_feed", { after_id: after || null });
        return result.error ? json({ error: "Bildirishnomalar yuklanmadi." }, 503) : json(result.data);
      }

      if (path === "/api/admin/stats") {
        if (!isAdmin) return json({ error: "Faqat administrator uchun." }, 403);
        const result = await db.rpc("admin_platform_stats");
        return result.error ? json({ error: "Statistika yuklanmadi." }, 503) : json(result.data);
      }

      const [profile, staff] = await Promise.all([
        db.from("profiles").select("id, full_name, phone, region").eq("id", user.id).maybeSingle(),
        db.from("staff_profiles").select("*").eq("id", user.id).maybeSingle(),
      ]);
      if (profile.error || staff.error) return json({ error: "Profil yuklanmadi." }, 503);
      return json({
        mode: "supabase",
        user: { id: user.id, isAdmin, email: user.email ?? "", phone: user.phone ?? profile.data?.phone ?? "" },
        profile: { id: user.id, full_name: profile.data?.full_name ?? "", phone: profile.data?.phone ?? "", region: profile.data?.region ?? "" },
        staff: staff.data,
      });
    } catch {
      return json({ error: "Xizmat vaqtincha ishlamayapti." }, 503);
    }
  },
};
