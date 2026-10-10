import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyClean, createClient } from "../scripts/create-client.mjs";
test("exportação usa allowlist e exclui credenciais, Git, arquivos gerados e dados da instalação anterior", async () => {
  const root = await mkdtemp(join(tmpdir(), "commerce-export-"));
  const source = join(root, "source");
  const out = join(root, "client");
  try {
    for (const path of ["src", ".git", "supabase/migrations", "public/client-brand"])
      await mkdir(join(source, path), { recursive: true });
    for (const [path, value] of [
      [".env.production", "FAKE_SECRET=never-copy"],
      [".env.example", "STORE_MODE=demo"],
      [".git/config", "old-client"],
      ["store.config.json", "old-client"],
      ["src/index.ts", "export const safe = true"],
      ["src/.env.local", "FAKE=hidden"],
      ["supabase/initialize.sql", "old-client"],
      ["supabase/migrations/example.sql", "select 1;"],
      ["public/client-brand/logo.svg", "old-client"],
    ])
      await writeFile(join(source, path), value);
    await copyClean(source, out);
    assert.equal(await readFile(join(out, "src/index.ts"), "utf8"), "export const safe = true");
    assert.equal(await readFile(join(out, ".env.example"), "utf8"), "STORE_MODE=demo");
    assert.deepEqual((await readdir(out)).sort(), [".env.example", "src", "supabase"]);
    assert.deepEqual(await readdir(join(out, "src")), ["index.ts"]);
    assert.deepEqual(await readdir(join(out, "supabase")), ["migrations"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("exportação rejeita links simbólicos em arquivos que seriam copiados", async () => {
  const root = await mkdtemp(join(tmpdir(), "commerce-links-"));
  try {
    await mkdir(join(root, "source/src"), { recursive: true });
    await writeFile(join(root, "secret.txt"), "fake");
    await symlink(join(root, "secret.txt"), join(root, "source/src/leak.ts"));
    await assert.rejects(() => copyClean(join(root, "source"), join(root, "out")), /simbólico/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("gerador cria projeto completo, muda identidade e não sobrescreve destinos existentes", async () => {
  const root = await mkdtemp(join(tmpdir(), "commerce-client-"));
  const out = join(root, "cliente");
  try {
    await createClient({
      preset: "grocery",
      slug: "mercado-teste",
      name: "Mercado Teste",
      city: "Santos",
      state: "SP",
      out,
    });
    const config = JSON.parse(await readFile(join(out, "store.config.json"), "utf8"));
    assert.equal(config.slug, "mercado-teste");
    assert.equal(config.segment, "grocery");
    assert.equal(config.location.city, "Santos");
    assert.equal(config.contact.whatsapp, "");
    const manifest = JSON.parse(await readFile(join(out, "package.json"), "utf8"));
    const lock = JSON.parse(await readFile(join(out, "package-lock.json"), "utf8"));
    assert.equal(manifest.name, lock.name);
    assert.equal(lock.packages[""].name, "mercado-teste");
    assert.ok((await readdir(join(out, "supabase/migrations"))).length > 0);
    await assert.rejects(
      () => createClient({ preset: "grocery", slug: "teste", name: "Teste", out }),
      /vazio/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
