import { Keyboard } from "@capacitor/keyboard";
import "./native-keyboard.css";

const editable = (element: Element | null): element is HTMLElement =>
  element instanceof HTMLElement && (element.isContentEditable || (element.matches("input, textarea, select") && !element.matches("[type=checkbox], [type=radio], [type=button], [type=submit], [type=range], [type=file]")));

/** Keep the focused field visible above the native keyboard without letting the page jump. */
function revealFocusedField() {
  const field = document.activeElement;
  if (!editable(field)) return;
  const view = window.visualViewport, bottom = (view ? view.height + view.offsetTop : window.innerHeight) - 16, rect = field.getBoundingClientRect();
  if (rect.top < 72 || rect.bottom > bottom) field.scrollIntoView({ block: "center", behavior: "smooth" });
}

/**
 * Native keyboard behaviour for the Capacitor app: the web view resizes with the keyboard,
 * the focused field scrolls into view, and fixed bottom bars hide while typing.
 */
export async function setupNativeKeyboard() {
  const root = document.documentElement;
  const setHeight = (height: number) => root.style.setProperty("--keyboard-height", `${Math.max(0, Math.round(height))}px`);
  await Keyboard.addListener("keyboardWillShow", info => { root.classList.add("keyboard-open"); setHeight(info.keyboardHeight); });
  await Keyboard.addListener("keyboardDidShow", info => { setHeight(info.keyboardHeight); requestAnimationFrame(revealFocusedField); });
  await Keyboard.addListener("keyboardWillHide", () => { root.classList.remove("keyboard-open"); setHeight(0); });
  // Focus moving between fields while the keyboard stays open (e.g. the "next" key).
  document.addEventListener("focusin", () => { if (root.classList.contains("keyboard-open")) setTimeout(revealFocusedField, 50); });
  // Tapping outside a field closes the keyboard, as in native apps.
  document.addEventListener("touchstart", event => {
    if (!root.classList.contains("keyboard-open") || editable(event.target as Element) || (event.target as Element).closest?.("label, button, [role=button], [role=option], a")) return;
    if (editable(document.activeElement)) (document.activeElement as HTMLElement).blur();
  }, { passive: true });
  if (root.getAttribute("data-native-platform") === "ios") await Keyboard.setAccessoryBarVisible({ isVisible: true }).catch(() => {});
}
