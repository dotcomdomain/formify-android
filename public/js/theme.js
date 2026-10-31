// Colour theme (warm or blue), remembered per device. Pages also set it inline in <head> to avoid a flash.
const KEY = "fz_theme";
export const theme = () => { try { return localStorage.getItem(KEY) === "blue" ? "blue" : "warm"; } catch { return "warm"; } };
export function setTheme(t) {
  const v = t === "blue" ? "blue" : "warm";
  try { localStorage.setItem(KEY, v); } catch {}
  document.documentElement.dataset.theme = v;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", v === "blue" ? "#eef3fb" : "#f5efe4");
}
