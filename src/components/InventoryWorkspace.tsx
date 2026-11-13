import InventoryPhotoUpload from "./InventoryPhotoUpload";
import { ShopImage } from "./ProductPhotos";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { useLanguage } from "../language-context";
import { useSession } from "../session-context";
import { useMobile } from "../use-mobile";
import { api } from "../api";
import type { CollectionItem } from "../types";
import ChoiceSelect from "./ChoiceSelect";
import BackButton from "./BackButton";
import "../inventory-workspace.css";

const blankItem = (organizationId = "") => ({ organizationId, image: "", itemType: "ingredient", allowedEmployeeIds: [] as string[], notes: "", sku: "", name: "", unit: "unit", stockLocation: "", openingStock: "0", reorderPoint: "0" });
const text = (value: unknown, fallback = "") => value == null || value === "" ? fallback : String(value);
function changeDate(row: CollectionItem) { return text(row.occurredAt || row.createdAt || row.date || row.updatedAt); }
function orderLatest(a: CollectionItem, b: CollectionItem) { return (Date.parse(changeDate(b)) || 0) - (Date.parse(changeDate(a)) || 0); }
function stockStatus(item: CollectionItem) { return Number(item.available) <= 0 ? "Out of stock" : item.lowStock ? "Low stock" : "In stock"; }
const stockKeys = [["Opening stock", "openingStock"], ["Incoming", "incoming"], ["Returns", "returns"], ["Consumed", "consumed"], ["Adjustments", "adjustments"]];

