import { useState, useEffect, useCallback } from "react";

// ─── YOUR APPS SCRIPT ENDPOINT ───────────────────────────────────
const API = "https://script.google.com/macros/s/AKfycbwrM3BWbD08bbQFOPkI5KURiDVYSOPV4GDOPUel7xktkHCJQ5LtEOaEEAMNbthTL2U/exec";

// ─── SHEET TAB NAMES (must match your Google Sheet exactly) ──────
const TABS = {
  CONTACTS:   "Contacts",
  DEALS:      "Deals",
  ACTIVITIES: "Activities",
  REMINDERS:  "Reminders",
  ASSETS:     "Assets",
  FILES:      "Files",
};

// ─── COLUMN HEADERS (paste these in row 1 of each tab) ───────────
// Contacts:   ID | Name | Company | Designation | Email | Phone | Tag | Notes | CreatedAt
// Deals:      ID | DealName | Company | Value | Stage | Probability | ContactID | Notes | CreatedAt | UpdatedAt
// Activities: ID | Type | Description | ContactID | DealID | CreatedAt
// Reminders:  ID | Title | DueDate | ContactID | DealID | Done | CreatedAt
// Assets:     ID | AssetName | Category | Office | Ownership | AssignedTo | Vendor | MonthlyCost | PurchaseDate | ContractEnd | WarrantyEnd | Status | Notes | CreatedAt
// Files:      ID | FileName | OriginalFormat | ConvertedFormat | SignedBy | SignedAt | DriveLink | CreatedAt

const STAGES   = ["Lead","Contacted","Proposal","Negotiation","Won","Lost"];
const ASSET_CATS = ["Laptop","Desktop","Monitor","Printer","Networking","Projector","Phone","Furniture","Other"];
const OFFICES    = ["Pune HQ","Mumbai","Delhi","Bangalore","Hyderabad","Chennai","Kolkata","Other"];
const TAGS       = ["Lead","Prospect","Client","Hot","Inactive"];
const FORMATS    = ["PDF","DOCX","XLSX","CSV","TXT","JPG","PNG","PPTX"];

function uid()    { return Date.now().toString(36) + Math.random().toString(36).slice(2,5); }
function nowStr() { return new Date().toISOString().slice(0,19).replace("T"," "); }
function today()  { return new Date().toISOString().slice(0,10); }
function daysUntil(d) { if(!d) return null; return Math.ceil((new Date(d)-new Date(today()))/86400000); }

// ─── APPS SCRIPT API ─────────────────────────────────────────────
async function apiFetch(tab) {
  const url = `${API}?tab=${encodeURIComponent(tab)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Fetch failed: ${r.status}`);
  const rows = await r.json();
  if (!rows || rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i] ?? "");
    return obj;
  });
}

async function apiAppend(tab, row) {
  const r = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action: "append", tab, row }),
  });
  if (!r.ok) throw new Error(`Append failed: ${r.status}`);
  return r.json();
}

async function apiUpdate(tab, rowIndex, col, value) {
  // rowIndex is 0-based data row (not counting header), sheet row = rowIndex + 2
  const range = `${tab}!${col}${rowIndex + 2}`;
  const r = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action: "update", tab, range, row: [value] }),
  });
  if (!r.ok) throw new Error(`Update failed: ${r.status}`);
  return r.json();
}

// ─── DESIGN TOKENS ───────────────────────────────────────────────
const T = {
  bg:        "#09090f",
  surface:   "#111118",
  surfaceB:  "#16161f",
  border:    "#1f1f2e",
  borderB:   "#2a2a3d",
  text:      "#eeeef5",
  muted:     "#6b6b85",
  dim:       "#2e2e42",
  accent:    "#7c6aff",
  accentLo:  "#7c6aff18",
  accentMid: "#7c6aff44",
  teal:      "#00d4aa",
  tealLo:    "#00d4aa14",
  amber:     "#f59e0b",
  amberLo:   "#f59e0b18",
  red:       "#f43f5e",
  redLo:     "#f43f5e18",
  green:     "#34d399",
  greenLo:   "#34d39918",
};

const STAGE_C  = { Lead:T.accent, Contacted:T.teal, Proposal:T.amber, Negotiation:T.red, Won:T.green, Lost:T.muted };
const TAG_C    = { Lead:T.accent, Prospect:T.teal, Client:T.green, Hot:T.red, Inactive:T.muted };

