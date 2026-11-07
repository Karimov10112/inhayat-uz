"use client";

import { useEffect, useMemo, useState } from "react";
import { ClinicDirectory, useCatalog } from "./catalog";
import { ArrowLeft, ArrowRight, Bus, CalendarDays, Check, ChevronDown, CircleHelp, FileUp, HeartPulse, Hospital, MapPin, Menu, Plane, Sparkles, Stethoscope, TrainFront, WalletCards, X } from "lucide-react";
import { SitePreferencesControls, useSitePreferences } from "./site-preferences";

type TransportType = "train" | "plane" | "bus";

const regions = ["Toshkent shahri", "Andijon", "Buxoro", "Farg‘ona", "Jizzax", "Qashqadaryo", "Namangan", "Navoiy", "Samarqand", "Surxondaryo", "Sirdaryo", "Toshkent viloyati", "Xorazm", "Qoraqalpog‘iston R."];

const transportCosts: Record<TransportType, Record<string, number>> = {
  // Poyezd (bir tomonlama o‘rtacha chipta)
  train: {
    "Toshkent shahri": 150000,
    "Toshkent viloyati": 260000,
    "Sirdaryo": 340000,
    "Jizzax": 410000,
    "Samarqand": 470000,
    "Farg‘ona": 520000,
    "Andijon": 560000,
    "Namangan": 540000,
    "Navoiy": 580000,
    "Qashqadaryo": 610000,
    "Buxoro": 650000,
    "Surxondaryo": 720000,
    "Xorazm": 760000,
    "Qoraqalpog‘iston R.": 900000
  },
  // Samolyot (bir tomonlama o‘rtacha aviabilet)
  plane: {
    "Toshkent shahri": 50000, // Shahar ichi taksi
    "Toshkent viloyati": 120000,
    "Sirdaryo": 250000, // Eng yaqin aeroportgacha transport
    "Jizzax": 320000,
    "Samarqand": 650000,
    "Farg‘ona": 580000,
    "Andijon": 620000,
    "Namangan": 590000,
    "Navoiy": 680000,
    "Qashqadaryo": 720000,
    "Buxoro": 780000,
    "Surxondaryo": 890000,
    "Xorazm": 1050000,
    "Qoraqalpog‘iston R.": 1180000
  },
  // Avtobus (bir tomonlama avtobus yoki qatnovli mikroavtobus)
  bus: {
    "Toshkent shahri": 30000,
    "Toshkent viloyati": 60000,
    "Sirdaryo": 90000,
    "Jizzax": 130000,
    "Samarqand": 180000,
    "Farg‘ona": 190000,
    "Andijon": 210000,
    "Namangan": 200000,
    "Navoiy": 220000,
    "Qashqadaryo": 240000,
    "Buxoro": 260000,
    "Surxondaryo": 310000,
    "Xorazm": 340000,
    "Qoraqalpog‘iston R.": 390000
  }
};

