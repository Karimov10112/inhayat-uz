const guides = {
  preparation: "Kabinetda yo‘l xaritangizni oching. Tayyorlov ro‘yxatini tekshiring va keyingi qadamni shifokoringiz bilan kelishing.",
  documents: "Hujjatlar bo‘limida fayl yuklang. Ulashish bo‘limida ruxsat bergan shifokoringiz hujjatni ko‘rishi mumkin.",
  contact: "Xabarlar bo‘limida shifokoringizga savol yuboring. Klinikalar katalogidan muassasa aloqa ma’lumotlarini toping.",
};

const cache = new Map<string, { expires: number; answer: Promise<string | null> }>();

export async function patientGuide(topic: unknown, env: NodeJS.ProcessEnv) {
  const key = typeof topic === "string" && Object.hasOwn(guides, topic) ? topic as keyof typeof guides : "preparation";
  const fallback = guides[key];
  const model = env.GEMINI_MODEL;
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey || !model || !/^[a-z0-9.-]{1,64}$/i.test(model)) return { answer: fallback, source: "guide" };
  let pending = cache.get(key);
  if (!pending || pending.expires < Date.now()) {
    const answer = (async () => {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `Bu platforma navigatsiyasi matnini sodda o‘zbek tilida qayta yozing. Faqat berilgan mazmunni ishlating. Tibbiy tavsiya, tashxis yoki dori haqida yozmang: ${fallback}` }] }],
            generationConfig: { maxOutputTokens: 450 },
          }),
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) return null;
        const body = await response.json();
        const value = body.candidates?.[0]?.content?.parts?.find((part: { thought?: boolean; text?: string }) => !part.thought && typeof part.text === "string")?.text;
        return typeof value === "string" && value.trim() ? value.trim().slice(0, 650) : null;
      } catch { return null; }
    })();
    pending = { expires: Date.now() + 300000, answer };
    cache.set(key, pending);
  }
  const answer = await pending.answer;
  return { answer: answer ?? fallback, source: answer ? "ai" : "guide" };
}
