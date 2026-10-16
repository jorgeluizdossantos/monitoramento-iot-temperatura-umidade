import { useEffect, useRef } from "react";
export function Confirmation({
  title,
  description,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  pending: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="confirmation"
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!pending) onCancel();
      }}
    >
      <h2 id="confirm-title">{title}</h2>
      <p>{description}</p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button
          autoFocus
          disabled={pending}
          className="secondary-button"
          onClick={onCancel}
        >
          Cancelar
        </button>
        <button
          disabled={pending}
          className="primary-button"
          onClick={onConfirm}
        >
          {pending ? "Aguarde…" : "Confirmar"}
        </button>
      </div>
    </dialog>
  );
}
