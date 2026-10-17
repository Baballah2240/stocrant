import { Component, type ReactNode } from "react";
import { useLanguage } from "../language-context";

export function PageError() {
  const { language } = useLanguage();
  return <main className="app-lock-screen"><section className="app-lock-card" role="alert"><p className="eyebrow">STOCRANT</p><h1>{language === "ar" ? "ØªØ¹Ø°Ø± ÙØªØ­ Ù‡Ø°Ù‡ Ø§Ù„ØµÙØ­Ø©" : "This page could not open"}</h1><p>{language === "ar" ? "Ø£Ø¹Ø¯ ØªØ­Ù…ÙŠÙ„ Ø§Ù„ØªØ·Ø¨ÙŠÙ‚ Ù„Ù„Ù…ØªØ§Ø¨Ø¹Ø©. Ø¥Ø°Ø§ Ø§Ø³ØªÙ…Ø±Øª Ø§Ù„Ù…Ø´ÙƒÙ„Ø©ØŒ ØªÙˆØ§ØµÙ„ Ù…Ø¹ Ù…Ø³Ø¤ÙˆÙ„ Ø§Ù„Ù†Ø¸Ø§Ù…." : "Reload the app to continue. If this keeps happening, contact your administrator."}</p><button type="button" className="primary" onClick={() => window.location.reload()}>{language === "ar" ? "Ø¥Ø¹Ø§Ø¯Ø© Ø§Ù„ØªØ­Ù…ÙŠÙ„" : "Reload app"}</button><p><a href="/">{language === "ar" ? "Ø§Ù„ØµÙØ­Ø© Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠØ©" : "Go to home"}</a></p></section></main>;
}

export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <PageError /> : this.props.children; }
}
