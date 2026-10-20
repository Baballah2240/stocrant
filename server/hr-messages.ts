import { Router } from "express";
import { z } from "zod";
import type { AuthenticatedUser } from "./auth.js";
import { accountScopeActive } from "./auth.js";
import { can, isWithinScope, ownRecordsRequired } from "./permissions.js";
import { getCollection, getStore, nextCollectionId, saveStore, transaction } from "./storage.js";
import { createNotification, getNotificationStore, saveNotificationStore } from "./notifications.js";
import { audit } from "./workspace.js";
import { issueEmployeeInvitation, employmentInactive } from "./employee-accounts.js";
import { onboardingStatus } from "./onboarding.js";

type Row = Record<string, unknown> & { id: string };
const rows = (key: string) => getCollection(key) as Row[];
export function managesEmployees(user: AuthenticatedUser | undefined) { return Boolean(user && can(user, "hr", "view") && can(user, "hr", "edit") && !ownRecordsRequired(user)); }
function employeesFor(user: AuthenticatedUser) { return rows("employees").filter(row => isWithinScope(user, row)); }
function allowedCampaign(user: AuthenticatedUser, campaign: Row) {
  const recipients = Array.isArray(campaign.employeeIds) ? campaign.employeeIds.map(String) : [];
  return managesEmployees(user) && recipients.length > 0 && recipients.every(id => employeesFor(user).some(row => row.id === id));
}
const text = (max: number) => z.string().trim().min(1).max(max).refine(value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value));
const messageSchema = z.object({
  title: text(160), message: text(6000), type: z.enum(["Urgent Shift Change", "Shift Reminder", "Meeting Invitation", "Important Announcement", "General Message"]),
  priority: z.enum(["Normal", "Important", "Urgent"]),
  employeeIds: z.array(z.string().min(1)).max(2000).default([]), companyId: z.string().optional(), allCompany: z.boolean().default(false),
  url: z.string().trim().max(2000).default("").refine(value => { if (!value) return true; try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; } }),
  effectiveAt: z.string().datetime({ offset: true }).optional(), shiftTime: z.string().trim().max(100).default(""), location: z.string().trim().max(240).default(""),
  acknowledgmentRequired: z.boolean().default(false), scheduledAt: z.string().datetime({ offset: true }).optional(), requestKey: z.string().uuid(),
}).strict();

/** Durable schedule: dispatches at startup/poll time and periodically while the server runs. */
export function dispatchHrMessages(now = new Date()) {
  const due = rows("hrMessages").filter(row => row.status === "scheduled" && Date.parse(String(row.scheduledAt)) <= now.getTime());
  if (!due.length) return;
  transaction(() => {
    for (const campaign of due) {
      const sender = rows("accessUsers").find(row => row.id === campaign.senderId);
      // Revalidate sender and recipient scope at delivery time (permissions may have changed).
      let senderUser: AuthenticatedUser | undefined;
      if (sender?.status === "active") senderUser = campaignSender(sender);
      const permitted = senderUser && accountScopeActive(sender!) && allowedCampaign(senderUser, campaign);
      const recipients = (campaign.employeeIds as string[]).map(id => rows("employees").find(row => row.id === id));
      if (!permitted) { campaign.status = "blocked"; campaign.blockedAt = now.toISOString(); continue; }
      let sent = 0;
      for (const employee of recipients) {
        const account = employee && rows("accessUsers").find(row => row.employeeId === employee.id && (!campaign.recipientAccounts || (campaign.recipientAccounts as Record<string,string>)[employee.id] === row.id) && ["active", "invited"].includes(String(row.status)));
        if (!account || !employee || employmentInactive(employee.status)) continue;
        const notice = createNotification({ userId: account.id, user: String(account.name), type: "hr_message", severity: campaign.priority === "Urgent" ? "critical" : campaign.priority === "Important" ? "warning" : "info", message: String(campaign.message), target: campaign.id });
        Object.assign(notice, { title: campaign.title, senderName: campaign.senderName, senderId: campaign.senderId, hrType: campaign.type, priority: campaign.priority,
          url: campaign.url, effectiveAt: campaign.effectiveAt, shiftTime: campaign.shiftTime, location: campaign.location, acknowledgmentRequired: campaign.acknowledgmentRequired, campaignId: campaign.id });
        sent++;
      }
      campaign.status = "sent"; campaign.sentAt = now.toISOString(); campaign.sentCount = sent;
      audit(senderUser, "hr.notification-sent", { targetId: campaign.id, recipientCount: sent });
    }
    saveStore(getStore());
  });
}
// publicUser reads the live role and company restrictions, never a saved permissions snapshot.
import { publicUser } from "./auth.js";
function campaignSender(row: Row) { return publicUser(row as Parameters<typeof publicUser>[0]); }

