import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: "https://www.inhayat.uz", changeFrequency: "weekly", priority: 1 }];
}
