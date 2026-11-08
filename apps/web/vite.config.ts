import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Vendor chunks (tech/rendering.md, "the landing loads first"): the landing's text needs only React;
// the 3D (three.js, its WebGPU renderer and TSL, React Three Fiber) loads with the gate scene; the
// terminal (xterm) only when a console first opens. Libraries sit in their own chunks so a new build
// of the game's code doesn't make players download them again.
// The game's own packages (simulator, shell, rooms, content) are left to automatic chunking: a group
// for them would also pull in content's small `intro` module, which the landing's chunk keeps.
const VENDOR: { name: string; test: RegExp; priority: number }[] = [
  {
    name: "react",
    test: /node_modules[\\/](react|react-dom|scheduler|use-sync-external-store|zustand)[\\/]/,
    priority: 50,
  },
  { name: "xterm", test: /node_modules[\\/]@xterm[\\/]/, priority: 50 },
  // The sign-in service's client (account/supabase.ts) loads only for a player who signs in.
  { name: "supabase", test: /node_modules[\\/]@supabase[\\/]/, priority: 50 },
  { name: "three-core", test: /node_modules[\\/]three[\\/]build[\\/]three\.core\.js/, priority: 45 },
  { name: "three-gpu", test: /node_modules[\\/]three[\\/]build[\\/]three\.(webgpu|tsl)\.js/, priority: 45 },
  { name: "three-gl", test: /node_modules[\\/]three[\\/]build[\\/]three\.module\.js/, priority: 45 },
  {
    name: "three-extras",
    test: /node_modules[\\/](three[\\/]examples|three-stdlib|three-mesh-bvh|meshline|troika-[^\\/]+|@monogrid)[\\/]/,
    priority: 40,
  },
  {
    name: "r3f",
    test: /node_modules[\\/](@react-three|its-fine|suspend-react|react-use-measure)[\\/]/,
    priority: 40,
  },
];

export default defineConfig({
  plugins: [react()],
  // .env sits at the repo root, beside .env.example (the optional sign-in service's address and key).
  envDir: "../..",
  build: {
    target: "es2023",
    // Built files carry a content hash and live apart from the unhashed models and audio in
    // public/assets, so they can be cached forever (public/_headers).
    assetsDir: "static",
    // three's WebGPU renderer alone is ~650 kB minified (~170 kB gzipped); it loads after the landing.
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        codeSplitting: { groups: VENDOR },
      },
    },
  },
});
