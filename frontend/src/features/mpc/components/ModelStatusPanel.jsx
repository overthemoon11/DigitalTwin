import React, { useEffect, useState } from "react";

/**
 * How far each part of the plant model is actually calibrated, and how close
 * the whole assembled twin is to the real plant.
 *
 * This panel is the reason a saving figure elsewhere in this sidebar can be
 * read as engineering rather than marketing. A 4% improvement produced by a
 * model with unknown error is not a result; the same 4% beside a plant-power
 * MAE and the list of channels the site does not even trend is.
 *
 * Nothing here is editorialised. `status` comes from the backend's own model
 * registry, `missingSignals` from the dataset exporter, and the validation
 * metrics from replaying the measured month through the twin.
 */

const STATUS_LABEL = {
  'site-calibrated': 'Site calibrated',
  'partially-calibrated': 'Partly calibrated',
  default: 'Default / physics',
};

const TRAINED_LABEL = {
  bms: 'real BMS',
  synthetic: 'synthetic',
  none: 'not fitted',
};

const n = (v, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : '—');

export default function ModelStatusPanel({ modelStatus, twinValidation, onLoadValidation }) {
  const [showValidation, setShowValidation] = useState(false);

  useEffect(() => {
    if (showValidation) onLoadValidation?.();
  }, [showValidation, onLoadValidation]);

  if (!modelStatus) return null;
  const { models, missingSignals } = modelStatus;
  const calibrated = models.filter((m) => m.status === 'site-calibrated').length;

  return (
    <section className="vsp-section mpc-section">
      <h4>Model &amp; Calibration Status</h4>
      <p className="vsp-desc">
        {calibrated} of {models.length} model blocks are fitted to this site&apos;s measured
        data. The rest are physics defaults, and every control that depends on one says so.
      </p>

      <div className="eng-table-wrap eng-model-table-wrap">
        <table className="tw-table vsp-cascade-table mpc-compare mpc-model-table">
          <colgroup>
            <col className="mpc-model-col-name" />
            <col className="mpc-model-col-basis" />
            <col className="mpc-model-col-fit" />
          </colgroup>
        <thead>
          <tr>
            <th>Model</th>
            <th>Basis</th>
            <th>Fit</th>
          </tr>
        </thead>
        <tbody>
          {models.map((m) => (
            <tr key={m.id}>
              <td className="vsp-ct-param" title={m.note}>
                {m.label}
                <span className="mpc-note-mark">*</span>
              </td>
              <td>
                <span className={`mpc-prov mpc-prov--${m.status === 'site-calibrated' ? 'optimized' : m.status === 'partially-calibrated' ? 'derived' : 'not-available'}`}>
                  {STATUS_LABEL[m.status] ?? m.status}
                </span>
                <span className="mpc-model-trained">from {TRAINED_LABEL[m.trainedOn] ?? m.trainedOn}</span>
              </td>
              <td>
                <div className="mpc-model-metrics">
                  {m.metrics
                  ? Object.entries(m.metrics)
                      .slice(0, 3)
                      .map(([k, v]) => (
                        <span key={k}>
                          {k}: {typeof v === 'number' ? Number(v.toFixed(4)) : String(v)}
                        </span>
                      ))
                  : <span className="mpc-model-none">not fitted</span>}
                  {m.missingInputs.length > 0 && (
                    <span className="mpc-model-missing" title="Channels this model needs that the site does not trend">
                      missing: {m.missingInputs.join(', ')}
                    </span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>

      {Object.keys(missingSignals ?? {}).length > 0 && (
        <>
          <div className="mpc-subhead">Signals this site does not trend</div>
          <ul className="mpc-caveats mpc-caveats--tight">
            {Object.entries(missingSignals).map(([key, why]) => (
              <li key={key}>
                <code>{key}</code> — {why}
              </li>
            ))}
          </ul>
        </>
      )}

      <button
        type="button"
        className="mpc-secondary-btn mpc-disclose"
        onClick={() => setShowValidation((v) => !v)}
      >
        {showValidation ? 'Hide' : 'Show'} twin-vs-plant validation
      </button>

      {showValidation && (
        <div className="mpc-validation">
          {!twinValidation ? (
            <p className="vsp-desc">Replaying the measured month through the twin…</p>
          ) : (
            <>
              <p className="vsp-desc">{twinValidation.basis}</p>
              <div className="eng-table-wrap eng-validation-table-wrap">
                <table className="tw-table vsp-cascade-table mpc-compare eng-validation-table">
                  <colgroup>
                    <col className="mpc-validation-col-channel" />
                    <col className="mpc-validation-col-mae" />
                    <col className="mpc-validation-col-fit" />
                  </colgroup>
                <thead>
                  <tr>
                    <th>Channel</th>
                    <th>MAE</th>
                    <th>R²</th>
                  </tr>
                </thead>
                <tbody>
                  {twinValidation.channels.map((c) => (
                    <tr key={c.id}>
                      <td className="vsp-ct-param" title={`${c.reference} · n=${c.metrics.n} · RMSE ${n(c.metrics.rmse)} · bias ${n(c.metrics.bias)} ${c.unit}`}>
                        {c.label}
                        <span className="mpc-note-mark">*</span>
                      </td>
                      <td>
                        {n(c.metrics.mae)} {c.unit}
                        {c.metrics.mapePct != null && (
                          <em className="mpc-detail-was">{c.metrics.mapePct.toFixed(2)}%</em>
                        )}
                      </td>
                      <td>{n(c.metrics.r2, 4)}</td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>
              <p className="vsp-desc">
                Scored over {twinValidation.recordsScored.toLocaleString()} of{' '}
                {twinValidation.recordsAvailable.toLocaleString()} measured buckets across{' '}
                {twinValidation.days.length} days.
              </p>
              <div className="mpc-subhead">Not scorable, and why</div>
              <ul className="mpc-caveats mpc-caveats--tight">
                {twinValidation.unscorable.map((u) => (
                  <li key={u.id}>
                    <strong>{u.label}</strong> — {u.reason}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
