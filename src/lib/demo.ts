import type { Product, Segment } from "./models";
export function demoProducts(segment: Segment): Product[] {
  const menu = segment === "restaurant" || segment === "snack_bar";
  const names =
    segment === "restaurant"
      ? [
          "Bowl da casa",
          "Prato do dia",
          "Sanduíche artesanal",
          "Salada de estação",
          "Suco natural",
          "Sobremesa da casa",
        ]
      : segment === "snack_bar"
        ? [
            "Burger da casa",
            "Combo clássico",
            "Sanduíche especial",
            "Batata crocante",
            "Suco natural",
            "Brownie artesanal",
          ]
        : segment === "grocery"
          ? [
              "Cesta de hortifruti",
              "Arroz 1 kg",
              "Café moído 250 g",
              "Banana 1 kg",
              "Suco de uva 1 L",
              "Biscoitos integrais",
            ]
          : segment === "pharmacy"
            ? [
                "Kit de cuidados",
                "Protetor solar",
                "Hidratante corporal",
                "Sabonete suave",
                "Shampoo diário",
                "Lenços de papel",
              ]
            : [
                "Kit essencial",
                "Produto em destaque",
                "Novidade da semana",
                "Seleção da casa",
                "Prático para o dia a dia",
                "Presente especial",
              ];
  return names.map((name, i) => ({
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    slug: `exemplo-${i + 1}`,
    name,
    image_url: "",
    category: menu
      ? i < 3
        ? "Da casa"
        : i === 3
          ? "Acompanhamentos"
          : "Para completar"
      : i < 3
        ? "Essenciais"
        : "Seleção da casa",
    description: menu
      ? "Preparado com atenção aos detalhes. Um exemplo de produto para conhecer a sua futura loja."
      : "Produto de demonstração. Substitua por seu catálogo, descrições e preços reais.",
    price_cents: menu
      ? [2890, 3290, 2490, 1890, 890, 1290][i]
      : [1990, 2490, 1890, 790, 1490, 690][i],
    stock_quantity: menu && i < 3 ? null : i === 5 ? 4 : 20,
    reserved_quantity: 0,
    sale_class: "general",
    warning: "",
    active: true,
    options:
      menu && i < 3
        ? [
            {
              id: "extras",
              name: "Adicionais",
              min: 0,
              max: 2,
              choices: [
                { id: "queijo-extra", name: "Queijo extra", price_cents: 300 },
                { id: "molho-casa", name: "Molho da casa", price_cents: 200 },
              ],
            },
          ]
        : [],
    art: menu
      ? (["meal", "meal", "burger", "produce", "drink", "package"] as const)[i]
      : (["produce", "package", "package", "produce", "drink", "care"] as const)[i],
  }));
}
