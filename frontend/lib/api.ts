import { api } from "./session";

export { api };

/** Opens a document through a 5-minute signed link (access is checked and logged by the backend). */
export async function openDocument(id: string) {
  // Open the tab synchronously so popup blockers allow it, then point it at the file.
  const tab = window.open("about:blank", "_blank");
  try {
    const { url } = await api<{ url: string }>(`/api/documents/${id}/url`);
    if (tab) { tab.opener = null; tab.location.href = url; } else window.location.href = url;
  } catch (error) {
    tab?.close();
    throw error;
  }
}

/** Signed upload (R2 in production, backend disk in demo) + server-side verification. */
export async function uploadDocument(file: File, caseId: string, kind: string) {
  const signed = await api<{ uploadUrl: string; objectKey: string }>("/api/documents/upload", { body: { fileName: file.name, fileType: file.type, fileSize: file.size } });
  const put = await fetch(signed.uploadUrl, { method: "PUT", headers: { "content-type": file.type }, body: file });
  if (!put.ok) throw new Error("Fayl omborga yuklanmadi.");
  await api("/api/documents/complete", { body: { caseId, objectKey: signed.objectKey, originalName: file.name, kind } });
}
