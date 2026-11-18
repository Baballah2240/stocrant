/** How a company counts each employee's salary period (set on the company record). */
export const salaryCountingOptions = ["from payroll period start", "from assignment date", "from last salary paid"] as const;
export type SalaryCountingBasis = typeof salaryCountingOptions[number];
const MAX_DAYS = 400;
const day = (value: string, offset: number) => new Date(Date.parse(value + "T00:00:00Z") + offset * 86_400_000).toISOString().slice(0, 10);
const iso = /^\d{4}-\d{2}-\d{2}$/;

export function salaryBasis(company: { [key: string]: unknown }): SalaryCountingBasis {
  const value = String(company.salaryCountingBasis || "");
  return (salaryCountingOptions as readonly string[]).includes(value) ? value as SalaryCountingBasis : "from payroll period start";
}

/**
 * The first day an employee's salary is counted in a payroll run ending on `periodEnd`.
 * - from payroll period start: the run's start date (hire dates inside the period still prorate).
 * - from assignment date: the first salary starts on the assignment (hire) date, even before the run start; later ones use the run start.
 * - from last salary paid: the day after the last salary period already in payroll, so unpaid gaps are included and nothing is paid twice.
 */
export function salaryWindowStart(input: { basis: SalaryCountingBasis; periodStart: string; periodEnd: string; hireDate?: unknown; lastPaidEnd?: string }): string {
  const { basis, periodStart, periodEnd, lastPaidEnd } = input, hire = iso.test(String(input.hireDate || "")) ? String(input.hireDate) : "";
  let start = periodStart;
  if (basis === "from assignment date" && !lastPaidEnd && hire) start = hire;
  if (basis === "from last salary paid") start = lastPaidEnd ? day(lastPaidEnd, 1) : hire || periodStart;
  if (hire && start < hire) start = hire;
  if (start > periodEnd) throw new Error(`Salary is already counted through ${lastPaidEnd || start}. Choose a later period end.`);
  if ((Date.parse(periodEnd) - Date.parse(start)) / 86_400_000 + 1 > MAX_DAYS) throw new Error(`The unpaid salary period from ${start} is longer than ${MAX_DAYS} days. Pay it in shorter custom periods.`);
  return start;
}
