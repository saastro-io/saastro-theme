/**
 * StudioMock — maqueta interactiva de Saastro Studio para el hero de la home.
 *
 * Es una DEMO: el visitante escribe en el panel y la vista previa cambia, sin
 * guardar ni enviar nada. Su copy llega por props desde `hero.mock` (i18n),
 * así que no lleva marcadores de Studio: no es contenido editable del site.
 */
import { useState, type ChangeEvent } from 'react';
import { Check, Lock, Upload } from 'lucide-react';

export interface StudioMockCopy {
  url: string;
  badge: string;
  brand: string;
  nav: string[];
  sectionTag: string;
  panelTitle: string;
  headingLabel: string;
  subheadingLabel: string;
  imageLabel: string;
  imagePlaceholder: string;
  replace: string;
  unpublished: string;
  publish: string;
  published: string;
  samples: { lang: string; heading: string; subheading: string }[];
}

export function StudioMock({ copy }: { copy: StudioMockCopy }) {
  const [lang, setLang] = useState(copy.samples[0]?.lang ?? 'EN');
  const [samples, setSamples] = useState(copy.samples);
  const [saved, setSaved] = useState(false);
  const current = samples.find((s) => s.lang === lang) ?? samples[0];

  const set = (key: 'heading' | 'subheading') => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setSaved(false);
    setSamples(samples.map((s) => (s.lang === lang ? { ...s, [key]: e.target.value } : s)));
  };

  return (
    <div className="studio">
      <div className="studio-bar">
        <div className="dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div className="studio-url">
          <Lock size={11} aria-hidden="true" />
          {copy.url}/{lang.toLowerCase()}
        </div>
        <span className="ds-badge">{copy.badge}</span>
      </div>
      <div className="studio-body">
        <div className="pv">
          <div className="pv-nav">
            <b>{copy.brand}</b>
            {copy.nav.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
          <div className="pv-sec">
            <span className="pv-tag">{copy.sectionTag}</span>
            <div className="pv-h">{current?.heading || ' '}</div>
            <div className="pv-p">{current?.subheading}</div>
            <div className="pv-img">{copy.imagePlaceholder}</div>
          </div>
          <div className="pv-row" aria-hidden="true">
            <div />
            <div />
            <div />
          </div>
        </div>
        <div className="panel">
          <div className="panel-h">
            <span className="eyebrow">{copy.panelTitle}</span>
            <div className="tabs" role="tablist">
              {samples.map((s) => (
                <button
                  key={s.lang}
                  type="button"
                  role="tab"
                  aria-selected={s.lang === lang}
                  className={s.lang === lang ? 'on' : ''}
                  onClick={() => setLang(s.lang)}
                >
                  {s.lang}
                </button>
              ))}
            </div>
          </div>
          <div className="panel-b">
            <label className="fld">
              <span>{copy.headingLabel}</span>
              <input value={current?.heading ?? ''} onChange={set('heading')} />
            </label>
            <label className="fld">
              <span>{copy.subheadingLabel}</span>
              <textarea rows={3} value={current?.subheading ?? ''} onChange={set('subheading')} />
            </label>
            <div className="fld">
              <span>{copy.imageLabel}</span>
              <div className="img-field">
                <span className="th" aria-hidden="true" />
                <button type="button" className="mini secondary">
                  <Upload size={14} aria-hidden="true" />
                  {copy.replace}
                </button>
              </div>
            </div>
          </div>
          <div className="panel-f">
            <span className="micro">{saved ? copy.published : copy.unpublished}</span>
            <button type="button" className="mini primary" onClick={() => setSaved(true)}>
              {saved && <Check size={14} aria-hidden="true" />}
              {saved ? copy.published : copy.publish}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
