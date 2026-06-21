import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";

interface Props {
  /** On a coloured brand surface, render with inverted (white) chrome. */
  inverted?: boolean;
}

export default function ThemeToggle({ inverted = false }: Props) {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      title={theme === "dark" ? "Light theme" : "Dark theme"}
      className={
        inverted
          ? "p-1.5 rounded hover:bg-white/15 transition text-white/90 hover:text-white"
          : "btn-icon"
      }
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
