"use client";
import { type Clinic, type ClinicService } from '../lib/catalog';
import { mapLinks } from '../lib/map-links';
import { X, Download, Navigation } from 'lucide-react';
import { useSitePreferences } from './site-preferences';

export const serviceLabelsMap = {
  uz: { consultation: 'Shifokor maslahati', lab: 'Laboratoriya', nephrology: 'Nefrologiya', hematology: 'Gematologiya', diagnostics: 'Tashxis', rehabilitation: 'Reabilitatsiya' },
  ru: { consultation: 'Консультация врача', lab: 'Лаборатория', nephrology: 'Нефрология', hematology: 'Гематология', diagnostics: 'Диагностика', rehabilitation: 'Реабилитация' },
  en: { consultation: 'Doctor consultation', lab: 'Laboratory diagnostics', nephrology: 'Nephrology', hematology: 'Hematology', diagnostics: 'Diagnostics', rehabilitation: 'Rehabilitation' }
} as const;

export const serviceLabels: Record<ClinicService, string> = serviceLabelsMap.uz;

export function ClinicComparison({ clinics, remove, clear }: { clinics: Clinic[]; remove: (name: string) => void; clear: () => void }) {
  const { locale, strings } = useSitePreferences();
  const currentServiceLabels = serviceLabelsMap[locale] || serviceLabelsMap.uz;

  if (!clinics.length) return null;

  function download() {
    const content = clinics.map(c => `${c.name}\nRegion: ${c.region}\nAddress: ${c.address}\nPhone: ${c.phone || '-'}\nServices: ${(c.services || []).map(s => currentServiceLabels[s] || s).join(', ')}\nSource: ${c.source_url}\nDirections: ${mapLinks(c.name, c.address).directions}`).join('\n\n');
    const blob = new Blob([`LifeBridge — ${strings.cc_title}\n\n` + content], { type:'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `lifebridge-clinics-${locale}.txt`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className="clinic-comparison" aria-label={strings.cc_title}>
      <header>
        <div>
          <span className="eyebrow">{strings.cc_eyebrow}</span>
          <h3>{strings.cc_title}</h3>
          <p>{strings.cc_desc}</p>
        </div>
        <div className="comparison-actions">
          <button onClick={download}><Download size={15}/> {strings.cc_download}</button>
          <button onClick={clear}>{strings.cc_clear}</button>
        </div>
      </header>
      <div className="comparison-grid">
        {clinics.map(c => (
          <article key={c.name}>
            <button className="comparison-remove" onClick={() => remove(c.name)} aria-label={`${c.name} — remove`}>
              <X size={16}/>
            </button>
            <span className="region-tag">{c.region}</span>
            <h4>{c.name}</h4>
            <p>{c.address}</p>
            <div className="service-tags">
              {c.services?.map(s => <span key={s}>{currentServiceLabels[s] || s}</span>)}
            </div>
            {c.phone ? <a href={`tel:${c.phone.replace(/[^+\d]/g,'')}`}>{c.phone}</a> : <p>{strings.cd_phone_unavailable}</p>}
            <a href={mapLinks(c.name, c.address).directions} target="_blank" rel="noopener noreferrer">
              <Navigation size={14}/> {strings.cc_directions}
            </a>
            <a href={c.source_url} target="_blank" rel="noopener noreferrer">
              {strings.cc_source}
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}
