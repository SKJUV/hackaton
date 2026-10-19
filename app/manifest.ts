import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Co-founder — Co-fondateur IA & assistant juridique",
    short_name: "Co-founder",
    description: "Co-founder : co-fondateur IA ancré dans les textes officiels camerounais (assistant juridique gratuit, workspace entrepreneur, entreprise et État).",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0e17",
    theme_color: "#0a0e17",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icons/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
