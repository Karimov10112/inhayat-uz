"use client";
import { useEffect, useState } from "react";
import { ArrowRight, Hospital, MapPin, Phone, Search, Bookmark, GitCompareArrows } from "lucide-react";
import { centres as initialCentres, clinics as initialClinics, regions, type Centre, type Clinic, type ClinicService } from "../lib/catalog";
import { supabase } from "../lib/supabase";
import { ClinicMap } from "./clinic-map";
import { ClinicComparison, serviceLabelsMap } from "./clinic-comparison";
import { useSitePreferences } from "./site-preferences";

export function useCatalog() {
  const [centres, setCentres] = useState<Centre[]>(initialCentres);
  const [clinics, setClinics] = useState<Clinic[]>(initialClinics);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    Promise.all([
      supabase.from("centres").select("id,name,speciality,address,phone,source_url,pathways,active").eq("active", true).order("name"),
      supabase.from("clinics").select("*").eq("active", true).order("name")
    ]).then(([c, r]) => {
      if (!active) return;
      if (!c.error) setCentres(c.data as Centre[]);
      if (!r.error) {
        const remote = r.data as Clinic[];
        const merged = new Map(initialClinics.map(item => [item.name, item]));
        remote.forEach(item => {
          const baseline = merged.get(item.name);
          merged.set(item.name, { ...baseline, ...item, services: item.services || baseline?.services || ["consultation"] });
        });
        setClinics([...merged.values()]);
      }
    });
    return () => { active = false; };
  }, []);
  return { centres, clinics };
}

