import { Component, type ReactNode } from "react";
import { useLanguage } from "../language-context";

export function PageError() {
  const { t } = useLanguage();
  return <main className="app-lock-screen"><section className="app-lock-card" role="alert"><p className="eyebrow">STOCRANT</p><h1>{t("This page could not open")}</h1><p>{t("Reload the app to continue. If this keeps happening, contact your administrator.")}</p><button type="button" className="primary" onClick={() => window.location.reload()}>{t("Reload app")}</button><p><a href="/">{t("Go to home")}</a></p></section></main>;
}

export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <PageError /> : this.props.children; }
}
