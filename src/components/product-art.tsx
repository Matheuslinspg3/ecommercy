import { Carrot, Coffee, Heart, Package, Sandwich, Utensils } from "lucide-react";
import type { Product } from "@/lib/models";
const icons = {
  meal: Utensils,
  burger: Sandwich,
  drink: Coffee,
  produce: Carrot,
  package: Package,
  care: Heart,
};
export function ProductArt({ art, large = false }: { art: Product["art"]; large?: boolean }) {
  const Icon = icons[art];
  return (
    <div className={`product-art art-${art} ${large ? "art-large" : ""}`} aria-hidden="true">
      <div className="art-orbit" />
      <div className="art-shape">
        <Icon size={large ? 96 : 64} strokeWidth={1.2} />
      </div>
      <span className="art-dot" />
    </div>
  );
}
