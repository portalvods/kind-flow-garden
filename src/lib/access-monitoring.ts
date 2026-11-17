export const ACCESS_PAGES = ["/pedidos", "/novidades", "/em-alta", "/perfil", "/suporte", "/admin"] as const;
export function monitoredPage(pathname: string): typeof ACCESS_PAGES[number] | null {
  return ACCESS_PAGES.find(page => pathname === page || pathname.startsWith(`${page}/`)) ?? null;
}