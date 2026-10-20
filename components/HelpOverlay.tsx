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

const MOUSE: Array<[string, string]> = [
  ["Drag", "Rotate the globe"],
  ["Wheel", "Zoom in / out"],
  ["Right-drag", "Tilt toward the horizon & rotate the heading — 3D view (Ctrl+drag works too)"],
  ["Click", "Open a track's dossier"],
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
            <p className="panel-sub">keyboard and mouse driven</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="modal-body">
          <table className="help-table">
            <tbody>
              {SHORTCUTS.map(([key, description], index) => (
                <tr key={`${key}-${index}`}>
                  <th>{key}</th>
                  <td>{description}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 className="panel-title mt-4 text-[11px]">MOUSE</h3>
          <table className="help-table">
            <tbody>
              {MOUSE.map(([key, description], index) => (
                <tr key={`${key}-${index}`}>
                  <th>{key}</th>
                  <td>{description}</td>
                </tr>
              ))}
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
