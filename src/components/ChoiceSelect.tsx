import { useLayoutEffect, useRef, useState, type SelectHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { useMobile } from "../use-mobile";
import { useLanguage } from "../language-context";

type Option = { value: string; label: string; disabled: boolean; group: string };
const searchText = (text: string) => text.normalize("NFKD").replace(/[\u064b-\u065f\u0670\u0640]/g, "").toLocaleLowerCase();

/** Keep native form values and validation; use a searchable dialog on mobile. */
export default function ChoiceSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const mobile = useMobile();
  const { t } = useLanguage();
  const selectRef = useRef<HTMLSelectElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [label, setLabel] = useState("");
  const [options, setOptions] = useState<Option[]>([]);
  const [query, setQuery] = useState("");
  useLayoutEffect(() => {
    const select = selectRef.current;
    if (select) setLabel(select.selectedOptions[0]?.textContent ?? "");
  });
  useLayoutEffect(() => {
    if (!open) return;
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
    dialogRef.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.scrollIntoView({ block: "nearest" });
  }, [open]);
  function show() {
    const select = selectRef.current;
    if (!select || props.disabled) return;
    const labelElement = select.labels?.[0];
    const caption = labelElement?.querySelector(".field-label, span")?.textContent || labelElement?.firstChild?.textContent || select.previousElementSibling?.textContent;
    setTitle(props["aria-label"] || caption?.trim() || t("Choose an option"));
    setOptions(Array.from(select.options, option => ({ value: option.value, label: option.textContent || option.value, disabled: option.disabled || (option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled), group: option.parentElement instanceof HTMLOptGroupElement ? option.parentElement.label : "" })));
    setQuery(""); setOpen(true);
  }
  function close() { setOpen(false); triggerRef.current?.focus(); }
  function choose(value: string) {
    const select = selectRef.current;
    if (!select) return;
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    setLabel(select.selectedOptions[0]?.textContent ?? "");
    close();
  }
  if (!mobile || props.multiple || props.size) return <select {...props} ref={selectRef} />;
  const matches = options.filter(option => searchText(`${option.label} ${option.group} ${option.value}`).includes(searchText(query)));
  return <>
    <span className="choice-select">
      <select {...props} ref={selectRef} tabIndex={-1} aria-hidden="true" onInvalid={event => { props.onInvalid?.(event); event.preventDefault(); show(); }} />
      <button ref={triggerRef} type="button" className="choice-select-trigger" disabled={props.disabled} aria-haspopup="dialog" aria-expanded={open} aria-label={props["aria-label"] || label || t("Choose an option")} onClick={event => { event.preventDefault(); show(); }}><span>{label || t("Choose")}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></button>
    </span>
    {open && createPortal(<dialog ref={dialogRef} className="choice-picker" aria-label={title} onCancel={close} onClose={close} onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <header><h2>{title}</h2><button type="button" onClick={close}>{t("Done")}</button></header>
      {options.length > 8 && <input type="search" className="choice-picker-search" aria-label={t("Search options")} placeholder={t("Search options")} value={query} onChange={event => setQuery(event.target.value)} />}
      <div className="choice-picker-options">{matches.map((option, index) => <button type="button" key={`${option.value}-${index}`} disabled={option.disabled} aria-pressed={selectRef.current?.value === option.value} onClick={() => choose(option.value)}><span>{option.group && <small>{option.group}</small>}{option.label}</span><span className="choice-picker-check" aria-hidden="true">{selectRef.current?.value === option.value ? <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="m4 10 4 4 8-8" /></svg> : null}</span></button>)}{!matches.length && <p>{t("No matching options")}</p>}</div>
    </dialog>, document.body)}
  </>;
}