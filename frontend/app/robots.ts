import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/cabinet", "/admin", "/reset-password", "/api/"] },
    sitemap: "https://www.inhayat.uz/sitemap.xml",
    host: "https://www.inhayat.uz",
  };
}