const router = Router();
router.use((req, res, next) => { if (!managesEmployees(req.auth)) return res.status(403).json({ error: "HR employee management permission is required." }); next(); });
router.get("/employees", (req, res) => {
  res.json({ employees: employeesFor(req.auth!).map(employee => { const account = rows("accessUsers").find(row => row.employeeId === employee.id); return { id: employee.id, name: employee.name, employeeCode: employee.employeeCode, organizationId: employee.organizationId, department: employee.department, jobTitle: employee.jobTitle, email: employee.email, phone: employee.phone, status: employee.status, account: account ? { id: account.id, status: account.status, roleId: account.roleId, username: account.username, activationRequired: account.activationRequired === true } : null }; }), companies: rows("companies").filter(row => isWithinScope(req.auth!, { ...row, organizationId: row.id })).map(row => ({ id: row.id, name: row.name })) });
});
router.get("/employees/:id/account", (req, res) => {
  const employee = employeesFor(req.auth!).find(row => row.id === req.params.id);
  if (!employee) return res.status(404).json({ error: "Employee not found." });
  const account = rows("accessUsers").find(row => row.employeeId === employee.id);
  const company = rows("companies").find(row => row.id === employee.organizationId);
  res.json({ delivery:onboardingStatus(employee.id), employeeCode:employee.employeeCode, companyName:company?.name, organizationName:rows("organizations").find(row=>row.id===company?.parentOrganizationId)?.name,
    account:account ? { id:account.id,username:account.username,status:account.status,roleName:rows("accessRoles").find(row=>row.id===account.roleId)?.name || "Employee",activationRequired:account.activationRequired === true } : null });
});
router.post("/employees/:id/invitation", (req, res) => {
  const employee = employeesFor(req.auth!).find(row => row.id === req.params.id);
  if (!employee) return res.status(404).json({ error: "Employee not found." });
  try { res.json(transaction(() => issueEmployeeInvitation(req.auth!, employee))); } catch (error) { res.status(409).json({ error: (error as Error).message }); }
});
router.post("/employees/:id/suspend", (req, res) => {
  const employee = employeesFor(req.auth!).find(row => row.id === req.params.id);
  const account = employee && rows("accessUsers").find(row => row.employeeId === employee.id);
  if (!employee || !account) return res.status(404).json({ error: "Employee account not found." });
  if (account.roleId !== "role-employee" || account.id === req.auth!.id) return res.status(403).json({ error: "Use authorized user management for administrator accounts." });
  transaction(() => { account.status = "suspended"; getStore().collections.sessions = rows("sessions").filter(row => row.accountId !== account.id); getStore().collections.employeeInvitations = rows("employeeInvitations").filter(row => row.accountId !== account.id); saveStore(getStore()); audit(req.auth, "access.employee-account-suspended", { targetId: account.id, organizationId: employee.organizationId }); });
  res.json({ ok: true });
});
router.get("/messages", (req, res) => {
  dispatchHrMessages();
  res.json({ items: rows("hrMessages").filter(row => allowedCampaign(req.auth!, row)).map(row => ({ ...row, recipients: (row.employeeIds as string[]).map(id => { const employee = rows("employees").find(item => item.id === id); const accountId = (row.recipientAccounts as Record<string,string> | undefined)?.[id]; const account = rows("accessUsers").find(item => accountId ? item.id === accountId : item.employeeId === id); const notice = getNotificationStore().find(item => item.target === row.id && item.userId === account?.id && item.type === "hr_message"); return { employeeId: id, name: employee?.name, status: !notice ? "not sent" : notice.acknowledgedAt ? "acknowledged" : (notice.readAt || notice.read) ? "read" : notice.deliveredAt ? "delivered" : "sent", readAt: notice?.readAt, deliveredAt: notice?.deliveredAt, acknowledgedAt: notice?.acknowledgedAt }; }) })) });
});
router.post("/messages", (req, res) => {
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Check the title, message, recipients, dates, and HTTPS meeting link." });
  const input = parsed.data;
  if (input.type === "Urgent Shift Change") input.priority = "Urgent";
  if (input.scheduledAt && (Date.parse(input.scheduledAt) <= Date.now() || Date.parse(input.scheduledAt) > Date.now() + 366 * 86400000)) return res.status(400).json({ error: "Choose a future send time within one year." });
  const allowed = employeesFor(req.auth!);
  const ids = [...new Set(input.allCompany ? allowed.filter(row => row.organizationId === input.companyId).map(row => row.id) : input.employeeIds)];
  if (!ids.length || ids.some(id => !allowed.some(row => row.id === id))) return res.status(403).json({ error: "Choose employees within your authorized company and location." });
  if (ids.some(id => { const employee = allowed.find(row => row.id === id)!; return employmentInactive(employee.status) || !rows("accessUsers").some(account => account.employeeId === id && ["active", "invited"].includes(String(account.status))); })) return res.status(409).json({ error: "Every recipient needs an active or invited linked account." });
  const existing = rows("hrMessages").find(row => row.senderId === req.auth!.id && row.requestKey === input.requestKey);
  if (existing) return res.json({ id: existing.id, status: existing.status });
  const campaign: Row = { ...input, id: nextCollectionId("hrMessages"), employeeIds: ids, recipientAccounts: Object.fromEntries(ids.map(id => [id, rows("accessUsers").find(row => row.employeeId === id)!.id])), senderId: req.auth!.id, senderName: req.auth!.name, createdAt: new Date().toISOString(), scheduledAt: input.scheduledAt || new Date().toISOString(), status: "scheduled" };
  transaction(() => { getStore().collections.hrMessages = [...rows("hrMessages"), campaign]; saveStore(getStore()); audit(req.auth, "hr.notification-created", { targetId: campaign.id, recipientCount: ids.length }); dispatchHrMessages(); });
  res.status(201).json({ id: campaign.id, status: campaign.status });
});
router.post("/messages/:id/remind", (req, res) => {
  const campaign = rows("hrMessages").find(row => row.id === req.params.id);
  if (!campaign || !allowedCampaign(req.auth!, campaign)) return res.status(404).json({ error: "Message not found." });
  if (!campaign.acknowledgmentRequired || campaign.status !== "sent") return res.status(409).json({ error: "This message does not need an acknowledgment reminder." });
  if (campaign.lastReminderAt && Date.parse(String(campaign.lastReminderAt)) > Date.now() - 3600000) return res.status(429).json({ error: "Wait one hour before sending another reminder." });
  transaction(() => { const notices = getNotificationStore(); for (const notice of notices.filter(item => item.type === "hr_message" && item.target === campaign.id && !item.acknowledgedAt)) { const account = rows("accessUsers").find(row => row.id === notice.userId); if (account?.status !== "active" || !(campaign.employeeIds as string[]).includes(String(account.employeeId)) || (campaign.recipientAccounts && (campaign.recipientAccounts as Record<string,string>)[String(account.employeeId)] !== account.id)) continue; notice.read = false; notice.remindedAt = new Date().toISOString(); } campaign.lastReminderAt = new Date().toISOString(); saveNotificationStore(notices); audit(req.auth, "hr.notification-reminded", { targetId: campaign.id }); });
  res.json({ ok: true });
});
export default router;
