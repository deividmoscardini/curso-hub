// Fase 9 — Seletor de idioma (PT/ES). Aparece no header autenticado
// e na tela de login. Persistido em localStorage via I18nContext.

import { useT, type Idioma } from "@/contexts/i18n";
import { Button } from "@/components/ui/button";
import { Languages } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface Props {
  variant?: "default" | "ghost";
  size?: "sm" | "default";
}

export function SeletorIdioma({ variant = "ghost", size = "sm" }: Props) {
  const { idioma, setIdioma, t } = useT();
  const items: Array<{ id: Idioma; label: string; flag: string }> = [
    { id: "pt", label: t("idioma.portugues"), flag: "🇧🇷" },
    { id: "es", label: t("idioma.espanhol"), flag: "🇪🇸" },
  ];
  const atual = items.find((i) => i.id === idioma) ?? items[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} className="gap-1.5">
          <Languages className="h-4 w-4" />
          <span className="text-sm">{atual.flag}</span>
          <span className="hidden text-sm sm:inline">{atual.label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((i) => (
          <DropdownMenuItem key={i.id} onClick={() => setIdioma(i.id)}>
            <span className="mr-2">{i.flag}</span>{i.label}
            {i.id === idioma && <span className="ml-auto text-xs text-muted-foreground">✓</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
