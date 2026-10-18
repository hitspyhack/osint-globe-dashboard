"use client";

import { GROUP_LABELS, GROUP_ORDER, LAYERS } from "@/lib/layers";
import { formatRelative } from "@/lib/time";
import type { LayerId, LayerStatus } from "@/types";

interface LayerDockProps {
  enabled: LayerId[];
  statuses: Partial<Record<LayerId, LayerStatus>>;
  onToggle: (id: LayerId) => void;
  onRefresh: (id: LayerId) => void;
  onSolo: (id: LayerId) => void;
  onOpenPowerUp: () => void;
  onClose: () => void;
}

function statusTone(status: LayerStatus | undefined, enabled: boolean): string {
  if (!enabled) return "off";
  if (!status) return "pending";
  if (status.loading) return "pending";
  if (status.needsKey) return "key";
  return status.online ? "online" : "offline";
}

function statusLabel(status: LayerStatus | undefined, enabled: boolean): string {
  if (!enabled) return "off";
  if (!status) return "queued";
  if (status.loading) return "loading";
  if (status.needsKey) return "key required";
  if (!status.online) return status.error ?? "offline";
  return status.source ?? "live";
}

/** Left dock: every layer, its live count and the health of its upstream. */
export default function LayerDock({
  enabled,
  statuses,
  onToggle,
  onRefresh,
  onSolo,
  onOpenPowerUp,
  onClose,
}: LayerDockProps) {
  const enabledSet = new Set(enabled);

  return (
    <aside className="panel panel-left">
      <header className="panel-header">
        <div>
          <h2 className="panel-title">LAYERS</h2>
          <p className="panel-sub">live public intelligence feeds</p>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close layers">
          ✕
        </button>
      </header>

      <div className="panel-body">
        {GROUP_ORDER.map((group) => {
          const layers = LAYERS.filter((layer) => layer.group === group);
          if (layers.length === 0) return null;

          return (
            <section key={group} className="layer-group">
              <h3 className="layer-group-title">{GROUP_LABELS[group] ?? group}</h3>

              {layers.map((layer) => {
                const status = statuses[layer.id];
                const isOn = enabledSet.has(layer.id);
                const tone = statusTone(status, isOn);

                return (
                  <div
                    key={layer.id}
                    className={`layer-row ${isOn ? "layer-row-on" : ""}`}
                    title={layer.blurb}
                  >
                    <button
                      className="layer-toggle"
                      onClick={() => onToggle(layer.id)}
                      aria-pressed={isOn}
                    >
                      <span className="layer-swatch" style={{ background: layer.color }} />
                      <span className="layer-icon">{layer.icon}</span>
                      <span className="layer-name">{layer.name}</span>
                    </button>

                    <div className="layer-meta">
                      <span className="layer-count">{isOn ? status?.count ?? 0 : "—"}</span>
                      <span className={`status-dot status-${tone}`} title={statusLabel(status, isOn)} />
                    </div>

                    <div className="layer-actions">
                      <button
                        className="mini-btn"
                        title="Solo this layer"
                        onClick={() => onSolo(layer.id)}
                      >
                        ◉
                      </button>
                      <button
                        className="mini-btn"
                        title="Refresh now"
                        onClick={() => onRefresh(layer.id)}
                      >
                        ⟳
                      </button>
                    </div>

                    <div className="layer-detail">
                      <span className="layer-source">{layer.sources}</span>
                      <span className={`layer-status layer-status-${tone}`}>
                        {statusLabel(status, isOn)}
                        {status?.updatedAt ? ` · ${formatRelative(status.updatedAt)}` : ""}
                      </span>
                      {!layer.keyless && !status?.online && (
                        <button className="link-btn" onClick={onOpenPowerUp}>
                          add key in POWER UP
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>

      <footer className="panel-footer">
        <span>
          {enabled.length} active · {LAYERS.length} available
        </span>
      </footer>
    </aside>
  );
}
