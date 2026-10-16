import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, request } from "../../shared/api/client";
import { refreshSession } from "../auth/auth";
import {
  adminFields,
  config,
  defaults,
  formSchema,
  payload,
  resultSchema,
  type Entity,
  type Row,
} from "./model";
import { ReferenceSelect } from "./reference-select";

export function CadastroForm({
  entity,
  row,
  onClose,
  onSaved,
}: {
  entity: Entity;
  row?: Row;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState(() => defaults(entity, row));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const cache = useQueryClient();
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      request(`/${entity}${row ? `/${row.id}` : ""}`, resultSchema, {
        method: row ? "PATCH" : "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["cadastros"] });
      if (entity === "usuarios") await refreshSession();
      onSaved();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.fields.length)
        setErrors(
          Object.fromEntries(
            error.fields.map((field) => [field, error.message]),
          ),
        );
      setMessage(error instanceof Error ? error.message : "Falha ao salvar.");
    },
  });
  const fields = [
    ...config[entity].fields,
    ...(entity === "empresas" && !row ? adminFields : []),
  ];
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setMessage("");
    const data = payload(entity, values, row);
    // Limites são conferidos no conjunto final, mesmo quando apenas um extremo mudou.
    const merged = { ...row, ...data };
    const validation = formSchema(entity, !!row).safeParse(row ? merged : data);
    if (!validation.success) {
      const next = Object.fromEntries(
        validation.error.issues.map((i) => [i.path.join("."), i.message]),
      );
      setErrors(next);
      setMessage("Confira os campos destacados.");
      document.getElementById(`field-${Object.keys(next)[0]}`)?.focus();
      return;
    }
    if (!Object.keys(data).length) {
      setMessage("Nenhuma alteração para salvar.");
      return;
    }
    const parsed = formSchema(entity, !!row).safeParse(data);
    if (parsed.success) mutation.mutate(parsed.data);
  }
  return (
    <section className="surface editor" aria-labelledby="form-title">
      <h2 id="form-title" tabIndex={-1} ref={heading}>
        {row ? "Editar" : "Cadastrar"} {config[entity].singular}
        {row ? ` #${row.id}` : ""}
      </h2>
      {entity === "empresas" && !row && (
        <p>A empresa e seu primeiro administrador são criados juntos.</p>
      )}
      {entity === "usuarios" && row && (
        <p>
          Deixe a senha vazia para mantê-la. Alterar e-mail ou senha revoga as
          sessões desse usuário.
        </p>
      )}
      {entity === "ambientes" && (
        <p>
          Campos de faixa vazios significam limite não definido. Use até uma
          casa decimal.
        </p>
      )}
      <form noValidate onSubmit={submit} aria-busy={mutation.isPending}>
        <fieldset disabled={mutation.isPending}>
          <div className="form-grid">
            {fields.map((field) => (
              <div className="form-field" key={field.key}>
                <label htmlFor={`field-${field.key}`}>{field.label}</label>
                {field.reference ? (
                  <ReferenceSelect
                    entity={field.reference}
                    id={`field-${field.key}`}
                    value={values[field.key]}
                    onChange={(v) => setValues({ ...values, [field.key]: v })}
                    invalid={!!errors[field.key]}
                    describedBy={
                      errors[field.key] ? `error-${field.key}` : undefined
                    }
                  />
                ) : field.options ? (
                  <select
                    id={`field-${field.key}`}
                    value={String(values[field.key])}
                    onChange={(e) =>
                      setValues({ ...values, [field.key]: e.target.value })
                    }
                  >
                    {field.options.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={`field-${field.key}`}
                    type={field.type ?? "text"}
                    step={field.type === "number" ? "any" : undefined}
                    autoComplete={
                      field.type === "password" ? "new-password" : "off"
                    }
                    checked={
                      field.type === "checkbox"
                        ? !!values[field.key]
                        : undefined
                    }
                    value={
                      field.type === "checkbox"
                        ? undefined
                        : String(values[field.key] ?? "")
                    }
                    onChange={(e) =>
                      setValues({
                        ...values,
                        [field.key]:
                          field.type === "checkbox"
                            ? e.target.checked
                            : e.target.value,
                      })
                    }
                    aria-invalid={!!errors[field.key]}
                    aria-describedby={
                      errors[field.key] ? `error-${field.key}` : undefined
                    }
                  />
                )}
                {errors[field.key] && (
                  <p
                    className="field-error"
                    id={`error-${field.key}`}
                    role="alert"
                  >
                    {errors[field.key]}
                  </p>
                )}
              </div>
            ))}
          </div>
          {message && (
            <p role="alert" className="form-error">
              {message}
            </p>
          )}
          <div className="form-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={onClose}
            >
              Cancelar
            </button>
            <button className="primary-button" type="submit">
              {mutation.isPending ? "Salvando…" : "Salvar cadastro"}
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
