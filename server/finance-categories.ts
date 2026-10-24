/** Pure classification shared by the API and browser reports. No storage or runtime dependencies. */
export function financialCategory(row: Record<string,unknown>): "revenue"|"purchases"|"expenses"|"payroll"|"excluded" {
  if(row.type === "income" || row.type === "refund" && row.sourceCollection === "returns") return "revenue";
  if(row.type === "payroll") return "payroll";
  if(row.type === "expense" && row.sourceCollection === "purchases") return "purchases";
  if(["expense","reimbursement","tax"].includes(String(row.type))) return "expenses";
  return "excluded";
}
