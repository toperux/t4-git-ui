import { Moon, Sun } from "lucide-react";
import { toggleTheme, useTheme } from "../../../theme/theme";
import { IconButton } from "../IconButton/IconButton";

/** Light / dark switch: shows the theme a click would move to. */
export function ThemeToggle() {
  const dark = useTheme() === "dark";
  return (
    <IconButton label={dark ? "Switch to light theme" : "Switch to dark theme"} onClick={toggleTheme}>
      {dark ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
    </IconButton>
  );
}
