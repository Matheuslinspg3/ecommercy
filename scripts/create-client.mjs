import { readdir, lstat, mkdir, copyFile, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { storeConfigSchema } from "../src/lib/models.ts";

const sourceRoot = fileURLToPath(new URL("../", import.meta.url));
const allowed = [
  "src",
  "config/presets",
  "scripts",
  "tests",
  "docs",
  "supabase/migrations",
  "supabase/config.toml",
  "supabase/validation",
  ".github/workflows",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "next.config.ts",
  "eslint.config.mjs",
  ".prettierrc.json",
  ".gitignore",
  ".env.example",
  "README.md",
  "AGENTS.md",
];
const forbidden = new Set([
  "node_modules",
  ".git",
  ".next",
  ".temp",
  ".branches",
  "test-results",
  "clients",
  "client-brand",
]);
export async function copyClean(source, destination) {
  async function copy(path) {
    const name = path.split("/").at(-1);
    if (forbidden.has(name) || (name.startsWith(".env") && name !== ".env.example")) return;
    let stat;
    try {
      stat = await lstat(join(source, path));
    } catch (e) {
      if (e.code === "ENOENT") return;
      throw e;
    }
    if (stat.isSymbolicLink()) throw new Error(`Link simbólico não exportado: ${path}`);
    if (stat.isDirectory()) {
      for (const entry of await readdir(join(source, path))) await copy(`${path}/${entry}`);
    } else if (stat.isFile()) {
      await mkdir(dirname(join(destination, path)), { recursive: true });
      await copyFile(join(source, path), join(destination, path));
    }
  }
  for (const path of allowed) await copy(path);
}
export async function createClient(options, source = sourceRoot) {
  if (!options.preset || !options.slug || !options.name || !options.out)
    throw new Error("Use --preset, --slug, --name e --out. Opcionais: --city, --state.");
  if (!["restaurant", "snack_bar", "grocery", "pharmacy", "retail"].includes(options.preset))
    throw new Error("Segmento desconhecido.");
  const destination = resolve(options.out);
  const sourcePath = resolve(source);
  if (!relative(sourcePath, destination).startsWith(".."))
    throw new Error("Crie o cliente fora da pasta da base.");
  if (destination === sourcePath || relative(destination, sourcePath).split(/[\\/]/)[0] !== "..")
    throw new Error("O destino não pode conter o projeto de origem.");
  let existing;
  try {
    existing = await lstat(destination);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  if (existing?.isSymbolicLink() || (existing && !existing.isDirectory()))
    throw new Error("Escolha uma pasta comum e vazia.");
  if (existing && (await readdir(destination)).length)
    throw new Error("O destino precisa estar vazio. Nenhum arquivo foi sobrescrito.");
  const preset = JSON.parse(
    await readFile(join(source, "config/presets", `${options.preset}.json`), "utf8"),
  );
  const config = storeConfigSchema.parse({
    ...preset,
    slug: options.slug,
    name: options.name,
    location: {
      ...preset.location,
      city: options.city || "Sua cidade",
      state: options.state || "SP",
    },
  });
  await mkdir(destination, { recursive: true });
  await copyClean(source, destination);
  await writeFile(join(destination, "store.config.json"), `${JSON.stringify(config, null, 2)}\n`);
  await mkdir(join(destination, "public"), { recursive: true });
  await writeFile(
    join(destination, "public/commerce-mark.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="18" fill="#234B3D"/><path d="M16 28h32l-4-12H20l-4 12Zm3 0v20h26V28M26 48V36h12v12" fill="none" stroke="#F8F5EE" stroke-width="3" stroke-linejoin="round"/></svg>\n',
  );
  const localConfig = join(destination, "supabase/config.toml");
  const localText = await readFile(localConfig, "utf8");
  await writeFile(
    localConfig,
    localText.replace(/^project_id = ".*"$/m, `project_id = "${config.slug}"`),
  );
  const manifest = JSON.parse(await readFile(join(destination, "package.json"), "utf8"));
  manifest.name = options.slug;
  await writeFile(join(destination, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const lock = JSON.parse(await readFile(join(destination, "package-lock.json"), "utf8"));
  lock.name = options.slug;
  lock.packages[""].name = options.slug;
  await writeFile(join(destination, "package-lock.json"), `${JSON.stringify(lock, null, 2)}\n`);
  return destination;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const options = {};
    const permitted = new Set(["preset", "slug", "name", "out", "city", "state"]);
    for (let i = 2; i < process.argv.length; i += 2) {
      const key = process.argv[i]?.replace(/^--/, "");
      if (
        !process.argv[i]?.startsWith("--") ||
        !permitted.has(key) ||
        !process.argv[i + 1] ||
        process.argv[i + 1].startsWith("--") ||
        key in options
      )
        throw new Error("Argumentos inválidos.");
      options[key] = process.argv[i + 1];
    }
    const destination = await createClient(options);
    console.log(
      `Cliente criado em ${destination}. Configure um banco e domínio exclusivos antes de ativar pedidos reais.`,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