// ─── SHARED PRIMITIVES ────────────────────────────────────────────
const inp = { width:"100%", background:T.bg, border:`1px solid ${T.border}`, borderRadius:8, padding:"9px 12px", fontSize:13, color:T.text, fontFamily:"inherit", outline:"none", boxSizing:"border-box" };
const btn = (accent) => ({ padding:"8px 18px", borderRadius:8, border:`1px solid ${accent?T.accent:T.border}`, background:accent?T.accentLo:"transparent", color:accent?T.accent:T.muted, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit", transition:"all .15s" });

function Pill({ text, color }) {
  return <span style={{ fontSize:11, fontWeight:600, padding:"2px 9px", borderRadius:20, background:color+"22", color }}>{text}</span>;
}
function KPI({ label, value, color }) {
  return (
    <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, padding:"1rem 1.2rem" }}>
      <div style={{ fontSize:24, fontWeight:700, color, letterSpacing:"-.03em", marginBottom:3 }}>{value}</div>
      <div style={{ fontSize:12, color:T.muted }}>{label}</div>
    </div>
  );
}
function Empty({ msg }) {
  return <div style={{ padding:"2rem", textAlign:"center", color:T.muted, fontSize:13 }}>{msg}</div>;
}
function FRow({ label, children }) {
  return (
    <div style={{ marginBottom:10 }}>
      <label style={{ display:"block", fontSize:11, fontWeight:600, color:T.dim, letterSpacing:".08em", marginBottom:4, textTransform:"uppercase" }}>{label}</label>
      {children}
    </div>
  );
}
function Avatar({ name }) {
  const ini = (name||"?").split(" ").map(n=>n[0]).slice(0,2).join("").toUpperCase();
  return <div style={{ width:34, height:34, borderRadius:"50%", background:T.accentLo, border:`1px solid ${T.accentMid}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:T.accent, flexShrink:0 }}>{ini}</div>;
}
function Modal({ title, onClose, children }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.8)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:"1rem" }}>
      <div style={{ background:T.surface, border:`1px solid ${T.borderB}`, borderRadius:16, padding:"1.75rem", width:"100%", maxWidth:520, maxHeight:"90vh", overflowY:"auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"1.25rem" }}>
          <h3 style={{ margin:0, fontSize:17, fontWeight:700, color:T.text }}>{title}</h3>
          <button onClick={onClose} style={{ background:"transparent", border:"none", color:T.muted, fontSize:22, cursor:"pointer", lineHeight:1, padding:0 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ROOT APP
// ═══════════════════════════════════════════════════════════════════
export default function App() {
  const [page,    setPage]    = useState("dashboard");
  const [data,    setData]    = useState({ contacts:[], deals:[], activities:[], reminders:[], assets:[], files:[] });
  const [loading, setLoading] = useState(true);
  const [toast,   setToast]   = useState(null);
  const [modal,   setModal]   = useState(null);

  const flash = useCallback((msg, type="ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [contacts, deals, activities, reminders, assets, files] = await Promise.all([
        apiFetch(TABS.CONTACTS),
        apiFetch(TABS.DEALS),
        apiFetch(TABS.ACTIVITIES),
        apiFetch(TABS.REMINDERS),
        apiFetch(TABS.ASSETS),
        apiFetch(TABS.FILES),
      ]);
      setData({ contacts, deals, activities, reminders, assets, files });
    } catch(e) {
      flash("Sync failed: " + e.message, "err");
    }
    setLoading(false);
  }, [flash]);

  useEffect(() => { reload(); }, [reload]);

  // writers
  async function saveContact(f) {
    await apiAppend(TABS.CONTACTS, [uid(),f.name,f.company,f.designation,f.email,f.phone,f.tag||"Lead",f.notes||"",nowStr()]);
    flash("Contact saved ✓"); reload(); setModal(null);
  }
  async function saveDeal(f) {
    await apiAppend(TABS.DEALS, [uid(),f.dealName,f.company,f.value,f.stage||"Lead",f.prob||"50",f.contactId||"",f.notes||"",nowStr(),nowStr()]);
    flash("Deal saved ✓"); reload(); setModal(null);
  }
  async function saveActivity(desc, type="Note") {
    await apiAppend(TABS.ACTIVITIES, [uid(),type,desc,"","",nowStr()]);
    flash("Logged ✓"); reload();
  }
  async function saveReminder(f) {
    await apiAppend(TABS.REMINDERS, [uid(),f.title,f.dueDate,f.contactId||"",f.dealId||"","No",nowStr()]);
    flash("Reminder set ✓"); reload(); setModal(null);
  }
  async function saveAsset(f) {
    await apiAppend(TABS.ASSETS, [uid(),f.assetName,f.category,f.office,f.ownership,f.assignedTo||"",f.vendor||"",f.monthlyCost||"",f.purchaseDate||"",f.contractEnd||"",f.warrantyEnd||"",f.status||"Active",f.notes||"",nowStr()]);
    flash("Asset saved ✓"); reload(); setModal(null);
  }
  async function saveFile(f) {
    await apiAppend(TABS.FILES, [uid(),f.fileName,f.fromFmt||"",f.toFmt||"",f.signedBy||"",f.signedBy?nowStr():"",f.driveLink||"",nowStr()]);
    flash("File logged ✓"); reload(); setModal(null);
  }
  async function markDone(idx) {
    await apiUpdate(TABS.REMINDERS, idx, "F", "Yes");
    flash("Marked done ✓"); reload();
  }

  const overdue  = data.reminders.filter(r => r.Done !== "Yes" && daysUntil(r.DueDate) <= 0).length;
  const expiring = data.assets.filter(a => a.Ownership==="Rented" && daysUntil(a.ContractEnd)!=null && daysUntil(a.ContractEnd) <= 30 && daysUntil(a.ContractEnd) >= 0).length;
  const pipeline = data.deals.filter(d => !["Won","Lost"].includes(d.Stage)).reduce((s,d) => s+(parseFloat(d.Value)||0), 0);

  const NAV = [
    { id:"dashboard", icon:"⬡", label:"Dashboard" },
    { id:"crm",       icon:"◈", label:"CRM",    alert: overdue  > 0 },
    { id:"assets",    icon:"◉", label:"Assets",  alert: expiring > 0 },
    { id:"files",     icon:"◫", label:"Files" },
    { id:"social",    icon:"◎", label:"Social" },
  ];

  return (
    <div style={{ display:"flex", minHeight:"100vh", background:T.bg, color:T.text, fontFamily:"'DM Sans',sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>

      {/* SIDEBAR */}
      <aside style={{ width:200, background:T.surface, borderRight:`1px solid ${T.border}`, display:"flex", flexDirection:"column", padding:"1.5rem .75rem", flexShrink:0, position:"sticky", top:0, height:"100vh" }}>
        <div style={{ display:"flex", alignItems:"center", gap:9, marginBottom:"2.5rem", paddingLeft:8 }}>
          <div style={{ width:30, height:30, borderRadius:8, background:T.accentLo, border:`1px solid ${T.accentMid}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, color:T.accent }}>⬡</div>
          <span style={{ fontSize:15, fontWeight:700, letterSpacing:"-.01em" }}>Agent<span style={{ color:T.accent }}>OS</span></span>
        </div>

        <div style={{ fontSize:10, fontWeight:600, color:T.dim, letterSpacing:".12em", marginBottom:8, paddingLeft:10 }}>AGENTS</div>
        {NAV.map(n => {
          const active = page === n.id;
          return (
            <button key={n.id} onClick={() => setPage(n.id)} style={{
              display:"flex", alignItems:"center", gap:9, padding:"8px 10px",
              borderRadius:8, border:"none", cursor:"pointer", fontFamily:"inherit",
              fontSize:13, fontWeight: active ? 600 : 400,
              background: active ? T.accentLo : "transparent",
              color: active ? T.accent : T.muted,
              marginBottom:2, textAlign:"left", width:"100%", transition:"all .15s",
            }}>
              <span style={{ fontSize:15, width:18, textAlign:"center", flexShrink:0 }}>{n.icon}</span>
              <span style={{ flex:1 }}>{n.label}</span>
              {n.alert && <span style={{ width:7, height:7, borderRadius:"50%", background:T.red, flexShrink:0 }}/>}
            </button>
          );
        })}

        <div style={{ marginTop:"auto", paddingTop:"1rem", borderTop:`1px solid ${T.border}` }}>
          <div style={{ background:T.bg, borderRadius:8, padding:"8px 10px", marginBottom:8 }}>
            <div style={{ fontSize:10, color:T.dim, marginBottom:2, letterSpacing:".06em" }}>CONNECTED SHEET</div>
            <div style={{ fontSize:10, color:T.teal, fontFamily:"'DM Mono',monospace", lineHeight:1.5, wordBreak:"break-all" }}>Apps Script ✓</div>
          </div>
          <button onClick={reload} disabled={loading} style={{ ...btn(false), width:"100%", marginBottom:4, fontSize:12 }}>
            {loading ? "Syncing…" : "↻  Refresh"}
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main style={{ flex:1, padding:"2rem", overflowY:"auto", minWidth:0 }}>
        {page === "dashboard" && <Dashboard data={data} pipeline={pipeline} overdue={overdue} expiring={expiring} setPage={setPage} loading={loading}/>}
        {page === "crm"       && <CRMPage   data={data} setModal={setModal} saveActivity={saveActivity} markDone={markDone}/>}
        {page === "assets"    && <AssetsPage data={data} setModal={setModal}/>}
        {page === "files"     && <FilesPage  data={data} setModal={setModal}/>}
        {page === "social"    && <SocialPage/>}
      </main>

      {/* MODALS */}
      {modal?.type==="contact"  && <Modal title="Add Contact"  onClose={() => setModal(null)}><ContactForm  onSave={saveContact}/></Modal>}
      {modal?.type==="deal"     && <Modal title="Add Deal"     onClose={() => setModal(null)}><DealForm     contacts={data.contacts} onSave={saveDeal}/></Modal>}
      {modal?.type==="reminder" && <Modal title="Set Reminder" onClose={() => setModal(null)}><ReminderForm contacts={data.contacts} deals={data.deals} onSave={saveReminder}/></Modal>}
      {modal?.type==="asset"    && <Modal title="Add Asset"    onClose={() => setModal(null)}><AssetForm    onSave={saveAsset}/></Modal>}
      {modal?.type==="file"     && <Modal title="Log File"     onClose={() => setModal(null)}><FileForm     onSave={saveFile}/></Modal>}

      {/* TOAST */}
      {toast && (
        <div style={{ position:"fixed", bottom:24, right:24, zIndex:9999, background: toast.type==="err" ? T.redLo : T.tealLo, border:`1px solid ${toast.type==="err" ? T.red : T.teal}`, borderRadius:10, padding:"10px 18px", fontSize:13, fontWeight:600, color: toast.type==="err" ? T.red : T.teal }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════
function Dashboard({ data, pipeline, overdue, expiring, setPage, loading }) {
  const monthlyRent = data.assets.filter(a=>a.Ownership==="Rented").reduce((s,a)=>s+(parseFloat(a.MonthlyCost)||0),0);
  return (
    <div>
      <div style={{ marginBottom:"2rem" }}>
        <h1 style={{ fontSize:28, fontWeight:700, letterSpacing:"-.03em", margin:0 }}>
          Good day<span style={{ color:T.accent }}> ⬡</span>
        </h1>
        <p style={{ color:T.muted, fontSize:14, margin:"4px 0 0" }}>
          {loading ? "Syncing with Google Sheets…" : "All agents connected · data live from your sheet"}
        </p>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:"1.75rem" }}>
        <KPI label="Total contacts"   value={data.contacts.length}  color={T.accent}/>
        <KPI label="Active pipeline"  value={`₹${Math.round(pipeline/1000)}K`} color={T.teal}/>
        <KPI label="Total assets"     value={data.assets.length}    color={T.amber}/>
        <KPI label="Monthly rentals"  value={`₹${Math.round(monthlyRent/1000)}K`} color={T.red}/>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:"1.75rem" }}>
        <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:14, padding:"1.25rem" }}>
          <Sec title="Alerts"/>
          {overdue  > 0 && <AlertRow text={`${overdue} overdue reminder${overdue>1?"s":""}`}  color={T.red}   onClick={() => setPage("crm")}/>}
          {expiring > 0 && <AlertRow text={`${expiring} rental${expiring>1?"s":""} expiring within 30 days`} color={T.amber} onClick={() => setPage("assets")}/>}
          {!overdue && !expiring && <Empty msg="All clear — no alerts."/>}
        </div>
        <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:14, padding:"1.25rem" }}>
          <Sec title="Quick jump"/>
          {[
            { label:"Open CRM pipeline",    id:"crm" },
            { label:"View asset tracker",   id:"assets" },
            { label:"File converter + logs", id:"files" },
            { label:"Social media analyzer", id:"social" },
          ].map(q => (
            <button key={q.id} onClick={() => setPage(q.id)} style={{ display:"block", width:"100%", textAlign:"left", background:T.bg, border:`1px solid ${T.border}`, borderRadius:8, padding:"9px 14px", fontSize:13, color:T.text, cursor:"pointer", fontFamily:"inherit", marginBottom:6, fontWeight:500 }}>
              {q.label} →
            </button>
          ))}
        </div>
      </div>

      <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:14, padding:"1.25rem" }}>
        <Sec title={`Recent activity (${data.activities.length})`}/>
        {[...data.activities].sort((a,b)=>b.CreatedAt?.localeCompare(a.CreatedAt)).slice(0,8).map((a,i,arr) => (
          <div key={a.ID} style={{ display:"flex", gap:10, padding:"8px 0", borderBottom: i<arr.length-1 ? `1px solid ${T.border}` : "none", alignItems:"flex-start" }}>
            <div style={{ width:6, height:6, borderRadius:"50%", background:T.accent, marginTop:5, flexShrink:0 }}/>
            <div style={{ flex:1, fontSize:13, color:T.muted, lineHeight:1.5 }}>{a.Description}</div>
            <div style={{ fontSize:11, color:T.dim, flexShrink:0 }}>{a.CreatedAt?.slice(0,10)}</div>
          </div>
        ))}
        {!data.activities.length && <Empty msg="No activities yet — add contacts and log interactions in CRM."/>}
      </div>
    </div>
  );
}
function AlertRow({ text, color, onClick }) {
  return (
    <div onClick={onClick} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 0", borderBottom:`1px solid ${T.border}`, cursor:"pointer" }}>
      <div style={{ width:7, height:7, borderRadius:"50%", background:color, flexShrink:0 }}/>
      <span style={{ flex:1, fontSize:13 }}>{text}</span>
      <span style={{ color:T.muted }}>→</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CRM PAGE
// ═══════════════════════════════════════════════════════════════════
function CRMPage({ data, setModal, saveActivity, markDone }) {
  const [tab, setTab] = useState("pipeline");
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const pending = data.reminders.filter(r => r.Done !== "Yes");

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"1.5rem" }}>
        <div>
          <h1 style={H1}>CRM Agent</h1>
          <p style={{ color:T.muted, fontSize:13, margin:0 }}>{data.contacts.length} contacts · {data.deals.filter(d=>!["Won","Lost"].includes(d.Stage)).length} active deals</p>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button style={btn(false)} onClick={() => setModal({type:"contact"})}>+ Contact</button>
          <button style={btn(true)}  onClick={() => setModal({type:"deal"})}>+ Deal</button>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:"1.5rem" }}>
        <KPI label="Contacts"     value={data.contacts.length} color={T.accent}/>
        <KPI label="Active deals" value={data.deals.filter(d=>!["Won","Lost"].includes(d.Stage)).length} color={T.teal}/>
        <KPI label="Pipeline"     value={"₹"+Math.round(data.deals.filter(d=>!["Won","Lost"].includes(d.Stage)).reduce((s,d)=>s+(parseFloat(d.Value)||0),0)/1000)+"K"} color={T.amber}/>
        <KPI label="Won"          value={data.deals.filter(d=>d.Stage==="Won").length} color={T.green}/>
      </div>

      {/* Sub-tabs */}
      <div style={{ display:"flex", gap:3, marginBottom:"1.25rem", background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, padding:4, width:"fit-content" }}>
        {["pipeline","contacts","reminders","activity"].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding:"6px 14px", borderRadius:7, border:"none", background: tab===t ? T.accentLo : "transparent", color: tab===t ? T.accent : T.muted, fontSize:13, fontWeight: tab===t ? 600 : 400, cursor:"pointer", fontFamily:"inherit", textTransform:"capitalize" }}>
            {t}{t==="reminders" && pending.length > 0 ? ` (${pending.length})` : ""}
          </button>
        ))}
      </div>

      {/* PIPELINE */}
      {tab==="pipeline" && (
        <div style={{ display:"flex", gap:12, overflowX:"auto", paddingBottom:8 }}>
          {STAGES.map(stage => {
            const deals = data.deals.filter(d => d.Stage === stage);
            const col = STAGE_C[stage] || T.muted;
            return (
              <div key={stage} style={{ minWidth:210, flex:"0 0 210px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <div style={{ width:7, height:7, borderRadius:"50%", background:col }}/>
                    <span style={{ fontSize:11, fontWeight:600, color:T.muted, letterSpacing:".06em" }}>{stage.toUpperCase()}</span>
                  </div>
                  <span style={{ fontSize:11, color:T.dim, background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, padding:"1px 7px" }}>{deals.length}</span>
                </div>
                {deals.map(d => (
                  <div key={d.ID} style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, padding:"10px 12px", marginBottom:8 }}>
                    <div style={{ fontSize:13, fontWeight:600, marginBottom:3 }}>{d.DealName}</div>
                    <div style={{ fontSize:11, color:T.muted, marginBottom:6 }}>{d.Company}</div>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <span style={{ fontSize:13, fontWeight:700, color:col }}>₹{(parseFloat(d.Value)||0).toLocaleString("en-IN")}</span>
                      <span style={{ fontSize:10, color:T.dim }}>{d.Probability}%</span>
                    </div>
                  </div>
                ))}
                {!deals.length && <div style={{ fontSize:12, color:T.dim, textAlign:"center", padding:"1rem 0", border:`1px dashed ${T.border}`, borderRadius:8 }}>Empty</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* CONTACTS */}
      {tab==="contacts" && (
        <div>
          <input style={{ ...inp, maxWidth:340, marginBottom:12 }} placeholder="Search contacts…" value={search} onChange={e=>setSearch(e.target.value)}/>
          <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:"hidden" }}>
            {data.contacts.filter(c => !search || c.Name?.toLowerCase().includes(search.toLowerCase()) || c.Company?.toLowerCase().includes(search.toLowerCase())).map((c,i,arr) => (
              <div key={c.ID} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 16px", borderBottom: i<arr.length-1?`1px solid ${T.border}`:"none" }}>
                <Avatar name={c.Name}/>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:600 }}>{c.Name}</div>
                  <div style={{ fontSize:11, color:T.muted }}>{c.Designation}{c.Company?` · ${c.Company}`:""}</div>
                </div>
                <div style={{ fontSize:12, color:T.muted, minWidth:160, overflow:"hidden", textOverflow:"ellipsis" }}>{c.Email}</div>
                <Pill text={c.Tag||"Lead"} color={TAG_C[c.Tag]||T.muted}/>
              </div>
            ))}
            {!data.contacts.length && <Empty msg="No contacts yet. Click '+ Contact' to add your first."/>}
          </div>
        </div>
      )}

      {/* REMINDERS */}
      {tab==="reminders" && (
        <div>
          <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:10 }}>
            <button style={btn(true)} onClick={() => setModal({type:"reminder"})}>+ Reminder</button>
          </div>
          <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:"hidden" }}>
            {pending.map((r,i) => {
              const d = daysUntil(r.DueDate);
              const col = d!=null&&d<0 ? T.red : d!=null&&d<=3 ? T.amber : T.muted;
              return (
                <div key={r.ID} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 16px", borderBottom: i<pending.length-1?`1px solid ${T.border}`:"none" }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:600 }}>{r.Title}</div>
                    <div style={{ fontSize:11, color:col, marginTop:2 }}>{d!=null&&d<0?"Overdue":d===0?"Due today":d!=null?`In ${d} day${d!==1?"s":""}`:""}  {r.DueDate}</div>
                  </div>
                  <button onClick={() => markDone(data.reminders.filter(x=>x.Done!=="Yes").indexOf(r))} style={{ ...btn(false), fontSize:12, padding:"5px 12px" }}>Done</button>
                </div>
              );
            })}
            {!pending.length && <Empty msg="No pending reminders. All clear!"/>}
          </div>
        </div>
      )}

      {/* ACTIVITY */}
      {tab==="activity" && (
        <div>
          <div style={{ display:"flex", gap:8, marginBottom:12 }}>
            <input style={{ ...inp, flex:1 }} placeholder="Log a note, call, or activity…" value={note} onChange={e=>setNote(e.target.value)}
              onKeyDown={e => { if(e.key==="Enter" && note.trim()) { saveActivity(note.trim()); setNote(""); } }}/>
            <button style={btn(true)} onClick={() => { if(note.trim()) { saveActivity(note.trim()); setNote(""); } }}>Log</button>
          </div>
          <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:"hidden" }}>
            {[...data.activities].sort((a,b)=>b.CreatedAt?.localeCompare(a.CreatedAt)).map((a,i,arr) => (
              <div key={a.ID} style={{ display:"flex", gap:10, padding:"10px 16px", borderBottom: i<arr.length-1?`1px solid ${T.border}`:"none", alignItems:"flex-start" }}>
                <div style={{ width:6, height:6, borderRadius:"50%", background:T.accent, marginTop:5, flexShrink:0 }}/>
                <div style={{ flex:1, fontSize:13, color:T.muted, lineHeight:1.5 }}>{a.Description}</div>
                <div style={{ fontSize:11, color:T.dim, flexShrink:0 }}>{a.CreatedAt}</div>
              </div>
            ))}
            {!data.activities.length && <Empty msg="No activities yet."/>}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ASSETS PAGE
