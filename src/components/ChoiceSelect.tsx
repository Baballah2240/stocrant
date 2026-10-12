import { useLayoutEffect, useRef, useState, type SelectHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { useMobile } from "../use-mobile";
import { useLanguage } from "../language-context";

type Option = { value: string; label: string; disabled: boolean; group: string };

/** Keep the native select for form submission and validation; enhance mobile picking. */
export default function ChoiceSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const mobile = useMobile();
  const { language } = useLanguage();
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
    dialogRef.current?.showModal();
    dialogRef.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.scrollIntoView({ block: "nearest" });
  }, [open]);
  function show() {
    const select = selectRef.current;
    if (!select || props.disabled) return;
    const labelElement = select.labels?.[0];
    const caption = labelElement?.querySelector(".field-label, span")?.textContent
      || labelElement?.firstChild?.textContent || select.previousElementSibling?.textContent;
    setTitle(props["aria-label"] || caption?.trim() || (language === "ar" ? "اختر خياراً" : "Choose an option"));
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
  return <>
    <span className="choice-select">
      <select {...props} ref={selectRef} tabIndex={-1} aria-hidden="true" onInvalid={event => { props.onInvalid?.(event); event.preventDefault(); show(); }} />
      <button ref={triggerRef} type="button" className="choice-select-trigger" disabled={props.disabled} aria-haspopup="dialog" aria-expanded={open} aria-label={props["aria-label"]} onClick={event => { event.preventDefault(); show(); }}><span>{label || (language === "ar" ? "اختر" : "Choose")}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></button>
    </span>
    {open && createPortal(<dialog ref={dialogRef} className="choice-picker" aria-label={title} onCancel={close} onClose={close} onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <header><h2>{title}</h2><button type="button" onClick={close}>{language === "ar" ? "تم" : "Done"}</button></header>
      {options.length > 8 && <input type="search" className="choice-picker-search" aria-label={language === "ar" ? "بحث في الخيارات" : "Search options"} placeholder={language === "ar" ? "بحث" : "Search options"} value={query} onChange={event => setQuery(event.target.value)} />}
      <div className="choice-picker-options">{options.filter(option => `${option.label} ${option.group}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map((option, index) => <button type="button" key={`${option.value}-${index}`} disabled={option.disabled} aria-pressed={selectRef.current?.value === option.value} onClick={() => choose(option.value)}><span>{option.group && <small>{option.group}</small>}{option.label}</span><span className="choice-picker-check" aria-hidden="true">{selectRef.current?.value === option.value ? "✓" : ""}</span></button>)}{!options.some(option => `${option.label} ${option.group}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())) && <p>{language === "ar" ? "لا توجد نتائج" : "No matching options"}</p>}</div>
    </dialog>, document.body)}
  </>;
}
