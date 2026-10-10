"use client";
import { useMemo, useSyncExternalStore } from "react";
import { z } from "zod";
import { cartLineSchema, type CartLine } from "@/lib/models";
const backup = new Map<string, string>();
function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener("commerce-cart", listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener("commerce-cart", listener);
  };
}
function snapshot(key: string) {
  try {
    return localStorage.getItem(key) || backup.get(key) || "[]";
  } catch {
    return backup.get(key) || "[]";
  }
}
export function useCart(slug: string) {
  const key = `commerce:${slug}:cart:v1`;
  const raw = useSyncExternalStore(
    subscribe,
    () => snapshot(key),
    () => "[]",
  );
  const cart = useMemo(() => {
    try {
      const parsed = z.array(cartLineSchema).max(40).safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : [];
    } catch {
      return [];
    }
  }, [raw]);
  function setCart(items: CartLine[]) {
    const value = JSON.stringify(items);
    backup.set(key, value);
    try {
      localStorage.setItem(key, value);
    } catch {
      /* Cesta continua durante esta sessão. */
    }
    window.dispatchEvent(new Event("commerce-cart"));
  }
  return [cart, setCart] as const;
}
