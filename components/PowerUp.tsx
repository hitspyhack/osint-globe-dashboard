"use client";

import { useEffect, useState } from "react";
import { KEY_DEFS } from "@/lib/layers";
import type { ApiKeyMap } from "@/types";

interface PowerUpProps {
  keys: ApiKeyMap;
  onChange: (keys: ApiKeyMap) => void;
  onClose: () => void;
}

/**
 * POWER UP — optional API keys for the layers that need them.
 *
 * Keys are kept in this browser (localStorage) and are only ever sent to our
 * own `/api/*` routes, which proxy the upstream provider. Nothing is persisted
 * server side, and every keyed layer has a keyless fallback.
 */
export default function PowerUp({ keys, onChange, onClose }: PowerUpProps) {
  const [draft, setDraft] = useState<ApiKeyMap>(keys);

  useEffect(() => {
    setDraft(keys);
  }, [keys]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(keys);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <header className="modal-header">
          <div>
            <h2 className="panel-title">POWER UP</h2>
            <p className="panel-sub">optional keys — every layer works without them</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="modal-body">
          {KEY_DEFS.map((definition) => (
            <label key={definition.id} className="key-row">
              <div className="key-head">
                <span className="key-label">{definition.label}</span>
                <span className="key-unlocks">unlocks {definition.unlocks}</span>
              </div>
              <input
                className="key-input"
                type={definition.id.toLowerCase().includes("pass") ? "password" : "text"}
                value={draft[definition.id] ?? ""}
                placeholder={definition.placeholder}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, [definition.id]: event.target.value }))
                }
                autoComplete="off"
                spellCheck={false}
              />
              <p className="key-hint">
                {definition.hint}{" "}
                <a href={definition.signup} target="_blank" rel="noreferrer">
                  get a key →
                </a>
              </p>
            </label>
          ))}
        </div>

        <footer className="modal-footer">
          <span className="key-note">
            Stored in this browser only · sent to our own API routes over this origin
          </span>
          <div className="modal-actions">
            <button
              className="action-btn"
              onClick={() => {
                setDraft({});
                onChange({});
              }}
            >
              CLEAR ALL
            </button>
            <button
              className="action-btn action-btn-primary"
              disabled={!dirty}
              onClick={() => {
                onChange(draft);
                onClose();
              }}
            >
              SAVE & RELOAD FEEDS
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