export default function InventoryWorkspace() {
  const { t, language } = useLanguage();
  const { user } = useSession();
  const mobile = useMobile();
  const [params, setParams] = useSearchParams();
  const query = params.get("q") || "", companyFilter = params.get("company") || "", locationFilter = params.get("location") || "", statusFilter = params.get("status") || "", selectedId = params.get("item") || "";
  const updateParams = (changes: Record<string, string>) => setParams(current => { const next = new URLSearchParams(current); for (const [key, value] of Object.entries(changes)) { if (value) next.set(key, value); else next.delete(key); } return next; }, { replace: true });
  const permits = (action: string) => Boolean(user?.permissions.some(permission => ["*", "inventory.*", `inventory.${action}`].includes(permission)));
  const isAdmin = user?.roleId === "role-main-manager";
  const [companies, setCompanies] = useState<CollectionItem[]>([]), [employees, setEmployees] = useState<CollectionItem[]>([]), [history, setHistory] = useState<CollectionItem[]>([]);
  const [items, setItems] = useState<CollectionItem[]>([]), [movements, setMovements] = useState<CollectionItem[]>([]);
  const [editingId, setEditingId] = useState(""), [notice, setNotice] = useState(""), [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true), [refreshing, setRefreshing] = useState(false), [saving, setSaving] = useState(false), [photoBusy, setPhotoBusy] = useState(false);
  const [mode, setMode] = useState<"item" | "movement" | null>(null), [detailTab, setDetailTab] = useState<"overview" | "movements">("overview");
  const [itemForm, setItemForm] = useState(blankItem);
  const [imageModified, setImageModified] = useState(false);
  const [movementForm, setMovementForm] = useState({ inventoryItemId: "", type: "incoming", quantity: "", date: new Date().toISOString().slice(0, 10), reason: "", reference: "" });
  const loadVersion = useRef(0), savingRef = useRef(false), returnFocus = useRef<HTMLElement | null>(null), panelRef = useRef<HTMLElement>(null);
  const load = useCallback(async () => {
    const version = ++loadVersion.current; setRefreshing(true);
    try {
      const data = await api.workspace.inventory();
      if (version !== loadVersion.current) return;
      setItems(data.items); setCompanies(data.companies); setEmployees(data.employees); setHistory(data.history); setMovements(data.movements); setError(null);
      setMovementForm(current => ({ ...current, inventoryItemId: current.inventoryItemId || text(data.items[0]?.id) }));
    } catch (err) { if (version === loadVersion.current) setError(err instanceof Error ? err.message : "Could not load inventory."); }
    finally { if (version === loadVersion.current) { setLoading(false); setRefreshing(false); } }
  }, []);
  useEffect(() => { void load(); return () => { ++loadVersion.current; }; }, [load]);
  const companyName = (item: CollectionItem) => text(companies.find(company => company.id === item.organizationId)?.name, t("Unassigned"));
  const locations = useMemo(() => [...new Set(items.filter(item => !companyFilter || item.organizationId === companyFilter).map(item => text(item.stockLocation)).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [items, companyFilter]);
  const visible = useMemo(() => items.filter(item => (!companyFilter || item.organizationId === companyFilter) && (!locationFilter || text(item.stockLocation) === locationFilter) && (!statusFilter || (statusFilter === "low" ? Boolean(item.lowStock) : statusFilter === "out" ? Number(item.available) <= 0 : statusFilter === "in" ? !item.lowStock && Number(item.available) > 0 : true)) && [item.sku, item.name, item.stockLocation, item.itemType, item.notes, companies.find(company => company.id === item.organizationId)?.name].map(value => text(value)).join(" ").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [items, companies, companyFilter, locationFilter, statusFilter, query]);
  const selected = items.find(item => item.id === selectedId);
  const panelOpen = Boolean(selected && !mode);
  const lowStock = items.filter(item => item.lowStock).length;
  const timestamp = (value: unknown) => { const date = new Date(text(value)); return Number.isNaN(date.getTime()) ? t("Not recorded") : date.toLocaleString(language === "ar" ? "ar-QA" : "en-US", { dateStyle: "medium", timeStyle: "short" }); };
  const itemMovements = useMemo(() => movements.filter(entry => entry.inventoryItemId === selectedId).sort(orderLatest), [movements, selectedId]);
  const itemHistory = useMemo(() => history.filter(entry => entry.inventoryItemId === selectedId).sort(orderLatest), [history, selectedId]);
  const latestChanges = useMemo(() => {
    const changes = new Map<string, { at: string; user: string }>();
    for (const item of items) changes.set(item.id, { at: text(item.updatedAt || item.createdAt), user: text(item.updatedByName || item.createdByName, t("Legacy record")) });
    for (const entry of [...history, ...movements]) {
      const id = text(entry.inventoryItemId), at = changeDate(entry), previous = changes.get(id);
      if ((Date.parse(at) || 0) > (Date.parse(previous?.at || "") || 0)) changes.set(id, { at, user: text(entry.actor || entry.responsibleUser || entry.createdByName, t("Unknown")) });
    }
    return changes;
  }, [items, movements, history, t]);
  function openItem(item: CollectionItem, trigger?: HTMLElement) { returnFocus.current = trigger || document.activeElement as HTMLElement; setDetailTab("overview"); updateParams({ item: item.id }); }
  function closeItem() { updateParams({ item: "" }); requestAnimationFrame(() => { if (returnFocus.current?.isConnected) { returnFocus.current.focus({ preventScroll: true }); } else { document.getElementById("inventory-heading")?.focus({ preventScroll: true }); } }); }
  useEffect(() => {
    if (!panelOpen) return;
    panelRef.current?.focus({ preventScroll: true });
    if (!mobile) return;
    const previous = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [panelOpen, selectedId, mobile]);
  useEffect(() => { if (mode) { const editor = document.getElementById("inventory-editor"); editor?.focus(); editor?.scrollIntoView({ block: "start" }); } }, [mode]);
  function recordMovement(item?: CollectionItem) { if (savingRef.current) return; setMovementForm(current => ({ ...current, inventoryItemId: item?.id || current.inventoryItemId || text(items[0]?.id), quantity: "", reason: "", reference: "" })); setMode("movement"); setNotice(""); }
  async function saveItem(event: React.FormEvent) {
    event.preventDefault(); if (savingRef.current || photoBusy) return; savingRef.current = true; setSaving(true); setError(null);
    try {
      const { image: _image, ...fields } = itemForm;
      const payload = { ...fields, ...(imageModified ? { image: itemForm.image } : {}), openingStock: Number(itemForm.openingStock), reorderPoint: Number(itemForm.reorderPoint) };
      const result = editingId ? await api.workspace.updateInventoryItem(editingId, { ...(imageModified ? { image: itemForm.image } : {}), name: payload.name, unit: payload.unit, stockLocation: payload.stockLocation, itemType: payload.itemType, notes: payload.notes, reorderPoint: payload.reorderPoint, ...(isAdmin ? { allowedEmployeeIds: payload.allowedEmployeeIds } : {}) }) : await api.workspace.createInventoryItem({ ...payload, ...(!isAdmin ? { allowedEmployeeIds: [] } : {}) });
      setNotice(result.pending ? "The item change was sent for approval." : "Item saved. The change history records who made it and when."); setMode(null); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not create item."); }
    finally { savingRef.current = false; setSaving(false); }
  }
  async function saveMovement(event: React.FormEvent) {
    event.preventDefault(); if (savingRef.current) return; savingRef.current = true; setSaving(true); setError(null);
    try {
      const result = await api.workspace.createInventoryMovement({ ...movementForm, quantity: Number(movementForm.quantity) });
      setNotice(result.pending ? "The movement was sent for approval." : "Stock movement recorded."); setMode(null); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not record movement."); }
    finally { savingRef.current = false; setSaving(false); }
  }
  function editItem(item: CollectionItem) {
    setEditingId(item.id); setImageModified(false); setItemForm({ image: text(item.image ?? item.imageUrl ?? item.photoUrl), organizationId: text(item.organizationId), itemType: text(item.itemType, "other"), allowedEmployeeIds: Array.isArray(item.allowedEmployeeIds) ? item.allowedEmployeeIds.map(String) : [], notes: text(item.notes), sku: text(item.sku), name: text(item.name), unit: text(item.unit, "unit"), stockLocation: text(item.stockLocation), openingStock: text(item.openingStock, "0"), reorderPoint: text(item.reorderPoint, "0") }); setMode("item");
  }
  const hiddenBehindPanel = mobile && panelOpen;
  return <div className="page inventory-page" aria-busy={refreshing}>
    <div className="page-head" inert={hiddenBehindPanel}><div><BackButton /><h1 id="inventory-heading" tabIndex={-1}>{t("Inventory")}</h1><p className="hint">{t("Available stock is calculated from opening stock, incoming quantities, returns, outgoing quantities and adjustments.")}</p></div><div className="inline-actions">{permits("create") && <><button type="button" disabled={loading || !items.length || saving || photoBusy} onClick={() => recordMovement(selected || visible[0])}>{t("Record movement")}</button><button type="button" className="primary" disabled={loading || saving || photoBusy} onClick={() => { setEditingId(""); setImageModified(false); setItemForm(blankItem(companyFilter)); setMode("item"); }}>{t("New item")}</button></>}</div></div>
    {error && <div className="alert alert--bad" role="alert">{t(error)} <button type="button" disabled={refreshing} onClick={() => void load()}>{t("Try again")}</button></div>}
    {notice && <div className="alert alert--good" role="status">{t(notice)}</div>}
    <div className="inventory-metrics" inert={hiddenBehindPanel}>
      <div className="card metric-card"><span>{t("Items")}</span><strong>{loading ? "—" : items.length}</strong></div>
      <button type="button" className="card metric-card inventory-low-stock" aria-pressed={statusFilter === "low"} onClick={() => updateParams({ status: statusFilter === "low" ? "" : "low" })}><span>{t("Low-stock alerts")}</span><strong className={lowStock ? "metric-warning" : ""}>{loading ? "—" : lowStock}</strong><small>{t(statusFilter === "low" ? "Show all stock statuses" : "Show low-stock items")}</small></button>
      <div className="card metric-card"><span>{t("Recorded movements")}</span><strong>{loading ? "—" : movements.length}</strong></div>
    </div>
    {mode === "item" && <section className="card inventory-editor" id="inventory-editor" tabIndex={-1}><h2>{editingId ? t("Edit inventory item") : t("New inventory item")}</h2><form className="form" onSubmit={saveItem}><div className="form-grid"><label className="form-field"><span className="field-label">{t("Company *")}</span><ChoiceSelect required disabled={Boolean(editingId)} value={itemForm.organizationId} onChange={(event) => { setImageModified(false); setItemForm({ ...itemForm, image: "", organizationId: event.target.value, allowedEmployeeIds: [] }); }}><option value="">{t("Choose a company")}</option>{companies.map((company) => <option key={company.id} value={company.id}>{String(company.name)}</option>)}</ChoiceSelect></label><label className="form-field"><span className="field-label">{t("Item type *")}</span><ChoiceSelect value={itemForm.itemType} onChange={(event) => setItemForm({ ...itemForm, itemType: event.target.value })}>{["ingredient", "finished-product", "equipment", "consumable", "packaging", "other"].map((type) => <option key={type} value={type}>{t(type)}</option>)}</ChoiceSelect></label><Text label={t("SKU")} value={itemForm.sku} set={(value) => setItemForm({ ...itemForm, sku: value })} /><Text label={t("Name")} value={itemForm.name} set={(value) => setItemForm({ ...itemForm, name: value })} /><Text label={t("Unit")} value={itemForm.unit} set={(value) => setItemForm({ ...itemForm, unit: value })} /><Text label={t("Stock location")} value={itemForm.stockLocation} set={(value) => setItemForm({ ...itemForm, stockLocation: value })} />{!editingId && <Text label={t("Opening stock")} type="number" value={itemForm.openingStock} set={(value) => setItemForm({ ...itemForm, openingStock: value })} />}<Text label={t("Low-stock level")} type="number" value={itemForm.reorderPoint} set={(value) => setItemForm({ ...itemForm, reorderPoint: value })} /><label className="form-field field--full"><span className="field-label">{t("Notes")}</span><textarea rows={3} value={itemForm.notes} onChange={(event) => setItemForm({ ...itemForm, notes: event.target.value })} /></label>{isAdmin && <fieldset className="form-field field--full"><legend>{t("Employee access")}</legend><p className="hint">{t("Select employees who can access this item. They also need inventory permission in their account. The main admin retains access. With no employees selected, normal workspace permissions apply.")}</p>{employees.filter((employee) => employee.organizationId === itemForm.organizationId).map((employee) => <label className="check-field" key={employee.id}><input type="checkbox" checked={itemForm.allowedEmployeeIds.includes(employee.id)} onChange={(event) => setItemForm({ ...itemForm, allowedEmployeeIds: event.target.checked ? [...itemForm.allowedEmployeeIds, employee.id] : itemForm.allowedEmployeeIds.filter((id) => id !== employee.id) })} />{String(employee.name)}</label>)}</fieldset>}</div><InventoryPhotoUpload key={editingId + itemForm.organizationId} companyId={itemForm.organizationId} itemId={editingId || undefined} value={itemForm.image} disabled={saving} onChange={image => { setImageModified(true); setItemForm(current => ({ ...current, image })); }} onBusy={setPhotoBusy} /><button type="button" disabled={saving || photoBusy} onClick={() => setMode(null)}>{t("Cancel")}</button><button className="primary" disabled={saving || photoBusy}>{t("Save item")}</button></form></section>}{mode === "movement" && <section className="card inventory-editor" id="inventory-editor" tabIndex={-1}><h2>{t("Record stock movement")}</h2><form className="form" onSubmit={saveMovement}><div className="form-grid"><div className="form-field"><label className="field-label" htmlFor="movement-item">{t("Item")}</label><ChoiceSelect id="movement-item" required value={movementForm.inventoryItemId} onChange={(event) => setMovementForm({ ...movementForm, inventoryItemId: event.target.value })}>{items.map((item) => <option key={item.id} value={item.id}>{String(item.sku)} · {String(item.name)}</option>)}</ChoiceSelect></div><div className="form-field"><label className="field-label" htmlFor="movement-type">{t("Movement")}</label><ChoiceSelect id="movement-type" value={movementForm.type} onChange={(event) => setMovementForm({ ...movementForm, type: event.target.value })}>{["incoming", "outgoing", "return", "adjustment"].map((type) => <option key={type} value={type}>{t(type)}</option>)}</ChoiceSelect></div><Text label={t("Quantity")} type="number" value={movementForm.quantity} set={(value) => setMovementForm({ ...movementForm, quantity: value })} /><Text label={t("Date")} type="date" value={movementForm.date} set={(value) => setMovementForm({ ...movementForm, date: value })} /><Text label={t("Reason")} value={movementForm.reason} set={(value) => setMovementForm({ ...movementForm, reason: value })} /><Text label={t("Reference")} value={movementForm.reference} set={(value) => setMovementForm({ ...movementForm, reference: value })} /></div><p className="hint">{t("Duplicate movements are rejected. Negative stock requires a permitted item and explicit manager approval.")}</p><button type="button" disabled={saving} onClick={() => setMode(null)}>{t("Cancel")}</button><button className="primary" disabled={saving}>{t("Record movement")}</button></form></section>}
    <div className={`inventory-board${panelOpen ? " has-details" : ""}`}>
      <section className="card inventory-stock-report" inert={hiddenBehindPanel}>
        <div className="inventory-print-heading"><h1>{t("STOCRANT Inventory")}</h1><p>{companyFilter ? companyName({id: "", organizationId: companyFilter}) : t("All companies")} | {visible.length} {t("items | Printed")} {timestamp(new Date().toISOString())}</p>{query && <p>{t("Search:")} {query}</p>}{locationFilter && <p>{t("Location")}: {locationFilter}</p>}{statusFilter && <p>{t("Stock status")}: {t(statusFilter === "low" ? "Low stock" : statusFilter === "out" ? "Out of stock" : "In stock")}</p>}</div>
        <div className="inventory-toolbar workspace-toolbar">
          <div className="inventory-toolbar-heading"><h2>{t("Stock balance")}</h2><button type="button" disabled={loading || !visible.length} onClick={() => window.print()}><InventoryIcon name="print" />{t("Print inventory")}</button></div>
          <label className="inventory-search"><span className="field-label">{t("Search inventory")}</span><span className="inventory-search-field"><InventoryIcon name="search" /><input type="search" value={query} onChange={event => updateParams({ q: event.target.value })} placeholder={t("Search name, SKU, company, type or location")} /></span></label>
          <div className="inventory-filters">
            <label><span>{t("Company")}</span><ChoiceSelect aria-label={t("Filter by company")} value={companyFilter} onChange={event => updateParams({ company: event.target.value, location: "" })}><option value="">{t("All companies")}</option>{companies.map(company => <option key={company.id} value={company.id}>{text(company.name)}</option>)}</ChoiceSelect></label>
            <label><span>{t("Location")}</span><ChoiceSelect aria-label={t("Filter by location")} value={locationFilter} onChange={event => updateParams({ location: event.target.value })}><option value="">{t("All locations")}</option>{locationFilter && !locations.includes(locationFilter) && <option value={locationFilter}>{locationFilter}</option>}{locations.map(location => <option key={location} value={location}>{location}</option>)}</ChoiceSelect></label>
            <label><span>{t("Stock status")}</span><ChoiceSelect aria-label={t("Filter by stock status")} value={statusFilter} onChange={event => updateParams({ status: event.target.value })}><option value="">{t("All statuses")}</option><option value="in">{t("In stock")}</option><option value="low">{t("Low stock")}</option><option value="out">{t("Out of stock")}</option></ChoiceSelect></label>
            <span className="inventory-result-count" role="status">{t("{count} of {total} items", { count: visible.length, total: items.length })}</span>
            {(query || companyFilter || locationFilter || statusFilter) && <button type="button" onClick={() => updateParams({ q: "", company: "", location: "", status: "" })}>{t("Clear filters")}</button>}
          </div>
        </div>
        {loading ? <p className="empty" role="status">{t("Loading inventory…")}</p> : <>
          <div className="table-wrap"><table className="table inventory-table"><caption className="visually-hidden">{t("Stock balance")}</caption><thead><tr><th scope="col">{t("Item")}</th><th scope="col">{t("Company")}</th><th scope="col" className="inventory-print-only">{t("Type")}</th><th scope="col">{t("Location")}</th>{stockKeys.map(([label, key]) => <th scope="col" className="inventory-print-only" key={key}>{t(label)}</th>)}<th scope="col">{t("Available")}</th><th scope="col">{t("Stock status")}</th><th scope="col">{t("Last change")}</th><th scope="col" className="inventory-no-print"><span className="visually-hidden">{t("Actions")}</span></th></tr></thead><tbody>
            {visible.map(item => { const last = latestChanges.get(item.id); return <tr key={item.id} data-item-id={item.id} className={selectedId === item.id ? "is-selected" : ""} onClick={event => { if (!(event.target as HTMLElement).closest("button, summary, details, a")) openItem(item, event.currentTarget.querySelector<HTMLButtonElement>(".inventory-item-link") || undefined); }}>
              <td className="inventory-item-name"><div className="inventory-item-cell"><ItemPhoto item={item} /><div><button type="button" className="inventory-item-link" aria-expanded={selectedId === item.id && panelOpen} aria-controls={selectedId === item.id && panelOpen ? "inventory-details" : undefined} onClick={event => openItem(item, event.currentTarget)}>{text(item.name, t("Inventory item"))}</button><span className="cell-sub">{t("SKU")}: {text(item.sku, t("Not recorded"))}</span><span className="inventory-print-only">{t("AWB:")} {text(item.awb, t("Assigned on save"))} · {text(item.unit)}</span></div></div></td>
              <td className="inventory-company" data-label={t("Company")}>{companyName(item)}</td><td className="inventory-print-only">{t(text(item.itemType, "Not set"))}</td><td className="inventory-location" data-label={t("Location")}>{text(item.stockLocation, t("Not recorded"))}</td>{stockKeys.map(([, key]) => <td className="inventory-print-only" key={key}>{text(item[key], "0")}</td>)}<td className="inventory-quantity" data-available={item.id}><strong>{text(item.available, "0")}</strong><small>{text(item.unit)}</small></td><td className="inventory-stock-status"><StockStatus item={item} /></td><td className="inventory-last-change">{timestamp(last?.at)}<span className="cell-sub">{last?.user}</span></td>
              <td className="inventory-no-print"><ItemActions item={item} onView={trigger => openItem(item, trigger)} onEdit={permits("edit") ? () => editItem(item) : undefined} onMovement={permits("create") ? trigger => { openItem(item, trigger); recordMovement(item); } : undefined} /></td>
            </tr>; })}
          </tbody></table></div>
          {!visible.length && <div className="empty" role="status"><InventoryIcon name="box" /><p>{t(items.length ? "No matching items. Try another search or filter." : error ? "Inventory could not be loaded. Try again." : "No inventory items yet.")}</p>{Boolean(items.length) && <button type="button" onClick={() => updateParams({ q: "", company: "", location: "", status: "" })}>{t("Clear filters")}</button>}</div>}
        </>}
      </section>
      {selected && panelOpen && <aside ref={panelRef} id="inventory-details" className="card inventory-detail-panel" tabIndex={-1} role={mobile ? "dialog" : "region"} aria-modal={mobile ? true : undefined} aria-labelledby="inventory-details-heading" onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); closeItem(); }
        if (mobile && event.key === "Tab") { const controls = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"], summary') || []).filter(element => element.getClientRects().length); const first = controls[0], last = controls[controls.length - 1]; if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
      }}>
        <div className="inventory-detail-heading"><h2 id="inventory-details-heading">{t("Item details")}</h2><button type="button" className="inventory-icon-button" aria-label={t("Close item details")} onClick={closeItem}><InventoryIcon name="close" /></button></div>
        <ItemPhoto item={selected} large />
        <div className="inventory-detail-title"><div><h3>{text(selected.name)}</h3><span className="cell-sub">{t("SKU")}: {text(selected.sku, t("Not recorded"))}</span></div><StockStatus item={selected} /></div>
        <div className="inventory-detail-summary"><div><span>{t("Available")}</span><strong data-detail-available>{text(selected.available, "0")} <small>{text(selected.unit)}</small></strong></div><div><span>{t("Location")}</span><strong>{text(selected.stockLocation, t("Not recorded"))}</strong></div></div>
        {permits("edit") && <InventoryPhotoUpload key={selected.id} companyId={text(selected.organizationId)} itemId={selected.id} value={text(selected.image !== undefined ? selected.image : selected.imageUrl || selected.photoUrl)} preview={false} disabled={saving} onBusy={setPhotoBusy} onChange={async image => { const result = await api.workspace.updateInventoryItem(selected.id, { image }); setNotice(result.pending ? "The item change was sent for approval." : "Inventory picture saved."); await load(); }} />}
        <div className="inventory-detail-tabs" role="tablist" aria-label={t("Item details")}><button type="button" id="inventory-overview-tab" role="tab" tabIndex={detailTab === "overview" ? 0 : -1} aria-selected={detailTab === "overview"} aria-controls="inventory-overview" onClick={() => setDetailTab("overview")} onKeyDown={event => { if (["ArrowLeft", "ArrowRight", "End"].includes(event.key)) { event.preventDefault(); setDetailTab("movements"); document.getElementById("inventory-movements-tab")?.focus(); } }}>{t("Overview")}</button><button type="button" id="inventory-movements-tab" role="tab" tabIndex={detailTab === "movements" ? 0 : -1} aria-selected={detailTab === "movements"} aria-controls="inventory-movements" onClick={() => setDetailTab("movements")} onKeyDown={event => { if (["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) { event.preventDefault(); setDetailTab("overview"); document.getElementById("inventory-overview-tab")?.focus(); } }}>{t("Movements")}</button></div>
        <div hidden={detailTab !== "overview"} id="inventory-overview" role="tabpanel" aria-labelledby="inventory-overview-tab" tabIndex={0}><dl className="inventory-detail-facts">{[["SKU", text(selected.sku, t("Not recorded"))], ["Company", companyName(selected)], ["Type", t(text(selected.itemType, "Not set"))], ["Location", text(selected.stockLocation, t("Not recorded"))], ...stockKeys.map(([label, key]) => [label, text(selected[key], "0")]), ["Available", text(selected.available, "0")], ["Low-stock level", text(selected.reorderPoint, "0")], ["AWB:", text(selected.awb, t("Assigned on save"))]].map(([label, value]) => <div key={label}><dt>{t(label)}</dt><dd>{value}</dd></div>)}</dl>{selected.notes ? <p className="inventory-detail-notes">{text(selected.notes)}</p> : null}</div><div hidden={detailTab !== "movements"} id="inventory-movements" role="tabpanel" aria-labelledby="inventory-movements-tab" tabIndex={0}><h3 className="visually-hidden">{t("Stock movement history")}</h3>{itemMovements.length ? <ol className="inventory-movement-list">{itemMovements.map(entry => <li key={entry.id}><div><strong>{t(text(entry.type))}</strong><b>{text(entry.quantity)} {text(selected.unit)}</b></div><time>{timestamp(entry.createdAt || entry.date)}</time><span>{text(entry.responsibleUser || entry.createdByName, t("Unknown"))}</span>{entry.reason ? <p>{text(entry.reason)}</p> : null}{entry.reference ? <small>{t("Reference")}: {text(entry.reference)}</small> : null}</li>)}</ol> : <p className="empty">{t("No movements recorded for this item.")}</p>}<h3>{t("Change history")}</h3>{itemHistory.length ? <ol className="inventory-movement-list">{itemHistory.map(entry => <li key={entry.id}><strong>{t(text(entry.action))}</strong><time>{timestamp(entry.occurredAt)}</time><span>{text(entry.actor, t("Unknown"))}</span><small>{t("Changed:")} {Array.isArray(entry.changedFields) ? entry.changedFields.map(field => t(text(field))).join(", ") : t("Item information")}</small></li>)}</ol> : <p className="hint">{t("New item changes will be recorded here.")}</p>}</div>
        <div className="inventory-detail-actions">{permits("edit") && <button type="button" disabled={photoBusy} onClick={() => editItem(selected)}>{t("Edit")}</button>}{permits("create") && <button type="button" className="primary" disabled={saving || photoBusy} onClick={() => recordMovement(selected)}>{t("Record movement")}</button>}</div>
      </aside>}
    </div>
    {selectedId && !selected && !loading && !error && <p role="status" className="hint">{t("This item is unavailable within your access.")} <button type="button" onClick={closeItem}>{t("Close item details")}</button></p>}
    <details className="card inventory-history" inert={hiddenBehindPanel}><summary>{t("Change history")} · {t("Stock movement history")}</summary><div className="timeline">{[...history, ...movements].filter(entry => !companyFilter || entry.organizationId === companyFilter).sort(orderLatest).slice(0, 50).map(entry => <div className="timeline-row" key={entry.id}><strong>{text(items.find(item => item.id === entry.inventoryItemId)?.name, t("Inventory item"))} · {t(text(entry.type || entry.action))} {text(entry.quantity)}</strong><span>{text(entry.actor || entry.responsibleUser || entry.createdByName, t("Unknown"))} · {timestamp(changeDate(entry))}</span><small>{text(entry.reason) || (Array.isArray(entry.changedFields) ? entry.changedFields.map(field => t(text(field))).join(", ") : t("Item information"))}</small></div>)}</div>{!history.length && !movements.length && <p className="empty">{t("New item changes will be recorded here.")}</p>}</details>
  </div>;
}

function StockStatus({ item }: { item: CollectionItem }) { const { t } = useLanguage(); const label = stockStatus(item); return <span className={`inventory-status ${label === "In stock" ? "is-available" : label === "Out of stock" ? "is-out" : "is-low"}`}><span aria-hidden="true" />{t(label)}</span>; }
function ItemPhoto({ item, large = false }: { item: CollectionItem; large?: boolean }) {
  const { t } = useLanguage();
  const candidate = text(item.image !== undefined ? item.image : item.imageUrl || item.photoUrl || (Array.isArray(item.photos) ? item.photos[0] : ""));
  const source = /^(https?:\/\/|\/(?!\/))/.test(candidate) ? candidate : "";
  const [failed, setFailed] = useState("");
  return <div className={`inventory-photo${large ? " is-large" : ""}`}>{source && failed !== source ? <ShopImage src={source} alt={large ? text(item.name) : ""} onError={() => setFailed(source)} /> : <span role={large ? "img" : undefined} aria-label={large ? t("No product photo") : undefined} aria-hidden={large ? undefined : true}><InventoryIcon name="box" />{large && <small>{t("No product photo")}</small>}</span>}</div>;
}
function InventoryIcon({ name }: { name: "search" | "print" | "box" | "more" | "close" }) { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{name === "search" ? <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></> : name === "print" ? <><path d="M6 9V3h12v6M6 17H3V9h18v8h-3M6 14h12v7H6z" /><path d="M17 12h1" /></> : name === "box" ? <><path d="m12 3 9 5-9 5-9-5 9-5ZM3 8v9l9 5 9-5V8M12 13v9M7.5 5.5l9 5" /></> : name === "close" ? <path d="m6 6 12 12M6 18 18 6" /> : <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>}</svg>; }
function Text({ label, value, set, type = "text" }: { label: string; value: string; set: (value: string) => void; type?: string }) { return <label className="form-field"><span className="field-label">{label}</span><input required step={type === "number" ? "any" : undefined} type={type} value={value} onChange={event => set(event.target.value)} /></label>; }

function ItemActions({ item, onView, onEdit, onMovement }: { item: CollectionItem; onView: (trigger: HTMLElement) => void; onEdit?: () => void; onMovement?: (trigger: HTMLElement) => void }) {
  const { t } = useLanguage();
  const id = useId(), trigger = useRef<HTMLButtonElement>(null), popover = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  useEffect(() => {
    if (!position) return;
    popover.current?.querySelector('button')?.focus();
    const outside = (event: Event) => { if (!popover.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setPosition(null); };
    const close = () => setPosition(null);
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); setPosition(null); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", outside); document.addEventListener("focusin", outside); document.addEventListener("keydown", escape); window.addEventListener("resize", close); document.addEventListener("scroll", close, true);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("focusin", outside); document.removeEventListener("keydown", escape); window.removeEventListener("resize", close); document.removeEventListener("scroll", close, true); };
  }, [position]);
  return <><button ref={trigger} type="button" className="inventory-icon-button" aria-label={t("Actions for {name}", { name: text(item.name) })} aria-expanded={Boolean(position)} aria-controls={position ? id : undefined} onClick={event => {
    const rect = event.currentTarget.getBoundingClientRect(), height = 12 + 44 * (1 + Number(Boolean(onEdit)) + Number(Boolean(onMovement)));
    setPosition(position ? null : { top: rect.bottom + height + 8 < innerHeight ? rect.bottom + 4 : Math.max(8, rect.top - height - 4), left: Math.max(8, Math.min(rect.right - 185, innerWidth - 193)) });
  }}><InventoryIcon name="more" /></button>{position && createPortal(<div ref={popover} id={id} className="inventory-actions-popover" role="group" aria-label={t("Actions for {name}", { name: text(item.name) })} style={position}><button type="button" onClick={() => { setPosition(null); if (trigger.current) onView(trigger.current); }}>{t("View details")}</button>{onEdit && <button type="button" onClick={() => { setPosition(null); onEdit(); }}>{t("Edit")}</button>}{onMovement && <button type="button" onClick={() => { setPosition(null); if (trigger.current) onMovement(trigger.current); }}>{t("Record movement")}</button>}</div>, document.body)}</>;
}
