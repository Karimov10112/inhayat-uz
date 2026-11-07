"use client";
import { useState } from 'react';
import { MapPin, Navigation, ExternalLink } from 'lucide-react';
import { type Clinic } from '../lib/catalog';
import { mapLinks } from '../lib/map-links';

export function ClinicMap({ clinics }: { clinics: Clinic[] }) {
  const [selected, setSelected] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [mapError, setMapError] = useState(false);
  const clinic = clinics.find(c => c.name === selected) || clinics[0];
  if (!clinic) return null;
  const links = mapLinks(clinic.name, clinic.address);
  function selectClinic(value: string) {
    setSelected(value);
    setMapError(false);
  }
  return <section className="clinic-map" aria-label="Klinikalar xaritasi"><div className="map-info"><span className="eyebrow"><MapPin size={15}/> MANZIL VA YO‘NALISH</span><h3>Yaqinroq yordamni toping.</h3><p>Filtrga mos muassasani tanlab, manzil va borish yo‘lini ko‘ring.</p><label>Muassasani tanlang<select value={clinic.name} onChange={e => selectClinic(e.target.value)}>{clinics.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}</select></label><strong>{clinic.name}</strong><p>{clinic.address}</p><div className="map-links"><a href={links.directions} target="_blank" rel="noopener noreferrer"><Navigation size={16}/> Borish yo‘li</a><a href={links.search} target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/> Google Maps</a></div><small>Xarita manzil bo‘yicha qidiradi. Muassasaning aniq kirish joyini qabulxona bilan tasdiqlang.</small></div><div className="map-view">{enabled && !mapError ? <iframe key={links.embed} title={`${clinic.name} xaritasi`} src={links.embed} loading="lazy" referrerPolicy="no-referrer" allowFullScreen onError={() => setMapError(true)}/> : <div className="map-consent"><MapPin size={36}/><h4>{mapError ? "Xaritani ochib bo‘lmadi" : "Interaktiv xarita"}</h4><p>{mapError ? "Google Maps’ni yangi oynada ochib, yo‘nalishni davom ettiring." : "Xaritani ochishda tanlangan klinikaning ochiq manzili va brauzeringiz ulanish ma’lumotlari Google’ga yuboriladi."}</p><button onClick={() => { setMapError(false); setEnabled(true); }}>Xaritani yuklash</button></div>}</div></section>;
}
