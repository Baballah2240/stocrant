export type ActionFeedback = { message: string; kind: "success" | "error"; recordActivity?: boolean };
export function isImportantActivity(message: string): boolean {
  return !/^(Signed |Notification |All notifications |(?:Light|Dark) mode |Print dialog |Language |App lock |Biometric )/i.test(message);
}
export function notifyAction(message: string, kind: ActionFeedback["kind"] = "success", recordActivity = false) {
  window.dispatchEvent(new CustomEvent<ActionFeedback>("stocrant:action", { detail: { message, kind, recordActivity } }));
}
export function actionMessage(path: string, method: string, input?: unknown): string {
  if (path === "/auth/login") return "Signed in successfully.";
  if (path === "/auth/logout") return "Signed out.";
  if (path === "/auth/setup") return "Workspace created.";
  if (path === "/auth/profile") return "Profile updated.";
  if (path === "/auth/password") return "Password changed. Sign in with your new password.";
  if (path === "/auth/forgot-password") return "Password reset request received.";
  if (path === "/public/contact") return "Your message was received.";
  if (path.endsWith("check-in")) return "Checked in for today.";
  if (path.endsWith("check-out")) return "Checked out for today.";
  if (path.includes("/self-service/leave")) return path.endsWith("cancel") ? "Leave request cancelled." : "Leave request sent for review.";
  if (path.startsWith("/notifications/")) return path.endsWith("read-all") ? "All notifications marked as read." : "Notification marked as read.";
  if (path.includes("/approvals/") && input && typeof input === "object" && "decision" in input) return input.decision === "approve" ? "Request approved." : "Request rejected.";
  if (path.startsWith("/workspace/export/")) return "Export prepared.";
  const resource = path.includes("/finance/transactions") ? "Financial movement" : path.includes("/finance/accounts") ? "Account" : path.includes("/inventory/movements") ? "Stock movement" : path.includes("/inventory/items") ? "Inventory item" : path.includes("/access/users") ? "User" : path.includes("/access/roles") ? "Role" : path.includes("/work") ? "Work record" : path.includes("/locations") ? "Location activity" : path.includes("/employees") ? "Employee" : path.includes("/companies") ? "Company" : "Record";
  return `${resource} ${method === "DELETE" ? "removed" : method === "PATCH" || method === "PUT" ? "updated" : "saved"}.`;
}
