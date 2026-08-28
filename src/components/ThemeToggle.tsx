import { useEffect, useState } from "react";
import { applyTheme, getStoredTheme, type ThemeMode } from "../lib/theme";

export function ThemeToggle() {
 const [theme, setTheme] = useState<ThemeMode>(getStoredTheme);

 useEffect(() => {
 applyTheme(theme);
 }, [theme]);

 const handleSelect = (mode: ThemeMode) => {
 setTheme(mode);
 applyTheme(mode);
 };

 return (
 <div className="theme-toggle" role="radiogroup" aria-label="Theme selection">
 <button
 type="button"
 className={`theme-toggle-btn ${theme === "dark" ? "active" : ""}`}
 onClick={() => handleSelect("dark")}
 title="Void Mode (Studio Dark)"
 aria-pressed={theme === "dark"}
 >
 🌑 Void
 </button>
 <button
 type="button"
 className={`theme-toggle-btn ${theme === "light" ? "active" : ""}`}
 onClick={() => handleSelect("light")}
 title="Paper Mode (Print Preview Light)"
 aria-pressed={theme === "light"}
 >
 📜 Paper
 </button>
 </div>
 );
}
