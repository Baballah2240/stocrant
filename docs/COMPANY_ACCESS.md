# Company access

The platform Main Administrator can access every company. All other accounts can access only their explicitly assigned companies, within their role, individual permissions, location restrictions and record ownership rules.

Organization Admin accounts also require explicit company assignments. Assigning their parent organization does not grant access to all its companies, and creating a sibling company does not expand existing accounts' access. An Organization Admin with no assigned companies sees no company records. Existing accounts that relied only on organization membership need company assignments from the Main Administrator.

In Access & Settings → Users, edit an account and select its company. For an Organization Admin, select the organization and check the permitted companies. The organization main-admin assignment form also provides company checkboxes. Saving access changes revokes affected sessions.

Company restrictions apply on the server to lists, direct record URLs, mutations, Finance, payroll, reports, exports and audit history. Role permissions control the actions available inside those companies; granting more actions never grants another company. Approval exemption for the platform Main Administrator is independent of company scope.