export function ClinicDirectory() {
  const { locale, strings } = useSitePreferences();
  const currentServiceLabels = serviceLabelsMap[locale] || serviceLabelsMap.uz;
  const { clinics } = useCatalog();
  const [region, setRegion] = useState("");
  const [service, setService] = useState<ClinicService | "">("");
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState<string[]>([]);
  const [compared, setCompared] = useState<string[]>([]);
  const [savedOnly, setSavedOnly] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem('inhayat.saved-clinics') || '[]');
      if (Array.isArray(stored)) setSaved(stored.filter((v): v is string => typeof v === 'string' && v.length <= 300).slice(0, 50));
    } catch { /* Bookmarks */ }
  }, []);

  function toggleSaved(name: string) {
    const next = saved.includes(name) ? saved.filter(item => item !== name) : [...saved, name];
    setSaved(next);
    try {
      localStorage.setItem('inhayat.saved-clinics', JSON.stringify(next));
      setStatus(locale === 'ru' ? 'Список сохраненных клиник обновлен.' : locale === 'en' ? 'Saved clinics list updated.' : 'Saqlangan klinikalar ro‘yxati yangilandi.');
    } catch {
      setStatus(locale === 'ru' ? 'Браузер не разрешил сохранение.' : locale === 'en' ? 'Browser storage not permitted.' : 'Brauzer saqlashga ruxsat bermadi.');
    }
  }

  function toggleCompared(name: string) {
    if (compared.includes(name)) setCompared(compared.filter(item => item !== name));
    else if (compared.length < 3) setCompared([...compared, name]);
    else {
      setStatus(locale === 'ru' ? 'Выбрано 3 учреждения. Удалите одно для добавления нового.' : locale === 'en' ? 'Maximum 3 clinics selected. Remove one first.' : '3 ta muassasa tanlangan. Avval bittasini solishtirishdan olib tashlang.');
      return;
    }
    setStatus(locale === 'ru' ? 'Список для сравнения обновлен.' : locale === 'en' ? 'Comparison list updated.' : 'Solishtirish ro‘yxati yangilandi.');
  }

  const filtered = clinics.filter(c => (!region || c.region === region) && (!service || c.services?.includes(service)) && (!savedOnly || saved.includes(c.name)) && `${c.name} ${c.address}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const clearFilters = () => { setRegion(""); setService(""); setQuery(""); setSavedOnly(false); };

  return (
    <section className="clinic-directory section" id="clinics">
      <div className="directory-heading">
        <div>
          <div className="eyebrow">{strings.cd_eyebrow}</div>
          <h2>{strings.cd_title}</h2>
          <p>{strings.cd_desc}</p>
        </div>
        <div className="directory-tools">
          <label>
            {strings.cd_choose_region}
            <select value={region} onChange={e => setRegion(e.target.value)}>
              <option value="">{strings.cd_all_regions}</option>
              {regions.map(r => <option key={r}>{r}</option>)}
            </select>
          </label>
          <label>
            {strings.cd_choose_service}
            <select value={service} onChange={e => setService(e.target.value as ClinicService | "")}>
              <option value="">{strings.cd_all_services}</option>
              {Object.entries(currentServiceLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="search-field">
            <Search size={17}/>
            <input
              aria-label={strings.cd_search_placeholder}
              placeholder={strings.cd_search_placeholder}
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </label>
        </div>
      </div>
      <div className="directory-preferences">
        <label>
          <input type="checkbox" checked={savedOnly} onChange={e => setSavedOnly(e.target.checked)}/>
          {" "}{strings.cd_saved_only} ({saved.length})
        </label>
        <small>{strings.cd_saved_hint}</small>
      </div>
      <p className="shortlist-status" role="status">{status}</p>
      <ClinicComparison
        clinics={compared.map(name => clinics.find(c => c.name === name)).filter((c): c is Clinic => !!c)}
        remove={toggleCompared}
        clear={() => setCompared([])}
      />
      <div className="directory-meta">
        <span>{filtered.length} {strings.cd_matches}</span>
        <span>{strings.cd_sources_shown}</span>
      </div>
      <ClinicMap clinics={filtered}/>
      <div className="clinic-grid">
        {filtered.map(c => (
          <article className="clinic-item" key={c.id || c.name}>
            <div className="clinic-top">
              <span className="hospital-icon"><Hospital size={22}/></span>
              <span className="region-tag">{c.region}</span>
            </div>
            <h3>{c.name}</h3>
            <p><MapPin size={15}/>{c.address}</p>
            <div className="service-tags">
              {c.services?.map(item => <span key={item}>{currentServiceLabels[item] || item}</span>)}
            </div>
            {c.phone ? (
              <a className="clinic-phone" href={`tel:${c.phone.replace(/[^+\d]/g, "")}`}>
                <Phone size={14}/>{c.phone}
              </a>
            ) : (
              <span className="clinic-phone unavailable">
                <Phone size={14}/> {strings.cd_phone_unavailable}
              </span>
            )}
            <div className="clinic-selection">
              <button aria-pressed={saved.includes(c.name)} aria-label={`${c.name} — save`} onClick={() => toggleSaved(c.name)}>
                <Bookmark size={14}/>{saved.includes(c.name) ? strings.cd_saved : strings.cd_save}
              </button>
              <button aria-pressed={compared.includes(c.name)} aria-label={`${c.name} — compare`} onClick={() => toggleCompared(c.name)}>
                <GitCompareArrows size={14}/>{compared.includes(c.name) ? strings.cd_compared : strings.cd_compare}
              </button>
            </div>
            <div className="clinic-actions">
              <a href={c.source_url} target="_blank" rel="noreferrer">{strings.cd_open_source}</a>
              <a href="/cabinet?mode=register">{strings.cd_goto_cabinet} <ArrowRight size={14}/></a>
            </div>
          </article>
        ))}
      </div>
      {!filtered.length && (
        <div className="catalog-empty">
          <Hospital size={30}/>
          <h3>{strings.cd_empty_title}</h3>
          <p>{strings.cd_empty_desc}</p>
          <button onClick={clearFilters}>{strings.cd_clear_filters}</button>
        </div>
      )}
      <p className="directory-footnote">{strings.cd_footnote}</p>
    </section>
  );
}
