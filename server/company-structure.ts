import type { AuthenticatedUser } from "./auth.js";
import { getCollection } from "./storage.js";
import { isWithinScope } from "./permissions.js";
type Row = Record<string, unknown>;
const rows = (name: string) => getCollection(name) as Row[];
const companyOf = (row: Row) => row.organizationId ?? row.companyId;
function fail(message: string): never { throw Object.assign(new Error(message), {statusCode:400}); }

/** Additive stable links. Legacy display names remain intact until explicitly assigned. */
export function validateStructure(user: AuthenticatedUser, collection: string, action: string, input: Row, current?: Row): Row {
  if (!["employees", "departments"].includes(collection)) return input;
  const next = {...current, ...input}, company = companyOf(next);
  for(const field of ["managerId","departmentId","sectionId","parentDepartmentId"]) if(next[field]!==undefined&&typeof next[field]!=="string") fail("Choose valid reporting assignments.");
  const related = (name: string, id: unknown) => rows(name).find(row => row.id === id && companyOf(row) === company && isWithinScope(user,row));
  if (action === "delete" || current && companyOf(current) !== company) {
    if (collection === "employees" && [...rows("employees"),...rows("departments")].some(row=>row.managerId===current?.id)) fail("Reassign reporting relationships before removing or transferring this manager.");
    if (collection === "departments" && [...rows("employees"),...rows("departments")].some(row=>row.departmentId===current?.id||row.sectionId===current?.id||row.parentDepartmentId===current?.id)) fail("Reassign linked sections and employees before removing or transferring this department.");
  }
  if (action === "delete") return input;
  if (collection === "departments") {
    const members=current?rows("employees").filter(row=>row.departmentId===current.id||row.sectionId===current.id):[];
    if(current&&members.length&&((current.kind||"department")!==(next.kind||"department")||next.parentDepartmentId!==current.parentDepartmentId)) fail("Reassign linked employees before moving this section or changing its structure type.");
    if (!company) fail("Choose a valid company for this department.");
    if (next.kind && !["department","section"].includes(String(next.kind))) fail("Choose a valid structure type.");
    if (next.status && !["active","inactive"].includes(String(next.status))) fail("Choose a valid department status.");
    if (next.kind === "section") {
      const parent = related("departments", next.parentDepartmentId);
      if (!parent || parent.kind === "section" || parent.id === current?.id || parent.status === "inactive" && next.parentDepartmentId !== current?.parentDepartmentId) fail("Choose an active parent department from this company.");
    } else if (next.parentDepartmentId) fail("Only sections can have a parent department.");
    if (current && current.kind !== next.kind && rows("departments").some(row=>row.parentDepartmentId===current.id)) fail("Move child sections before changing this department type.");
    if (rows("departments").some(row=>row.id!==current?.id&&companyOf(row)===company&&(row.parentDepartmentId||"")===(next.parentDepartmentId||"")&&String(row.name).trim().toLocaleLowerCase()===String(next.name).trim().toLocaleLowerCase())) fail("A department or section with this name already exists here.");
  } else {
    if(input.departmentId===""&&current?.departmentId) input={...input,department:""};
    if (next.departmentId) {
      const department=related("departments",next.departmentId);
      if (!department || department.kind === "section" || department.status === "inactive" && next.departmentId !== current?.departmentId) fail("Choose an active department from this company.");
      input={...input,department:department.name};
    }
    if (next.sectionId) {
      const section=related("departments",next.sectionId);
      if (!section || section.kind!=="section" || section.parentDepartmentId!==next.departmentId || section.status==="inactive" && next.sectionId!==current?.sectionId) fail("Choose an active section from the selected department.");
    }
  }
  if (next.managerId) {
    const manager=related("employees",next.managerId);
    if (!manager || ["inactive","terminated","suspended"].includes(String(manager.status)) && next.managerId!==current?.managerId) fail("Choose an active manager from this company.");
    if (collection === "employees") {
      const visited=new Set<unknown>([current?.id].filter(Boolean)); let cursor: Row|undefined=manager;
      while(cursor){ if(visited.has(cursor.id)) fail("Reporting relationships cannot form a cycle.");visited.add(cursor.id);cursor=cursor.managerId?rows("employees").find(row=>row.id===cursor!.managerId):undefined; }
    }
    input={...input,manager:manager.name};
  } else if (input.managerId === "") input={...input,manager:""};
  return input;
}
