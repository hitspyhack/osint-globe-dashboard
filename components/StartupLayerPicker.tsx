"use client";

import { useEffect, useState } from "react";
import { LAYER_BY_ID } from "@/lib/layers";
import type { LayerId } from "@/types";

interface StartupLayerPickerProps {
  choices: LayerId[];
  onReroll: () => void;
  onStart: (layers: LayerId[]) => void;
  onContinueEmpty: () => void;
  sharedLayers?: LayerId[];
  onRestoreShared?: () => void;
}

/** Startup prompt for choosing from four randomly sampled OSINT layers. */
export default function StartupLayerPicker({
  choices,
  onReroll,
  onStart,
  onContinueEmpty,
  sharedLayers = [],
  onRestoreShared,
}: StartupLayerPickerProps) {
  const [selected, setSelected] = useState<LayerId[]>([]);

  useEffect(() => setSelected([]), [choices]);

  const toggle = (id: LayerId) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  return (
    <div className="modal-backdrop startup-backdrop">
      <section className="modal startup-modal" role="dialog" aria-modal="true" aria-labelledby="startup-title">
        <header className="startup-header">
          <div className="startup-kicker"><span /> NEW SESSION / LAYER SELECTION</div>
          <h1 id="startup-title">Start with a clear globe</h1>
          <p>All feeds are off. Choose one or more of these four random layers to bring online.</p>
        </header>

        <div className="startup-options" role="group" aria-label="Random layer choices">
          {choices.map((id, index) => {
            const layer = LAYER_BY_ID[id];
            const isSelected = selected.includes(id);
            return (
              <button
                key={id}
                type="button"
                className={`startup-option ${isSelected ? "startup-option-selected" : ""}`}
                onClick={() => toggle(id)}
                aria-pressed={isSelected}
              >
                <span className="startup-option-top">
                  <span className="startup-option-number">0{index + 1}</span>
                  <span className="startup-option-icon" style={{ color: layer.color }}>{layer.icon}</span>
                  <span className={`startup-check ${isSelected ? "startup-check-on" : ""}`}>
                    {isSelected ? "✓" : "+"}
                  </span>
                </span>
                <span className="startup-option-name">{layer.name}</span>
                <span className="startup-option-blurb">{layer.blurb}</span>
                <span className="startup-option-source">{layer.sources}</span>
                {layer.keyName && (
                  <span className="startup-option-key">
                    {layer.keyless ? "KEY OPTIONAL" : "KEY REQUIRED"} · {layer.keyName}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <footer className="startup-footer">
          <div className="startup-footer-alt">
            <button className="startup-reroll" type="button" onClick={onReroll}>
              ↻ REROLL FOUR
            </button>
            <button className="startup-empty" type="button" onClick={onContinueEmpty}>
              ENTER WITH NO LAYERS
            </button>
            {sharedLayers.length > 0 && onRestoreShared && (
              <button className="startup-shared" type="button" onClick={onRestoreShared}>
                RESTORE SHARED VIEW · {sharedLayers.length}
              </button>
            )}
          </div>
          <button
            className="startup-launch"
            type="button"
            disabled={selected.length === 0}
            onClick={() => onStart(selected)}
          >
            ACTIVATE {selected.length > 0 ? `${selected.length} LAYER${selected.length === 1 ? "" : "S"}` : "SELECTED"}
            <span>→</span>
          </button>
        </footer>
        <div className="startup-footnote">Selections are session-only · Reopens on the next launch</div>
      </section>
    </div>
  );
}
