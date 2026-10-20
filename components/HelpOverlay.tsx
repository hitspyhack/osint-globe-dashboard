"use client";

const SHORTCUTS: Array<[string, string]> = [
  ["1 – 8", "Sensor look: STD / NVG / FLIR / WHITE / CRT / NOIR / SNOW / GLOW"],
  ["L", "Toggle the layer dock"],
  ["T", "Toggle the mission clock"],
  ["/", "Focus the location search"],
  ["R", "Toggle the Earth's sidereal spin reference"],
  ["+ / -", "Zoom in / out"],
  ["P", "Screenshot the current frame"],
  ["Arrows", "Pan the globe (joystick pad focused)"],
  ["PgUp / PgDn", "Tilt the camera (joystick pad focused)"],
  ["Esc", "Close panels / clear selection"],
  ["?", "This help"],
];

interface HelpOverlayProps {
  onClose: () => void;
}

export default function HelpOverlay({ onClose }: HelpOverlayProps) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal modal-narrow" onClick={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <div>
            <h2 className="panel-title">CONSOLE KEYS</h2>
            <p className="panel-sub">everything is keyboard driven</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="modal-body">
          <table className="help-table">
            <tbody>
              {SHORTCUTS.filter(([key]) => key !== "P" || true).map(([key, description], index) =>
                description ? (
                  <tr key={`${key}-${index}`}>
                    <th>{key}</th>
                    <td>{description}</td>
                  </tr>
                ) : null
              )}
            </tbody>
          </table>

          <p className="help-note">
            Click any track to open its dossier. Click empty space to clear the selection.
          </p>
        </div>
      </div>
    </div>
  );
}
