import { printPage } from "./device-actions";
import "./print-selection.css";
let clearPrevious:(()=>void)|undefined;

/** Print a detached snapshot; never rely on page/modal visibility to redact a report. */
export async function printSelection(element: HTMLElement, title?: string) {
  clearPrevious?.();
  document.querySelectorAll("[data-print-selection]").forEach(node=>node.remove());
  const root=document.createElement("section");
  root.dataset.printSelection="true";
  root.dir=document.documentElement.dir;
  root.lang=document.documentElement.lang;
  if(title){const heading=document.createElement("h1");heading.textContent=title;root.append(heading);}
  const snapshot=element.cloneNode(true) as HTMLElement;
  snapshot.querySelectorAll("button,.finance-no-print,.payroll-no-print,.finance-print-hide").forEach(node=>node.remove());
  snapshot.querySelectorAll("[id]").forEach(node=>node.removeAttribute("id"));
  snapshot.removeAttribute("id");
  if(snapshot.tagName==="TR"){
    const table=document.createElement("table"),body=document.createElement("tbody");
    const headings=element.closest("table")?.querySelector("thead")?.cloneNode(true) as HTMLElement|undefined;
    if(headings){headings.querySelectorAll(".finance-no-print,.payroll-no-print").forEach(node=>node.remove());table.append(headings);}
    body.append(snapshot);table.append(body);root.append(table);
  }else root.append(snapshot);
  document.body.append(root);
  document.body.dataset.printSelection="true";
  const clear=()=>{
    root.remove();delete document.body.dataset.printSelection;
    window.removeEventListener("afterprint",clear);window.removeEventListener("pagehide",clear);
    document.removeEventListener("pointerdown",clear,true);document.removeEventListener("keydown",clear,true);
    if(clearPrevious===clear)clearPrevious=undefined;
  };
  clearPrevious=clear;
  window.addEventListener("afterprint",clear,{once:true});
  window.addEventListener("pagehide",clear,{once:true});
  // Android can finish its print handoff without an afterprint event. Drop the
  // private snapshot before the user next interacts with the application.
  document.addEventListener("pointerdown",clear,{once:true,capture:true});
  document.addEventListener("keydown",clear,{once:true,capture:true});
  try {await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));await printPage();}
  catch(error){window.removeEventListener("afterprint",clear);clear();throw error;}
}
