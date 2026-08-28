/**
 * Theme Management System for Cartouche Workspace.
 * Supports Void (Studio Dark), Paper (Print Light), and System theme modes.
 */
export type ThemeMode = "dark" | "light" | "system";

export function getStoredTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem("cartouche_theme") as ThemeMode;
    if (saved === "light" || saved === "dark" || saved === "system") {
      return saved;
    }
  } catch {
    // Fallback if localStorage unavailable
  }
  return "dark";
}

export function applyTheme(theme: ThemeMode) {
  try {
    if (theme === "system") {
      document.documentElement.removeAttribute("data-theme");
      localStorage.removeItem("cartouche_theme");
    } else {
      document.documentElement.setAttribute("data-theme", theme);
      localStorage.setItem("cartouche_theme", theme);
    }
  } catch {
    // Fail silently in restricted sandbox
  }
}
