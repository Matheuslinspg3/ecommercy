import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { storeConfigSchema } from "../src/lib/models.ts";
import { z } from "zod";
const root = fileURLToPath(new URL("../", import.meta.url));
const config = storeConfigSchema.parse(
  JSON.parse(await readFile(`${root}/store.config.json`, "utf8")),
);
const literal = (value) => `'${value.replaceAll("'", "''")}'`;
let sql = `-- Somente instalação nova e vazia. Falha se a loja já estiver inicializada.\nset standard_conforming_strings=on;\nbegin;\ninsert into public.store_installation(id,slug,config,accepting_orders) values(true,${literal(config.slug)},${literal(JSON.stringify(config))}::jsonb,false);\n`;
const args = process.argv.slice(2);
if (args.length) {
  if (args.length !== 2 || args[0] !== "--owner")
    throw new Error("Use --owner UUID_DO_USUARIO_AUTH ou nenhum argumento.");
  const owner = z.uuid().parse(args[1]);
  sql += `insert into public.staff_members(user_id,role,active) values(${literal(owner)}::uuid,'owner',true);\n`;
}
sql += "commit;\n";
await mkdir(`${root}/supabase`, { recursive: true });
await writeFile(`${root}/supabase/initialize.sql`, sql);
console.log(
  "Arquivo supabase/initialize.sql gerado. Aplique no projeto novo desta loja após a migration.",
);
