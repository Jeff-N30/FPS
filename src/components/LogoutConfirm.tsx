import { useEffect, useRef } from "react";

type Props = { who: string; onCancel: () => void; onConfirm: () => void };

export default function LogoutConfirm({ who, onCancel, onConfirm }: Props) {
  const stayRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    stayRef.current?.focus();
    const k = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onCancel]);

  return (
    <div className="confirm-bg" onClick={onCancel}>
      <div className="confirm" role="alertdialog" aria-modal="true" aria-labelledby="lo-title" onClick={(e) => e.stopPropagation()}>
        <div className="tag mono">SESSION CONTROL</div>
        <h2 id="lo-title">Abort session?</h2>
        <p>
          {who === "ADMIN"
            ? "Command console access will close and you will return to the access screen."
            : `${who} will be disconnected from the operation and returned to the access screen.`}
        </p>
        <div className="confirm-btns">
          <button ref={stayRef} type="button" className="cbtn cancel" onClick={onCancel}>Stay</button>
          <button type="button" className="cbtn go" onClick={onConfirm}>Log out</button>
        </div>
      </div>
    </div>
  );
}