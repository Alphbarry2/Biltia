// Enregistre le resolve hook avant tout import applicatif (via `node --import`).
import { register } from "node:module";
register(new URL("./loader.mjs", import.meta.url), import.meta.url);
