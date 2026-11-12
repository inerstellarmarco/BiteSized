import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bite Sized",
    short_name: "Bite Sized",
    description: "Short lessons, one idea at a time.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f3ecdf",
    theme_color: "#221c16",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
