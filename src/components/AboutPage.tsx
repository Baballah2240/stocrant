import BackButton from "./BackButton";

export default function AboutPage() {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <BackButton />
          <h1 className="anim-rise">About</h1>
          <p className="hint">STOCRANT &mdash; operations workspace for stores and restaurants.</p>
        </div>
      </div>

      <div className="card">
        <div className="field">
          <p className="field-label">App</p>
          <p className="field-value">STOCRANT v1.0.0</p>
        </div>
        <div className="field">
          <p className="field-label">What it does</p>
          <p className="field-value">
            Manage people, spaces and stock: HR records, branches, warehouses,
            inventory and finance &mdash; with server-enforced roles, approvals and
            audit history.
          </p>
        </div>
        <div className="field">
          <p className="field-label">Stack</p>
          <p className="field-value">React + TypeScript (Vite) · Express API · persistent JSON storage · secure server sessions.</p>
        </div>
        <div className="field">
          <p className="field-label">Workspace setup</p>
          <p className="field-value">
            The first visit creates the Main Manager account with the server setup
            key. Add employees and configure roles from Access &amp; Settings.
          </p>
        </div>
      </div>
    </div>
  );
}
