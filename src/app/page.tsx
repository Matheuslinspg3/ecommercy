import { loadStore } from "@/lib/server";
import { Storefront } from "@/components/storefront";
export default async function Home() {
  return <Storefront initial={await loadStore()} />;
}
