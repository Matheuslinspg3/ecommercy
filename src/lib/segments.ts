import type { Segment } from "./models";
export const segments: Record<
  Segment,
  {
    label: string;
    catalog: string;
    item: string;
    hero: string;
    preparation: string;
    addons: boolean;
  }
> = {
  restaurant: {
    label: "Restaurante",
    catalog: "Cardápio",
    item: "prato",
    hero: "Feito aqui. Do seu jeito.",
    preparation: "Na cozinha",
    addons: true,
  },
  snack_bar: {
    label: "Lanchonete",
    catalog: "Cardápio",
    item: "lanche",
    hero: "A sua fome tem endereço.",
    preparation: "Em preparo",
    addons: true,
  },
  grocery: {
    label: "Mercado",
    catalog: "Produtos",
    item: "produto",
    hero: "O dia a dia, bem abastecido.",
    preparation: "Em separação",
    addons: false,
  },
  pharmacy: {
    label: "Farmácia",
    catalog: "Produtos",
    item: "produto",
    hero: "Cuidado perto de você.",
    preparation: "Em separação",
    addons: false,
  },
  retail: {
    label: "Loja",
    catalog: "Produtos",
    item: "produto",
    hero: "Escolhas que combinam com você.",
    preparation: "Em separação",
    addons: false,
  },
};
export const statusLabels = {
  pending: "A confirmar",
  accepted: "Aceito",
  preparing: "Em preparo / separação",
  ready_for_pickup: "Pronto para retirada",
  out_for_delivery: "Saiu para entrega",
  completed: "Concluído",
  canceled: "Cancelado",
};
