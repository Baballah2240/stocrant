import MobileIcon from "./MobileIcon";

/** Fictional records keep this public product illustration free of customer data. */
export default function WorkspacePreview() {
  return <div className="workspace-stage">
    <div className="workspace-window" aria-label="Illustrative STOCRANT dashboard with sample data">
      <div className="workspace-chrome"><div aria-hidden="true"><i /><i /><i /></div><span>STOCRANT / Workspace</span><span className="preview-label">Sample data</span></div>
      <div className="workspace-layout">
        <aside className="preview-sidebar" aria-hidden="true"><span className="preview-logo">S</span>{(["home", "people", "work", "inventory", "finance"] as const).map((icon, index) => <span key={icon} className={index === 0 ? "selected" : ""}><MobileIcon name={icon} /></span>)}<span className="preview-avatar">JD</span></aside>
        <div className="preview-main">
          <div className="preview-heading"><div><small>YOUR BUSINESS, AT A GLANCE</small><h2>A little more clarity.</h2></div><span className="preview-online">Workspace</span></div>
          <div className="preview-metrics"><div><MobileIcon name="people" /><span>People at work</span><strong>24 <small>/ 28</small></strong><div className="preview-meter"><span /></div></div><div><MobileIcon name="work" /><span>Tasks completed</span><strong>18 <small>/ 24</small></strong><div className="preview-meter"><span /></div></div></div>
          <div className="preview-work"><div className="preview-section-title"><strong>Today’s priorities</strong><span>Operations <MobileIcon name="chevron" /></span></div>{[
            ["Review stock levels", "Inventory · Main location", "In progress"],
            ["Prepare the weekly report", "Finance · Office team", "To do"],
            ["Confirm team attendance", "People · All locations", "Completed"],
          ].map(([title, subtitle, status], index) => <div className="preview-task" key={title}><span className={`preview-task-icon task-${index}`}><MobileIcon name={index === 0 ? "inventory" : index === 1 ? "files" : "attendance"} /></span><div><strong>{title}</strong><small>{subtitle}</small></div><span className={`preview-status status-${index}`}>{status}</span></div>)}</div>
          <div className="preview-bottom"><span className="preview-avatars"><i>JD</i><i>AM</i><i>SK</i></span><span>One team. A shared view.</span><MobileIcon name="companies" /></div>
        </div>
      </div>
    </div>
    <div className="preview-floating"><span><MobileIcon name="attendance" /></span><div><strong>A connected workday.</strong><small>From the office to your phone.</small></div><span className="preview-tick" aria-hidden="true">✓</span></div>
    <p className="preview-disclaimer">An illustrative workspace. Your business makes it yours.</p>
  </div>;
}
