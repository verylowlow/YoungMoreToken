import type { ProviderAdapter } from "@/lib/types";

// ===== 适配器注册中心 =====
const adapters = new Map<string, ProviderAdapter>();

export function registerAdapter(a: ProviderAdapter) {
  adapters.set(a.slug, a);
}

export function getAdapter(slug: string): ProviderAdapter | undefined {
  return adapters.get(slug);
}

export function allAdapters(): ProviderAdapter[] {
  return [...adapters.values()];
}