export function LifeBridgePage() {
  const { locale, strings } = useSitePreferences();
  const { centres: verifiedCentres } = useCatalog();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<"how" | "clinics" | "centres" | "budget" | "start" | "faq" | null>(null);
  const [region, setRegion] = useState("Samarqand");
  const [nights, setNights] = useState(12);
  const [transportType, setTransportType] = useState<TransportType>("train");
  const [step, setStep] = useState(1);
  const [startRegion, setStartRegion] = useState("");
  const [startPathway, setStartPathway] = useState("");

  const money = (value: number) =>
    Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " " + strings.budget_currency;

  const steps = [
    { number: "01", title: strings.step1_title, description: strings.step1_desc, icon: MapPin, action: strings.step1_btn },
    { number: "02", title: strings.step2_title, description: strings.step2_desc, icon: FileUp, action: strings.step2_btn },
    { number: "03", title: strings.step3_title, description: strings.step3_desc, icon: Hospital, action: strings.step3_btn },
    { number: "04", title: strings.step4_title, description: strings.step4_desc, icon: CalendarDays, action: strings.step4_btn }
  ];

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const section = ["how", "clinics", "centres", "budget", "start", "faq"].includes(hash) ? hash as NonNullable<typeof activeSection> : null;
    if (section) window.setTimeout(() => openSection(section), 0);
  }, []);

  const estimate = useMemo(() => {
    const oneWay = transportCosts[transportType][region] || transportCosts.train[region] || 470000;
    const transport = oneWay * 2;
    const lodging = nights * 280000;
    const recovery = 1800000;
    return { transport, lodging, recovery, total: transport + lodging + recovery };
  }, [region, nights, transportType]);

  function openSection(section: NonNullable<typeof activeSection>) {
    setActiveSection(section);
    setMenuOpen(false);
    window.history.replaceState(null, "", `#${section}`);
    window.setTimeout(() => document.getElementById(section)?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  function closeSection() {
    setActiveSection(null);
    window.history.replaceState(null, "", "#section-menu");
    window.setTimeout(() => document.getElementById("section-menu")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  const sectionButtons = [
    { id: "how" as const, label: strings.nav_how, description: strings.section_how_desc, icon: Sparkles },
    { id: "clinics" as const, label: strings.nav_clinics, description: strings.section_clinics_desc, icon: MapPin },
    { id: "centres" as const, label: strings.nav_centres, description: strings.section_centres_desc, icon: Hospital },
    { id: "budget" as const, label: strings.nav_budget, description: strings.section_budget_desc, icon: WalletCards },
    { id: "start" as const, label: strings.nav_start, description: strings.section_start_desc, icon: ArrowRight },
    { id: "faq" as const, label: strings.nav_help, description: strings.section_help_desc, icon: CircleHelp },
  ];

  return (
    <main>
      <nav className="nav">
        <a className="brand" href="#top">
          <span className="brand-mark"><HeartPulse size={20}/></span>
          <span>Life<span>Bridge</span></span>
        </a>
        <div className={menuOpen ? "navlinks open" : "navlinks"}>
          <button onClick={() => openSection("how")}>{strings.nav_how}</button>
          <button onClick={() => openSection("centres")}>{strings.nav_centres}</button>
          <button onClick={() => openSection("budget")}>{strings.nav_budget}</button>
          <button onClick={() => openSection("faq")}>{strings.nav_help}</button>
        </div>
        <div className="nav-actions">
          <SitePreferencesControls />
          <a className="outline-button" href="/cabinet">{strings.nav_login}</a>
          <button className="menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menyu">
            {menuOpen ? <X/> : <Menu/>}
          </button>
        </div>
      </nav>

      <section className="hero" id="top">
        <div className="hero-orb orb-one"/>
        <div className="hero-orb orb-two"/>
        <div className="hero-copy">
          <div className="eyebrow"><Sparkles size={14}/> {strings.hero_all_in_one}</div>
          <h1>{strings.hero_title_1}<em>{strings.hero_title_em}</em>{strings.hero_title_2}</h1>
          <p>{strings.hero_desc}</p>
          <div className="trust-row">
            <div className="avatars"><i>O</i><i>S</i><i>M</i></div>
            <span>{strings.hero_not_alone}</span>
          </div>
        </div>
        <div className="hero-visual doctor-hero">
          <div className="hero-photo-wrap">
            <img src="/doctor-portrait.png" alt={strings.doctor_alt} className="hero-photo"/>
            <div className="hero-photo-shade"/>
          </div>
          <div className="doctor-caption">
            <Stethoscope size={22}/>
            <span>
              <strong>{strings.hero_doctor_title}</strong>
              <small>{strings.hero_doctor_sub}</small>
            </span>
          </div>
        </div>
      </section>

      <section className="metrics">
        <div><b>{strings.metric_1_num}</b><span>{strings.metric_1_text}</span></div>
        <div><b>{strings.metric_2_num}</b><span>{strings.metric_2_text}</span></div>
        <div><b>{strings.metric_3_num}</b><span>{strings.metric_3_text}</span></div>
      </section>

      <section className="section-menu" id="section-menu" aria-label="Asosiy bo‘limlar">
        {sectionButtons.map(({ id, label, description, icon: Icon }) => (
          <button
            key={id}
            className={activeSection === id ? "section-menu-item active" : "section-menu-item"}
            onClick={() => openSection(id)}
            aria-expanded={activeSection === id}
          >
            <span className="section-menu-icon"><Icon size={20}/></span>
            <span><strong>{label}</strong><small>{description}</small></span>
            <ChevronDown size={17}/>
          </button>
        ))}
      </section>

      {activeSection && (
        <button className="section-exit" onClick={closeSection}>
          <ArrowLeft size={16}/> {strings.section_exit}
        </button>
      )}

      {activeSection === "how" && (
        <section className="section how reveal" id="how">
          <div className="section-heading">
            <div className="eyebrow">{strings.how_eyebrow}</div>
            <h2>{strings.how_title}</h2>
            <p>{strings.how_desc}</p>
          </div>
          <div className="steps">
            {steps.map((item, index) => {
              const Icon = item.icon;
              return (
                <article className="step" key={item.number}>
                  <span className="step-number">{item.number}</span>
                  <div className="step-icon"><Icon size={22}/></div>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                  <button
                    className="step-action"
                    onClick={() => openSection(index === 0 ? "clinics" : index === 1 ? "start" : index === 2 ? "centres" : "budget")}
                  >
                    {item.action} <ArrowRight size={14}/>
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {activeSection === "clinics" && <ClinicDirectory/>}

      {activeSection === "centres" && (
        <section className="section centre-section reveal" id="centres">
          <div className="centre-copy">
            <div className="eyebrow">{strings.centres_eyebrow}</div>
            <h2>{strings.centres_title}</h2>
            <p>{strings.centres_desc}</p>
            <a className="soft-button" href="/cabinet">
              {strings.centres_open_roadmap} <ArrowRight size={17}/>
            </a>
          </div>
          <div className="centre-board">
            <div className="board-header">
              <span><span className="pulse"/> {strings.centres_official_catalog}</span>
              <small>{verifiedCentres.length} {strings.centres_count}</small>
            </div>
            {verifiedCentres.map((centre, index) => (
              <article className="centre-card real-centre" key={centre.name}>
                <div className="hospital-icon">
                  {index === 0 ? <Stethoscope size={21}/> : <Hospital size={21}/>}
                </div>
                <div className="centre-info">
                  <small>{centre.speciality}</small>
                  <h3>{centre.name}</h3>
                  <span><MapPin size={13}/>{centre.address}</span>
                  <a className="centre-phone" href={`tel:${centre.phone.replace(/[^+\d]/g, "")}`}>
                    {centre.phone}
                  </a>
                </div>
                <a className="source-link" href={centre.source_url} target="_blank" rel="noreferrer">
                  {strings.centres_source}
                </a>
              </article>
            ))}
            <div className="board-footer">
              <CircleHelp size={15}/> {strings.centres_queue_note}
            </div>
          </div>
        </section>
      )}

      {activeSection === "budget" && (
        <section className="planner reveal" id="budget">
          <div className="planner-intro">
            <div className="eyebrow light">{strings.budget_eyebrow}</div>
            <h2>{strings.budget_title}</h2>
            <p>{strings.budget_desc}</p>
            <div className="planner-note">
              <WalletCards size={20}/>
              <span>{strings.budget_note}</span>
            </div>
          </div>
          <div className="calculator">
            <div className="calculator-title">
              <div className="calc-icon">
                {transportType === "plane" ? <Plane size={21}/> : transportType === "bus" ? <Bus size={21}/> : <TrainFront size={21}/>}
              </div>
              <div>
                <strong>{strings.budget_card_title}</strong>
                <span>{strings.budget_card_sub}</span>
              </div>
            </div>
            <label>
              {strings.budget_which_region}
              <select value={region} onChange={e => setRegion(e.target.value)}>
                {regions.map(r => <option key={r}>{r}</option>)}
              </select>
            </label>
            <div style={{ marginTop: "12px", marginBottom: "16px" }}>
              <span style={{ fontSize: "13px", fontWeight: "500", color: "var(--foreground, #1e293b)", display: "block", marginBottom: "8px" }}>
                {strings.budget_transport_type || "Transport turi"}
              </span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => setTransportType("train")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    padding: "10px 6px",
                    borderRadius: "10px",
                    border: transportType === "train" ? "2px solid #0f766e" : "1px solid #cbd5e1",
                    backgroundColor: transportType === "train" ? "#e6f4f2" : "#ffffff",
                    color: transportType === "train" ? "#0f766e" : "#475569",
                    fontWeight: transportType === "train" ? "600" : "500",
                    cursor: "pointer",
                    fontSize: "13px",
                    transition: "all 0.15s ease"
                  }}
                >
                  <TrainFront size={16} />
                  <span>{strings.budget_train || "Poyezd"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTransportType("plane")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    padding: "10px 6px",
                    borderRadius: "10px",
                    border: transportType === "plane" ? "2px solid #0f766e" : "1px solid #cbd5e1",
                    backgroundColor: transportType === "plane" ? "#e6f4f2" : "#ffffff",
                    color: transportType === "plane" ? "#0f766e" : "#475569",
                    fontWeight: transportType === "plane" ? "600" : "500",
                    cursor: "pointer",
                    fontSize: "13px",
                    transition: "all 0.15s ease"
                  }}
                >
                  <Plane size={16} />
                  <span>{strings.budget_plane || "Samolyot"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTransportType("bus")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    padding: "10px 6px",
                    borderRadius: "10px",
                    border: transportType === "bus" ? "2px solid #0f766e" : "1px solid #cbd5e1",
                    backgroundColor: transportType === "bus" ? "#e6f4f2" : "#ffffff",
                    color: transportType === "bus" ? "#0f766e" : "#475569",
                    fontWeight: transportType === "bus" ? "600" : "500",
                    cursor: "pointer",
                    fontSize: "13px",
                    transition: "all 0.15s ease"
                  }}
                >
                  <Bus size={16} />
                  <span>{strings.budget_bus || "Avtobus"}</span>
                </button>
              </div>
            </div>
            <label>
              {strings.budget_nights} <b>{nights} {strings.budget_nights_unit}</b>
              <input type="range" min="3" max="30" value={nights} onChange={e => setNights(Number(e.target.value))}/>
              <div className="range-labels">
                <span>3 {strings.budget_nights_unit}</span>
                <span>30 {strings.budget_nights_unit}</span>
              </div>
            </label>
            <div className="costs">
              <p>
                <span>
                  {strings.budget_cost_transport} ({transportType === "plane" ? strings.budget_plane : transportType === "bus" ? strings.budget_bus : strings.budget_train})
                </span>
                <b>{money(estimate.transport)}</b>
              </p>
              <p><span>{strings.budget_cost_lodging} ({nights} {strings.budget_nights_unit})</span><b>{money(estimate.lodging)}</b></p>
              <p><span>{strings.budget_cost_recovery}</span><b>{money(estimate.recovery)}</b></p>
            </div>
            <div className="total">
              <span>{strings.budget_total}</span>
              <strong>{money(estimate.total)}</strong>
            </div>
            <button
              className="calc-button"
              onClick={() => {
                const blob = new Blob([JSON.stringify({ region, nights, transportType, ...estimate }, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `lifebridge-travel-plan-${locale}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              {strings.budget_download_btn} <ArrowRight size={17}/>
            </button>
          </div>
        </section>
      )}

      {activeSection === "start" && (
        <section className="section start reveal" id="start">
          <div className="start-card">
            <div>
              <div className="eyebrow">{strings.start_eyebrow}</div>
              <h2>{strings.start_title}</h2>
              <p>{strings.start_desc}</p>
            </div>
            <div className="form">
              <div className="form-progress">
                <span className={step >= 1 ? "active" : ""}>1</span><i/>
                <span className={step >= 2 ? "active" : ""}>2</span><i/>
                <span className={step >= 3 ? "active" : ""}>3</span>
              </div>
              {step === 1 && (
                <>
                  <label>
                    {strings.start_select_region}
                    <select value={startRegion} onChange={e => setStartRegion(e.target.value)}>
                      <option value="" disabled>{strings.start_choose_region_placeholder}</option>
                      {regions.map(r => <option key={r}>{r}</option>)}
                    </select>
                  </label>
                  <button disabled={!startRegion} onClick={() => setStep(2)}>
                    {strings.start_continue} <ArrowRight size={17}/>
                  </button>
                </>
              )}
              {step === 2 && (
                <>
                  <label>
                    {strings.start_select_pathway}
                    <select value={startPathway} onChange={e => setStartPathway(e.target.value)}>
                      <option value="" disabled>{strings.start_choose_pathway_placeholder}</option>
                      <option value="kidney">{strings.start_pathway_kidney}</option>
                      <option value="liver">{strings.start_pathway_liver}</option>
                      <option value="heart">{strings.start_pathway_heart}</option>
                      <option value="stem_cell">{strings.pathway_stem_cell}</option>
                      <option value="other">{strings.start_pathway_other}</option>
                    </select>
                  </label>
                  <button disabled={!startPathway} onClick={() => setStep(3)}>
                    {strings.start_continue} <ArrowRight size={17}/>
                  </button>
                </>
              )}
              {step === 3 && (
                <div className="complete">
                  <Check/>
                  <h3>{strings.start_ready_title}</h3>
                  <p>{strings.start_ready_desc}</p>
                  <a className="primary-button" href={`/cabinet?${new URLSearchParams({ mode: "register", region: startRegion, pathway: startPathway })}`}>
                    {strings.start_register_btn} <ArrowRight size={17}/>
                  </a>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {activeSection === "faq" && (
        <section className="faq reveal" id="faq">
          <div>
            <div className="eyebrow">{strings.faq_eyebrow}</div>
            <h2>{strings.faq_title}</h2>
          </div>
          <div className="faq-links">
            <a href="mailto:help@lifebridge.uz">
              <span className="faq-icon">?</span>
              <span>
                <b>{strings.faq_help_title}</b>
                <small>{strings.faq_help_desc}</small>
              </span>
              <ArrowRight size={18}/>
            </a>
            <a href="#start" onClick={e => { e.preventDefault(); openSection("start"); }}>
              <span className="faq-icon"><HeartPulse size={19}/></span>
              <span>
                <b>{strings.faq_start_title}</b>
                <small>{strings.faq_start_desc}</small>
              </span>
              <ArrowRight size={18}/>
            </a>
          </div>
        </section>
      )}

      <footer>
        <a className="brand" href="#top">
          <span className="brand-mark"><HeartPulse size={20}/></span>
          <span>Life<span>Bridge</span></span>
        </a>
        <p>{strings.footer_tagline}</p>
        <small>© {new Date().getFullYear()} LifeBridge. {strings.footer_disclaimer}</small>
      </footer>
    </main>
  );
}
