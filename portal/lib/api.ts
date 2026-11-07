import { api } from "./session";

export { api };

/** Opens a document through a 5-minute signed link (access is checked and logged by the backend). */
export async function openDocument(id: string) {
  const tab = window.open("about:blank", "_blank");
  try {
    const { url } = await api<{ url: string }>(`/api/documents/${id}/url`);
    if (tab) { tab.opener = null; tab.location.href = url; } else window.location.href = url;
  } catch (error) {
    tab?.close();
    throw error;
  }
}
