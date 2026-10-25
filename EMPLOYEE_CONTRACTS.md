# Employee contracts

Open **HR → Employee contracts**. Every employee within the manager's company/location scope appears, including those whose contract has not been prepared.

1. The assigned **HR Manager** selects an employee, fills the title/reference/dates and uploads the company's PDF (up to 10 MB). Saving creates a private draft.
2. HR selects **Send to Company Manager**. The PDF is locked while pending; HR can withdraw it to edit. An active assigned Company Manager with HR approval permission must exist.
3. The **Company Manager** downloads the review PDF and approves it or returns it to HR with notes. The same decision is available in Approvals. A requester cannot approve their own submission.
4. Approval publishes the PDF to the employee's profile and private Documents, and sends an account notification. The employee opens **My profile → Employment contract → Download contract PDF**, or **HR → Employee contracts** to view their own approved contract.

For changes, HR uploads a replacement and saves a new draft. The employee keeps the previous approved PDF until the replacement is approved. Files and approved revisions remain retained; they are not overwritten. Drafts and rejected/pending replacements are never exposed to the employee. Ordinary document forms and generic collection APIs cannot change managed contracts.

The protected Super Admin can oversee contract status but the contract-specific author/approver roles remain enforced: HR Manager edits; Company Manager approves. Organization/company/location scope and explicit employee identity are checked server-side. Contracts block employee deletion or reassignment while retained.

This workflow distributes the company's uploaded contract. It does not generate legal terms, collect signatures or send external email. Notifications and PDF delivery happen inside the employee account.