// ═══════════════════════════════════════════════════════════════════
function AssetsPage({ data, setModal }) {
  const [officeFilter, setOfficeFilter] = useState("All");
  const offices = ["All", ...new Set(data.assets.map(a=>a.Office).filter(Boolean))];
  const filtered = officeFilter === "All" ? data.assets : data.assets.filter(a=>a.Office===officeFilter);
  const totalRent = data.assets.filter(a=>a.Ownership==="Rented").reduce((s,a)=>s+(parseFloat(a.MonthlyCost)||0),0);
  const expiring  = data.assets.filter(a=>a.Ownership==="Rented"&&daysUntil(a.ContractEnd)!=null&&daysUntil(a.ContractEnd)<=30&&daysUntil(a.ContractEnd)>=0);

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"1.5rem" }}>
        <div>
          <h1 style={H1}>Asset Manager</h1>
          <p style={{ color:T.muted, fontSize:13, margin:0 }}>{data.assets.length} assets · {new Set(data.assets.map(a=>a.Office).filter(Boolean)).size} offices</p>
        </div>
        <button style={btn(true)} onClick={() => setModal({type:"asset"})}>+ Add Asset</button>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:"1.5rem" }}>
        <KPI label="Total assets"  value={data.assets.length}                                   color={T.accent}/>
        <KPI label="Rented"        value={data.assets.filter(a=>a.Ownership==="Rented").length}  color={T.teal}/>
        <KPI label="Owned"         value={data.assets.filter(a=>a.Ownership==="Owned").length}   color={T.green}/>
        <KPI label="Monthly rent"  value={`₹${Math.round(totalRent/1000)}K`}                     color={T.red}/>
      </div>

      {expiring.length > 0 && (
        <div style={{ background:T.amberLo, border:`1px solid ${T.amber}44`, borderRadius:12, padding:"1rem 1.25rem", marginBottom:"1.25rem" }}>
          <div style={{ fontSize:12, fontWeight:600, color:T.amber, marginBottom:8, letterSpacing:".06em" }}>⚠  EXPIRING SOON</div>
          {expiring.map(a => {
            const d = daysUntil(a.ContractEnd);
            return (
              <div key={a.ID} style={{ display:"flex", justifyContent:"space-between", fontSize:13, padding:"4px 0", borderBottom:`1px solid ${T.amber}22` }}>
                <span style={{ fontWeight:600 }}>{a.AssetName} — {a.Office}</span>
                <span style={{ color: d<=7?T.red:T.amber }}>Expires in {d} day{d!==1?"s":""}{a.MonthlyCost?` · ₹${a.MonthlyCost}/mo`:""}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Office filter pills */}
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:12 }}>
        {offices.map(o => (
          <button key={o} onClick={() => setOfficeFilter(o)} style={{ padding:"5px 14px", borderRadius:20, border:`1px solid ${officeFilter===o?T.accent:T.border}`, background: officeFilter===o?T.accentLo:"transparent", color: officeFilter===o?T.accent:T.muted, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>
            {o}
          </button>
        ))}
      </div>

      <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:"hidden" }}>
        <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1.2fr 1fr 1fr 1fr", padding:"8px 16px", borderBottom:`1px solid ${T.border}`, fontSize:11, fontWeight:600, color:T.dim, letterSpacing:".06em" }}>
          <span>ASSET</span><span>CATEGORY</span><span>OFFICE</span><span>OWNERSHIP</span><span>STATUS</span><span style={{textAlign:"right"}}>COST/MO</span>
        </div>
        {filtered.map((a,i) => {
          const d = daysUntil(a.ContractEnd);
          const expCol = d!=null&&d<=7?T.red:d!=null&&d<=30?T.amber:null;
          return (
            <div key={a.ID} style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1.2fr 1fr 1fr 1fr", padding:"10px 16px", borderBottom: i<filtered.length-1?`1px solid ${T.border}`:"none", alignItems:"center", fontSize:13 }}>
              <div>
                <div style={{ fontWeight:600 }}>{a.AssetName}</div>
                {a.AssignedTo && <div style={{ fontSize:11, color:T.muted }}>→ {a.AssignedTo}</div>}
              </div>
              <div style={{ color:T.muted }}>{a.Category}</div>
              <div style={{ color:T.muted }}>{a.Office}</div>
              <div><Pill text={a.Ownership||"Owned"} color={a.Ownership==="Rented"?T.teal:T.green}/></div>
              <div>
                {expCol
                  ? <span style={{ fontSize:11, fontWeight:600, color:expCol }}>Exp {a.ContractEnd?.slice(0,10)}</span>
                  : <span style={{ fontSize:12, color: a.Status==="Active"?T.green:T.muted }}>{a.Status||"Active"}</span>
                }
              </div>
              <div style={{ textAlign:"right", fontWeight:600, color:a.Ownership==="Rented"?T.amber:T.dim }}>{a.MonthlyCost?`₹${a.MonthlyCost}`:"—"}</div>
            </div>
          );
        })}
        {!filtered.length && <Empty msg="No assets found. Click '+ Add Asset' to begin tracking."/>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// FILES PAGE
// ═══════════════════════════════════════════════════════════════════
function FilesPage({ data, setModal }) {
  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"1.5rem" }}>
        <div>
          <h1 style={H1}>File Agent</h1>
          <p style={{ color:T.muted, fontSize:13, margin:0 }}>Format converter · E-signature logger · File history</p>
        </div>
        <button style={btn(true)} onClick={() => setModal({type:"file"})}>+ Log File</button>
      </div>

      <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:"hidden" }}>
        <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr 1.5fr", padding:"8px 16px", borderBottom:`1px solid ${T.border}`, fontSize:11, fontWeight:600, color:T.dim, letterSpacing:".06em" }}>
          <span>FILE NAME</span><span>FROM</span><span>TO / SIGNED BY</span><span>TYPE</span><span>DATE</span>
        </div>
        {[...data.files].sort((a,b)=>b.CreatedAt?.localeCompare(a.CreatedAt)).map((f,i,arr) => (
          <div key={f.ID} style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr 1.5fr", padding:"10px 16px", borderBottom: i<arr.length-1?`1px solid ${T.border}`:"none", alignItems:"center", fontSize:13 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:28, height:28, borderRadius:7, background:f.SignedBy?T.tealLo:T.accentLo, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, flexShrink:0 }}>
                {f.SignedBy ? "✍" : "⇄"}
              </div>
              <div style={{ fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.FileName}</div>
            </div>
            <div style={{ color:T.muted }}>{f.OriginalFormat||"—"}</div>
            <div style={{ color:T.muted }}>{f.SignedBy||f.ConvertedFormat||"—"}</div>
            <div><Pill text={f.SignedBy?"Signed":"Converted"} color={f.SignedBy?T.teal:T.accent}/></div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ color:T.muted, fontSize:12 }}>{f.CreatedAt?.slice(0,10)}</span>
              {f.DriveLink && <a href={f.DriveLink} target="_blank" rel="noreferrer" style={{ fontSize:12, color:T.accent, textDecoration:"none" }}>View ↗</a>}
            </div>
          </div>
        ))}
        {!data.files.length && <Empty msg="No files logged yet. Click '+ Log File' to start."/>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SOCIAL MEDIA AGENT — AI-POWERED ANALYZER
// ═══════════════════════════════════════════════════════════════════
const SOCIAL_PLATFORMS = {
  instagram: { label:"Instagram", color:T.red,    icon:"◉", metrics:["Followers","Reach","Impressions","Likes","Comments","Saves","Shares","Profile Visits","Link Clicks"] },
  linkedin:  { label:"LinkedIn",  color:T.accent, icon:"◈", metrics:["Followers","Impressions","Clicks","Reactions","Comments","Reposts","CTR %","Profile Views"] },
  youtube:   { label:"YouTube",   color:T.amber,  icon:"◎", metrics:["Subscribers","Views","Watch Time (hrs)","Likes","Comments","Shares","Avg View Duration","Revenue ₹"] },
};

function SocialPage() {
  const [platform, setPlatform]   = useState("instagram");
  const [postData,  setPostData]  = useState("");
  const [metrics,   setMetrics]   = useState({});
  const [analysis,  setAnalysis]  = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [tab,       setTab]       = useState("analyze");
  const [posts,     setPosts]     = useState([
    { id:1, title:"New product launch announcement", platform:"instagram", reach:12400, likes:834, comments:62,  saves:210, date:"2025-05-10", score:82 },
    { id:2, title:"Behind the scenes reel",          platform:"instagram", reach:8900,  likes:1240,comments:108, saves:560, date:"2025-05-15", score:91 },
    { id:3, title:"Thought leadership article",      platform:"linkedin",  reach:5200,  likes:312, comments:44,  saves:0,   date:"2025-05-12", score:74 },
    { id:4, title:"Office culture video",            platform:"youtube",   reach:3100,  likes:188, comments:23,  saves:0,   date:"2025-05-08", score:68 },
  ]);
  const [newPost, setNewPost] = useState({ title:"", platform:"instagram", reach:"", likes:"", comments:"", saves:"", date:today() });

  const plat = SOCIAL_PLATFORMS[platform];

  // Claude API — analyze performance
  async function runAnalysis() {
    if (!postData.trim() && Object.keys(metrics).length === 0) return;
    setAnalyzing(true); setAnalysis(null);

    const metricsStr = Object.entries(metrics).filter(([,v])=>v).map(([k,v])=>`${k}: ${v}`).join(", ");
    const prompt = `You are an expert social media strategist. Analyze this ${plat.label} performance data and give sharp, actionable insights.

Platform: ${plat.label}
Metrics: ${metricsStr || "See post description below"}
Post/Content description: ${postData || "Not provided"}

Respond in this EXACT JSON format (no markdown, no extra text):
{
  "overallScore": 75,
  "scoreLabel": "Good",
  "summary": "2-3 sentence overview of performance",
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "improvements": ["improvement 1", "improvement 2", "improvement 3"],
  "bestTimeToPost": "Specific day and time recommendation",
  "contentTips": ["tip 1", "tip 2", "tip 3"],
  "nextAction": "Single most impactful thing to do right now",
  "engagementRate": "calculated % or estimate",
  "benchmarkComparison": "How this compares to industry average"
}`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role:"user", content: prompt }],
        }),
      });
      const data = await res.json();
      const text = data.content?.[0]?.text || "";
      const clean = text.replace(/```json|```/g,"").trim();
      const parsed = JSON.parse(clean);
      setAnalysis(parsed);
    } catch(e) {
      setAnalysis({ error: "Analysis failed. Check your connection and try again. Error: " + e.message });
    }
    setAnalyzing(false);
  }

  // Claude API — analyze a specific post
  async function analyzePost(post) {
    setTab("analyze");
    setPlatform(post.platform);
    setPostData(post.title);
    setMetrics({ Reach: post.reach, Likes: post.likes, Comments: post.comments, Saves: post.saves });
  }

  function addPost() {
    if (!newPost.title) return;
    const score = Math.min(100, Math.round((parseFloat(newPost.likes||0)*2 + parseFloat(newPost.comments||0)*5 + parseFloat(newPost.saves||0)*3) / Math.max(parseFloat(newPost.reach||1), 1) * 100 + 40));
    setPosts(p => [...p, { ...newPost, id: Date.now(), score }]);
    setNewPost({ title:"", platform:"instagram", reach:"", likes:"", comments:"", saves:"", date:today() });
  }

  const scoreColor = s => s >= 80 ? T.green : s >= 60 ? T.amber : T.red;
  const ScoreRing = ({ score }) => {
    const c = scoreColor(score);
    const r = 28, circ = 2*Math.PI*r, dash = (score/100)*circ;
    return (
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" stroke={T.border} strokeWidth="5"/>
        <circle cx="36" cy="36" r={r} fill="none" stroke={c} strokeWidth="5"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 36 36)"/>
        <text x="36" y="36" textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="700" fill={c}>{score}</text>
      </svg>
    );
  };

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"1.5rem" }}>
        <div>
          <h1 style={H1}>Social Media Agent</h1>
          <p style={{ color:T.muted, fontSize:13, margin:0 }}>AI-powered analysis · Instagram · LinkedIn · YouTube</p>
        </div>
      </div>

      {/* Main tabs */}
      <div style={{ display:"flex", gap:3, marginBottom:"1.5rem", background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, padding:4, width:"fit-content" }}>
        {[
          { id:"analyze", label:"◎ AI Analyzer" },
          { id:"posts",   label:"◈ Post Tracker" },
          { id:"tips",    label:"◉ Strategy Tips" },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding:"7px 16px", borderRadius:7, border:"none", background:tab===t.id?T.accentLo:"transparent", color:tab===t.id?T.accent:T.muted, fontSize:13, fontWeight:tab===t.id?600:400, cursor:"pointer", fontFamily:"inherit" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── AI ANALYZER TAB ── */}
      {tab==="analyze" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
          {/* Input panel */}
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {/* Platform selector */}
            <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:14, padding:"1.25rem" }}>
              <Sec title="Select platform"/>
              <div style={{ display:"flex", gap:8 }}>
                {Object.entries(SOCIAL_PLATFORMS).map(([id,p]) => (
                  <button key={id} onClick={() => { setPlatform(id); setAnalysis(null); }} style={{ flex:1, padding:"10px 8px", borderRadius:9, border:`1px solid ${platform===id ? p.color : T.border}`, background:platform===id ? p.color+"18":"transparent", color:platform===id?p.color:T.muted, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit", transition:"all .15s" }}>
                    <div style={{ fontSize:16, marginBottom:3 }}>{p.icon}</div>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Metrics input */}
            <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:14, padding:"1.25rem" }}>
              <Sec title={`${plat.label} metrics`}/>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
                {plat.metrics.slice(0,6).map(m => (
                  <FRow key={m} label={m}>
                    <input style={{ ...inp, fontSize:12 }} type="text" placeholder="0" value={metrics[m]||""} onChange={e => setMetrics(p=>({...p,[m]:e.target.value}))}/>
                  </FRow>
                ))}
              </div>
              <FRow label="Post description / content">
                <textarea style={{ ...inp, height:80, resize:"vertical", fontSize:12 }} placeholder={`Describe your ${plat.label} post or paste its caption…`} value={postData} onChange={e=>setPostData(e.target.value)}/>
              </FRow>
              <button onClick={runAnalysis} disabled={analyzing} style={{ width:"100%", padding:"11px", borderRadius:9, border:`1px solid ${plat.color}`, background:`${plat.color}18`, color:plat.color, fontSize:14, fontWeight:700, cursor:analyzing?"wait":"pointer", fontFamily:"inherit", transition:"all .15s", marginTop:4 }}>
                {analyzing ? "◎ Analyzing with Claude AI…" : `◎ Analyze ${plat.label} Performance`}
              </button>
            </div>
          </div>

          {/* Results panel */}
          <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:14, padding:"1.25rem", minHeight:400 }}>
            <Sec title="AI analysis results"/>

            {!analysis && !analyzing && (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:300, color:T.muted, textAlign:"center", gap:12 }}>
                <div style={{ fontSize:36, opacity:.4 }}>◎</div>
                <div style={{ fontSize:14 }}>Fill in your metrics and click Analyze</div>
                <div style={{ fontSize:12, color:T.dim }}>Claude AI will score your content, identify what's working, and give you a clear action plan.</div>
              </div>
            )}

            {analyzing && (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:300, gap:16 }}>
                <div style={{ width:40, height:40, borderRadius:"50%", border:`3px solid ${T.border}`, borderTopColor:plat.color, animation:"spin 1s linear infinite" }}/>
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                <div style={{ fontSize:13, color:T.muted }}>Claude is analyzing your {plat.label} data…</div>
              </div>
            )}

            {analysis && !analysis.error && (
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                {/* Score + summary */}
                <div style={{ display:"flex", gap:14, alignItems:"flex-start", background:T.bg, borderRadius:10, padding:"1rem" }}>
                  <ScoreRing score={analysis.overallScore||0}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:15, fontWeight:700, color:scoreColor(analysis.overallScore), marginBottom:4 }}>{analysis.scoreLabel} Performance</div>
                    <div style={{ fontSize:12, color:T.muted, lineHeight:1.6 }}>{analysis.summary}</div>
                  </div>
                </div>

                {/* Stats row */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  <div style={{ background:T.bg, borderRadius:8, padding:"8px 12px" }}>
                    <div style={{ fontSize:10, color:T.dim, marginBottom:2 }}>ENGAGEMENT RATE</div>
                    <div style={{ fontSize:14, fontWeight:700, color:T.green }}>{analysis.engagementRate}</div>
                  </div>
                  <div style={{ background:T.bg, borderRadius:8, padding:"8px 12px" }}>
                    <div style={{ fontSize:10, color:T.dim, marginBottom:2 }}>VS INDUSTRY AVG</div>
                    <div style={{ fontSize:12, fontWeight:600, color:T.teal }}>{analysis.benchmarkComparison}</div>
                  </div>
                </div>

                {/* Strengths */}
                <div>
                  <div style={{ fontSize:11, fontWeight:600, color:T.green, marginBottom:6, letterSpacing:".06em" }}>✓ WHAT'S WORKING</div>
                  {(analysis.strengths||[]).map((s,i) => (
                    <div key={i} style={{ display:"flex", gap:8, padding:"5px 0", fontSize:12, color:T.muted, borderBottom:`1px solid ${T.border}` }}>
                      <span style={{ color:T.green, flexShrink:0 }}>✓</span>{s}
                    </div>
                  ))}
                </div>

                {/* Improvements */}
                <div>
                  <div style={{ fontSize:11, fontWeight:600, color:T.amber, marginBottom:6, letterSpacing:".06em" }}>↑ IMPROVE THESE</div>
                  {(analysis.improvements||[]).map((s,i) => (
                    <div key={i} style={{ display:"flex", gap:8, padding:"5px 0", fontSize:12, color:T.muted, borderBottom:`1px solid ${T.border}` }}>
                      <span style={{ color:T.amber, flexShrink:0 }}>↑</span>{s}
                    </div>
                  ))}
                </div>

                {/* Best time + next action */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  <div style={{ background:T.tealLo, border:`1px solid ${T.teal}33`, borderRadius:8, padding:"10px 12px" }}>
                    <div style={{ fontSize:10, color:T.teal, fontWeight:600, marginBottom:4 }}>⏰ BEST TIME TO POST</div>
                    <div style={{ fontSize:12, color:T.text, fontWeight:600 }}>{analysis.bestTimeToPost}</div>
                  </div>
                  <div style={{ background:T.accentLo, border:`1px solid ${T.accent}33`, borderRadius:8, padding:"10px 12px" }}>
                    <div style={{ fontSize:10, color:T.accent, fontWeight:600, marginBottom:4 }}>⚡ NEXT ACTION</div>
                    <div style={{ fontSize:12, color:T.text, fontWeight:600 }}>{analysis.nextAction}</div>
                  </div>
                </div>

                {/* Content tips */}
                <div style={{ background:T.bg, borderRadius:8, padding:"10px 12px" }}>
                  <div style={{ fontSize:10, color:T.muted, fontWeight:600, marginBottom:8, letterSpacing:".06em" }}>CONTENT TIPS</div>
                  {(analysis.contentTips||[]).map((t,i) => (
                    <div key={i} style={{ display:"flex", gap:8, fontSize:12, color:T.muted, padding:"4px 0" }}>
                      <span style={{ color:T.accent }}>◈</span>{t}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {analysis?.error && (
              <div style={{ background:T.redLo, border:`1px solid ${T.red}44`, borderRadius:8, padding:"1rem", fontSize:13, color:T.red }}>
                {analysis.error}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── POST TRACKER TAB ── */}
      {tab==="posts" && (
        <div>
          {/* Add post form */}
          <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:14, padding:"1.25rem", marginBottom:"1.25rem" }}>
            <Sec title="Log a post"/>
            <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr 1fr", gap:8, alignItems:"end" }}>
              <FRow label="Post title / description">
                <input style={inp} value={newPost.title} onChange={e=>setNewPost(p=>({...p,title:e.target.value}))} placeholder="Product launch reel…"/>
              </FRow>
              <FRow label="Platform">
                <select style={inp} value={newPost.platform} onChange={e=>setNewPost(p=>({...p,platform:e.target.value}))}>
                  {Object.entries(SOCIAL_PLATFORMS).map(([id,pl])=><option key={id} value={id}>{pl.label}</option>)}
                </select>
              </FRow>
              <FRow label="Reach"><input style={inp} type="number" value={newPost.reach} onChange={e=>setNewPost(p=>({...p,reach:e.target.value}))} placeholder="0"/></FRow>
              <FRow label="Likes"><input style={inp} type="number" value={newPost.likes} onChange={e=>setNewPost(p=>({...p,likes:e.target.value}))} placeholder="0"/></FRow>
              <FRow label="Comments"><input style={inp} type="number" value={newPost.comments} onChange={e=>setNewPost(p=>({...p,comments:e.target.value}))} placeholder="0"/></FRow>
              <FRow label="&nbsp;">
                <button onClick={addPost} style={{ ...btn(true), width:"100%", whiteSpace:"nowrap" }}>+ Add</button>
              </FRow>
            </div>
          </div>

          {/* Posts list */}
          <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:14, overflow:"hidden" }}>
            <div style={{ display:"grid", gridTemplateColumns:"3fr 1fr 1fr 1fr 1fr 1fr 80px", padding:"8px 16px", borderBottom:`1px solid ${T.border}`, fontSize:11, fontWeight:600, color:T.dim, letterSpacing:".06em" }}>
              <span>POST</span><span>PLATFORM</span><span>REACH</span><span>LIKES</span><span>COMMENTS</span><span>DATE</span><span style={{textAlign:"center"}}>SCORE</span>
            </div>
            {posts.map((p,i) => {
              const pl = SOCIAL_PLATFORMS[p.platform];
              return (
                <div key={p.id} style={{ display:"grid", gridTemplateColumns:"3fr 1fr 1fr 1fr 1fr 1fr 80px", padding:"10px 16px", borderBottom:i<posts.length-1?`1px solid ${T.border}`:"none", alignItems:"center", fontSize:13 }}>
                  <div style={{ fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.title}</div>
                  <div><Pill text={pl?.label||p.platform} color={pl?.color||T.muted}/></div>
                  <div style={{ color:T.muted }}>{(p.reach||0).toLocaleString()}</div>
                  <div style={{ color:T.muted }}>{p.likes||0}</div>
                  <div style={{ color:T.muted }}>{p.comments||0}</div>
                  <div style={{ color:T.muted, fontSize:11 }}>{p.date}</div>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                    <span style={{ fontSize:13, fontWeight:700, color:scoreColor(p.score||0) }}>{p.score||"—"}</span>
                    <button onClick={() => analyzePost(p)} title="Analyze with AI" style={{ background:T.accentLo, border:`1px solid ${T.accent}44`, borderRadius:6, padding:"3px 8px", fontSize:11, color:T.accent, cursor:"pointer", fontFamily:"inherit" }}>AI</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── STRATEGY TIPS TAB ── */}
      {tab==="tips" && <StrategyTips/>}
    </div>
  );
}

function StrategyTips() {
  const [loading, setLoading] = useState(false);
  const [tips, setTips] = useState(null);
  const [niche, setNiche] = useState("");
  const [goal, setGoal] = useState("grow followers");

  async function generateTips() {
    if (!niche.trim()) return;
    setLoading(true); setTips(null);
    const prompt = `You are a top social media growth strategist. Give a comprehensive strategy for someone in the "${niche}" niche who wants to ${goal}.

Respond ONLY in this JSON (no markdown):
{
  "instagram": {
    "postingFrequency": "X times per week",
    "bestFormats": ["format1","format2","format3"],
    "bestTimes": "Day and time",
    "hashtagStrategy": "Strategy description",
    "topTips": ["tip1","tip2","tip3"]
  },
  "linkedin": {
    "postingFrequency": "X times per week",
    "bestFormats": ["format1","format2","format3"],
    "bestTimes": "Day and time",
    "contentAngles": ["angle1","angle2","angle3"],
    "topTips": ["tip1","tip2","tip3"]
  },
  "youtube": {
    "uploadFrequency": "X per week/month",
    "idealVideoLength": "X-Y minutes",
    "bestThumbnailTips": ["tip1","tip2"],
    "seoTips": ["tip1","tip2","tip3"],
    "topTips": ["tip1","tip2","tip3"]
  },
  "universalTips": ["tip1","tip2","tip3","tip4"],
  "contentCalendarIdea": "Brief content calendar suggestion for this niche"
}`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:1200, messages:[{role:"user",content:prompt}] }),
      });
      const data = await res.json();
      const text = data.content?.[0]?.text||"";
      setTips(JSON.parse(text.replace(/```json|```/g,"").trim()));
    } catch(e) {
      setTips({ error:"Failed: "+e.message });
    }
    setLoading(false);
  }

  const PlatCard = ({ id, d }) => {
    const pl = SOCIAL_PLATFORMS[id];
    if (!d) return null;
    return (
      <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, padding:"1.25rem" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:"1rem" }}>
          <span style={{ fontSize:16, color:pl.color }}>{pl.icon}</span>
          <span style={{ fontSize:14, fontWeight:700, color:pl.color }}>{pl.label} Strategy</span>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
          <div style={{ background:T.bg, borderRadius:7, padding:"8px 10px" }}>
            <div style={{ fontSize:10, color:T.dim, marginBottom:2 }}>FREQUENCY</div>
            <div style={{ fontSize:12, fontWeight:600 }}>{d.postingFrequency||d.uploadFrequency}</div>
          </div>
          <div style={{ background:T.bg, borderRadius:7, padding:"8px 10px" }}>
            <div style={{ fontSize:10, color:T.dim, marginBottom:2 }}>BEST TIME</div>
            <div style={{ fontSize:12, fontWeight:600 }}>{d.bestTimes||d.idealVideoLength}</div>
          </div>
        </div>
        {(d.bestFormats||d.seoTips||d.contentAngles) && (
          <div style={{ marginBottom:10 }}>
            <div style={{ fontSize:10, color:T.dim, marginBottom:6, fontWeight:600 }}>BEST FORMATS / ANGLES</div>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {(d.bestFormats||d.contentAngles||d.seoTips||[]).map((f,i) => (
                <span key={i} style={{ fontSize:11, padding:"3px 8px", borderRadius:6, background:pl.color+"18", color:pl.color }}>{f}</span>
              ))}
            </div>
          </div>
        )}
        <div style={{ fontSize:10, color:T.dim, marginBottom:6, fontWeight:600 }}>TOP TIPS</div>
        {(d.topTips||[]).map((t,i) => (
          <div key={i} style={{ display:"flex", gap:7, fontSize:12, color:T.muted, padding:"4px 0", borderBottom:`1px solid ${T.border}` }}>
            <span style={{ color:pl.color, flexShrink:0 }}>◈</span>{t}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div>
      <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:14, padding:"1.25rem", marginBottom:"1.25rem" }}>
        <Sec title="Generate your strategy"/>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr auto", gap:10, alignItems:"end" }}>
          <FRow label="Your niche / industry">
            <input style={inp} value={niche} onChange={e=>setNiche(e.target.value)} placeholder="e.g. B2B SaaS, fitness coaching, real estate…" onKeyDown={e=>e.key==="Enter"&&generateTips()}/>
          </FRow>
          <FRow label="Primary goal">
            <select style={inp} value={goal} onChange={e=>setGoal(e.target.value)}>
              {["grow followers","increase engagement","generate leads","build brand awareness","drive website traffic","sell products"].map(g=><option key={g}>{g}</option>)}
            </select>
          </FRow>
          <button onClick={generateTips} disabled={loading||!niche.trim()} style={{ ...btn(true), height:39, whiteSpace:"nowrap", marginBottom:1 }}>
            {loading?"Generating…":"◎ Generate Strategy"}
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:14, padding:"3rem", background:T.surface, border:`1px solid ${T.border}`, borderRadius:14 }}>
          <div style={{ width:36, height:36, borderRadius:"50%", border:`3px solid ${T.border}`, borderTopColor:T.accent, animation:"spin 1s linear infinite" }}/>
          <div style={{ fontSize:14, color:T.muted }}>Claude is building your personalised strategy…</div>
        </div>
      )}

      {tips && !tips.error && (
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {tips.contentCalendarIdea && (
            <div style={{ background:T.accentLo, border:`1px solid ${T.accent}44`, borderRadius:12, padding:"1rem 1.25rem" }}>
              <div style={{ fontSize:11, fontWeight:600, color:T.accent, marginBottom:6, letterSpacing:".06em" }}>◎ CONTENT CALENDAR IDEA</div>
              <div style={{ fontSize:13, color:T.text, lineHeight:1.6 }}>{tips.contentCalendarIdea}</div>
            </div>
          )}
          {tips.universalTips && (
            <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, padding:"1rem 1.25rem" }}>
              <div style={{ fontSize:11, fontWeight:600, color:T.teal, marginBottom:8, letterSpacing:".06em" }}>⚡ UNIVERSAL GROWTH TIPS</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
                {tips.universalTips.map((t,i) => (
                  <div key={i} style={{ display:"flex", gap:7, fontSize:12, color:T.muted, padding:"4px 0" }}>
                    <span style={{ color:T.teal }}>✓</span>{t}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
            <PlatCard id="instagram" d={tips.instagram}/>
            <PlatCard id="linkedin"  d={tips.linkedin}/>
            <PlatCard id="youtube"   d={tips.youtube}/>
          </div>
        </div>
      )}

      {tips?.error && (
        <div style={{ background:T.redLo, border:`1px solid ${T.red}44`, borderRadius:8, padding:"1rem", fontSize:13, color:T.red }}>{tips.error}</div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// FORMS
// ═══════════════════════════════════════════════════════════════════
function ContactForm({ onSave }) {
  const [f,setF] = useState({ name:"",company:"",designation:"",email:"",phone:"",tag:"Lead",notes:"" });
  const u = k => e => setF(p=>({...p,[k]:e.target.value}));
  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        <FRow label="Full name *"><input style={inp} value={f.name} onChange={u("name")} placeholder="Amit Rawat"/></FRow>
        <FRow label="Company"><input style={inp} value={f.company} onChange={u("company")} placeholder="Acme Corp"/></FRow>
        <FRow label="Designation"><input style={inp} value={f.designation} onChange={u("designation")} placeholder="VP Sales"/></FRow>
        <FRow label="Tag"><select style={inp} value={f.tag} onChange={u("tag")}>{TAGS.map(t=><option key={t}>{t}</option>)}</select></FRow>
        <FRow label="Email"><input style={inp} type="email" value={f.email} onChange={u("email")} placeholder="amit@acme.com"/></FRow>
        <FRow label="Phone"><input style={inp} value={f.phone} onChange={u("phone")} placeholder="+91 98765 43210"/></FRow>
      </div>
      <FRow label="Notes"><textarea style={{...inp,height:68,resize:"vertical"}} value={f.notes} onChange={u("notes")}/></FRow>
      <div style={{ display:"flex", justifyContent:"flex-end", marginTop:8 }}>
        <button style={btn(true)} onClick={() => f.name && onSave(f)}>Save to Google Sheet →</button>
      </div>
    </div>
  );
}

function DealForm({ contacts, onSave }) {
  const [f,setF] = useState({ dealName:"",company:"",value:"",stage:"Lead",prob:"50",contactId:"",notes:"" });
  const u = k => e => setF(p=>({...p,[k]:e.target.value}));
  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        <FRow label="Deal name *"><input style={inp} value={f.dealName} onChange={u("dealName")} placeholder="Q3 Enterprise Deal"/></FRow>
        <FRow label="Company"><input style={inp} value={f.company} onChange={u("company")} placeholder="Acme Corp"/></FRow>
        <FRow label="Value (₹)"><input style={inp} type="number" value={f.value} onChange={u("value")} placeholder="500000"/></FRow>
        <FRow label="Stage"><select style={inp} value={f.stage} onChange={u("stage")}>{STAGES.map(s=><option key={s}>{s}</option>)}</select></FRow>
        <FRow label="Probability %"><input style={inp} type="number" min={0} max={100} value={f.prob} onChange={u("prob")}/></FRow>
        <FRow label="Contact"><select style={inp} value={f.contactId} onChange={u("contactId")}><option value="">— None —</option>{contacts.map(c=><option key={c.ID} value={c.ID}>{c.Name}</option>)}</select></FRow>
      </div>
      <FRow label="Notes"><textarea style={{...inp,height:60,resize:"vertical"}} value={f.notes} onChange={u("notes")}/></FRow>
      <div style={{ display:"flex", justifyContent:"flex-end", marginTop:8 }}>
        <button style={btn(true)} onClick={() => f.dealName && onSave(f)}>Save to Google Sheet →</button>
      </div>
    </div>
  );
}

function ReminderForm({ contacts, deals, onSave }) {
  const [f,setF] = useState({ title:"",dueDate:"",contactId:"",dealId:"" });
  const u = k => e => setF(p=>({...p,[k]:e.target.value}));
  return (
    <div>
      <FRow label="Title *"><input style={inp} value={f.title} onChange={u("title")} placeholder="Follow up with Amit"/></FRow>
      <FRow label="Due date *"><input style={inp} type="date" value={f.dueDate} onChange={u("dueDate")}/></FRow>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        <FRow label="Contact"><select style={inp} value={f.contactId} onChange={u("contactId")}><option value="">— None —</option>{contacts.map(c=><option key={c.ID} value={c.ID}>{c.Name}</option>)}</select></FRow>
        <FRow label="Deal"><select style={inp} value={f.dealId} onChange={u("dealId")}><option value="">— None —</option>{deals.map(d=><option key={d.ID} value={d.ID}>{d.DealName}</option>)}</select></FRow>
      </div>
      <div style={{ display:"flex", justifyContent:"flex-end", marginTop:8 }}>
        <button style={btn(true)} onClick={() => f.title && f.dueDate && onSave(f)}>Save to Google Sheet →</button>
      </div>
    </div>
  );
}

function AssetForm({ onSave }) {
  const [f,setF] = useState({ assetName:"",category:"Laptop",office:"Pune HQ",ownership:"Owned",assignedTo:"",vendor:"",monthlyCost:"",purchaseDate:"",contractEnd:"",warrantyEnd:"",status:"Active",notes:"" });
  const u = k => e => setF(p=>({...p,[k]:e.target.value}));
  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        <FRow label="Asset name *"><input style={inp} value={f.assetName} onChange={u("assetName")} placeholder="Dell Latitude 5540"/></FRow>
        <FRow label="Category"><select style={inp} value={f.category} onChange={u("category")}>{ASSET_CATS.map(c=><option key={c}>{c}</option>)}</select></FRow>
        <FRow label="Office"><select style={inp} value={f.office} onChange={u("office")}>{OFFICES.map(o=><option key={o}>{o}</option>)}</select></FRow>
        <FRow label="Ownership"><select style={inp} value={f.ownership} onChange={u("ownership")}><option>Owned</option><option>Rented</option></select></FRow>
        <FRow label="Assigned to"><input style={inp} value={f.assignedTo} onChange={u("assignedTo")} placeholder="Employee name"/></FRow>
        <FRow label="Vendor"><input style={inp} value={f.vendor} onChange={u("vendor")} placeholder="Dell India"/></FRow>
        {f.ownership==="Rented" && <>
          <FRow label="Monthly cost (₹)"><input style={inp} type="number" value={f.monthlyCost} onChange={u("monthlyCost")} placeholder="4000"/></FRow>
          <FRow label="Contract end date"><input style={inp} type="date" value={f.contractEnd} onChange={u("contractEnd")}/></FRow>
        </>}
        <FRow label="Purchase date"><input style={inp} type="date" value={f.purchaseDate} onChange={u("purchaseDate")}/></FRow>
        <FRow label="Warranty end"><input style={inp} type="date" value={f.warrantyEnd} onChange={u("warrantyEnd")}/></FRow>
      </div>
      <FRow label="Notes"><textarea style={{...inp,height:56,resize:"vertical"}} value={f.notes} onChange={u("notes")}/></FRow>
      <div style={{ display:"flex", justifyContent:"flex-end", marginTop:8 }}>
        <button style={btn(true)} onClick={() => f.assetName && onSave(f)}>Save to Google Sheet →</button>
      </div>
    </div>
  );
}

function FileForm({ onSave }) {
  const [mode, setMode] = useState("convert");
  const [f,setF] = useState({ fileName:"",fromFmt:"PDF",toFmt:"DOCX",signedBy:"",driveLink:"" });
  const u = k => e => setF(p=>({...p,[k]:e.target.value}));
  return (
    <div>
      <div style={{ display:"flex", gap:3, marginBottom:"1.25rem", background:T.bg, border:`1px solid ${T.border}`, borderRadius:8, padding:3, width:"fit-content" }}>
        {["convert","sign"].map(m => (
          <button key={m} onClick={()=>setMode(m)} style={{ padding:"6px 16px", borderRadius:6, border:"none", background:mode===m?T.accentLo:"transparent", color:mode===m?T.accent:T.muted, fontSize:13, fontWeight:mode===m?600:400, cursor:"pointer", fontFamily:"inherit" }}>
            {m==="convert"?"Format Convert":"E-Signature"}
          </button>
        ))}
      </div>
      <FRow label="File name *"><input style={inp} value={f.fileName} onChange={u("fileName")} placeholder="report_q3.pdf"/></FRow>
      {mode==="convert" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          <FRow label="From format"><select style={inp} value={f.fromFmt} onChange={u("fromFmt")}>{FORMATS.map(x=><option key={x}>{x}</option>)}</select></FRow>
          <FRow label="To format"><select style={inp} value={f.toFmt} onChange={u("toFmt")}>{FORMATS.filter(x=>x!==f.fromFmt).map(x=><option key={x}>{x}</option>)}</select></FRow>
        </div>
      )}
      {mode==="sign" && (
        <FRow label="Signed by *"><input style={inp} value={f.signedBy} onChange={u("signedBy")} placeholder="Amit Rawat"/></FRow>
      )}
      <FRow label="Google Drive link (optional)"><input style={inp} value={f.driveLink} onChange={u("driveLink")} placeholder="https://drive.google.com/…"/></FRow>
      <div style={{ display:"flex", justifyContent:"flex-end", marginTop:8 }}>
        <button style={btn(true)} onClick={() => { if(!f.fileName) return; if(mode==="sign"&&!f.signedBy) return; onSave({...f, mode}); }}>
          Save to Google Sheet →
        </button>
      </div>
    </div>
  );
}

// ─── SHARED ──────────────────────────────────────────────────────
function Sec({ title }) {
  return <div style={{ fontSize:11, fontWeight:600, color:T.dim, letterSpacing:".1em", marginBottom:12, paddingBottom:8, borderBottom:`1px solid ${T.border}`, textTransform:"uppercase" }}>{title}</div>;
}
const H1 = { fontSize:26, fontWeight:700, letterSpacing:"-.03em", margin:"0 0 4px" };
