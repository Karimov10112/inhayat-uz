"use client";

import { useEffect, useRef, useState } from "react";

type Notice = { cursor: string; kinds: ("message" | "document" | "status")[] };
export const activityEvent = "inhayat:case-activity";

function chime(audio: AudioContext) {
  if (audio.state !== "running") return;
  [523, 659].forEach((frequency, index) => {
    const start = audio.currentTime + index * 0.13;
    const tone = audio.createOscillator();
    const volume = audio.createGain();
    tone.frequency.value = frequency;
    volume.gain.setValueAtTime(0.0001, start);
    volume.gain.exponentialRampToValueAtTime(0.08, start + 0.025);
    volume.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
    tone.connect(volume).connect(audio.destination);
    tone.start(start);
    tone.stop(start + 0.24);
  });
}

export function ActivityBell({ fetchNotice }: { fetchNotice: (path: string) => Promise<Notice> }) {
  const audio = useRef<AudioContext | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let alive = true;
    let cursor = "";
    let timer: number;
    async function poll() {
      try {
        const result = await fetchNotice(`/api/notifications?after=${encodeURIComponent(cursor)}`);
        if (!alive) return;
        cursor = result.cursor;
        if (result.kinds.length) {
          const label = { message: "Yangi xabar keldi.", document: "Yangi hujjat yuklandi.", status: "Murojaat holati yangilandi." };
          setNotice(result.kinds.length === 1 ? label[result.kinds[0]] : `${result.kinds.length} ta yangi bildirishnoma.`);
          if (audio.current) chime(audio.current);
          window.dispatchEvent(new Event(activityEvent));
        }
      } catch { /* retry at the next interval */ }
      if (alive) timer = window.setTimeout(poll, 10000);
    }
    void poll();
    return () => { alive = false; window.clearTimeout(timer); void audio.current?.close(); audio.current = null; };
  }, [fetchNotice]);

  async function toggle() {
    if (audio.current) {
      const context = audio.current;
      audio.current = null;
      setEnabled(false);
      await context.close();
      return;
    }
    try {
      const context = new AudioContext();
      audio.current = context;
      await context.resume();
      if (audio.current !== context) return;
      setEnabled(true);
      chime(context);
    } catch {
      const context = audio.current;
      audio.current = null;
      if (context?.state !== "closed") void context?.close();
      setNotice("Brauzerda bildirishnoma ovozini yoqib bo‘lmadi.");
    }
  }

  return <div className="activity-bell">
    <button type="button" onClick={() => void toggle()} aria-pressed={enabled}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>
      {enabled ? "Ovoz yoqilgan" : "Ovozni yoqish"}
    </button>
    <span role="status">{notice}</span>
  </div>;
}
