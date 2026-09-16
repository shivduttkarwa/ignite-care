import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import type { SchemaField, Signature } from "../../api/types";
import { normalise } from "../../lib/schema";
import { Icon } from "../Icons";
import { stamp } from "../../lib/format";

export type FieldContext = {
  setAnswer: (key: string, value: unknown) => void;
  observerName?: string;
  timerKey?: string;
  readOnly?: boolean;
};

type FieldProps = {
  field: SchemaField;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
};

const YES_NO = [
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
];

export function SchemaFieldControl({ context, ...props }: FieldProps & { context: FieldContext }) {
  switch (props.field.type) {
    case "yesno":
      return <YesNoField {...props} />;
    case "checks":
      return <ChecksField {...props} />;
    case "notice":
      return <NoticeField field={props.field} />;
    case "signature":
      return (
        <SignatureField
          {...props}
          observerName={context.observerName ?? ""}
          readOnly={context.readOnly ?? false}
        />
      );
    case "timer":
      return (
        <TimerField
          {...props}
          onWrite={context.setAnswer}
          storageKey={context.timerKey ?? `ignite:timer:${props.field.key}`}
        />
      );
    default:
      return <InputField {...props} />;
  }
}

function fieldClass(error?: string) {
  return `c-field${error ? " c-field--invalid" : ""}`;
}

function errorId(field: SchemaField, error?: string) {
  return error ? `${field.key}_error` : undefined;
}

function Required({ field }: { field: SchemaField }) {
  return field.required ? <span aria-hidden="true"> *</span> : null;
}

function Help({ field }: { field: SchemaField }) {
  return field.help ? <p className="c-field__help">{field.help}</p> : null;
}

function FieldError({ field, error }: { field: SchemaField; error?: string }) {
  if (!error) return null;
  return (
    <p className="c-field__error" id={`${field.key}_error`} role="alert">
      <Icon name="alert-circle" />
      {error}
    </p>
  );
}

function InputField({ field, value, error, onChange }: FieldProps) {
  const id = `f_${field.key}`;
  const inputType = field.type === "number" ? "number" : field.type === "time" ? "time" : "text";

  return (
    <div className={fieldClass(error)}>
      <label className={field.hide_label ? "u-visually-hidden" : "c-field__label"} htmlFor={id}>
        {field.label}
        <Required field={field} />
      </label>
      {field.type === "textarea" ? (
        <textarea
          className="c-textarea"
          id={id}
          rows={2}
          placeholder={field.placeholder}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId(field, error)}
        />
      ) : (
        <input
          className={`c-input${field.type === "time" ? " c-input--time" : ""}`}
          id={id}
          type={inputType}
          inputMode={field.type === "number" ? "numeric" : undefined}
          placeholder={field.placeholder}
          value={(value as string | number) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId(field, error)}
        />
      )}
      <Help field={field} />
      <FieldError field={field} error={error} />
    </div>
  );
}

function YesNoField({ field, value, error, onChange }: FieldProps) {
  return (
    <div className={fieldClass(error)}>
      <fieldset>
        <legend className="c-field__label">
          {field.label}
          <Required field={field} />
        </legend>
        <div className="c-yesno">
          {YES_NO.map((option) => (
            <div className="c-yesno__option" key={option.value}>
              <input
                className="c-yesno__input"
                type="radio"
                id={`${field.key}_${option.value}`}
                name={field.key}
                value={option.value}
                checked={normalise(value) === option.value}
                onChange={() => onChange(option.value)}
                aria-describedby={errorId(field, error)}
              />
              <label className="c-yesno__face" htmlFor={`${field.key}_${option.value}`}>
                <Icon name="check" />
                {option.label}
              </label>
            </div>
          ))}
        </div>
      </fieldset>
      <Help field={field} />
      <FieldError field={field} error={error} />
    </div>
  );
}

function ChecksField({ field, value, error, onChange }: FieldProps) {
  const chosen = Array.isArray(value) ? (value as string[]) : [];
  const toggle = (key: string) =>
    onChange(chosen.includes(key) ? chosen.filter((item) => item !== key) : [...chosen, key]);

  return (
    <div className={fieldClass(error)}>
      <fieldset>
        <legend className={field.hide_label ? "u-visually-hidden" : "c-field__label"}>
          {field.label}
        </legend>
        <Help field={field} />
        <div className="c-tiles">
          {(field.options ?? []).map((option) => {
            const id = `${field.key}_${option.key}`;
            return (
              <div className="c-tile" key={option.key}>
                <input
                  className="c-tile__input"
                  type="checkbox"
                  id={id}
                  checked={chosen.includes(option.key)}
                  onChange={() => toggle(option.key)}
                />
                <label className="c-tile__face" htmlFor={id}>
                  <span className="c-tile__box">
                    <Icon name="check" />
                  </span>
                  {option.label}
                </label>
              </div>
            );
          })}
        </div>
      </fieldset>
      <FieldError field={field} error={error} />
    </div>
  );
}

function NoticeField({ field }: { field: SchemaField }) {
  return (
    <div className={`c-callout c-callout--${field.tone ?? "caution"}`} role="alert">
      <Icon name="alert" />
      <span>{field.label}</span>
    </div>
  );
}

function two(value: number) {
  return String(value).padStart(2, "0");
}

function lengthText(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (!minutes) return `${rest} sec`;
  return rest ? `${minutes} min ${rest} sec` : `${minutes} min`;
}

function readTimer(key: string): number | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

function writeTimer(key: string, startedAt: number | null) {
  try {
    if (startedAt === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, String(startedAt));
  } catch {
    return;
  }
}

function TimerField({
  field,
  value,
  error,
  onChange,
  onWrite,
  storageKey,
}: FieldProps & { onWrite: (key: string, value: unknown) => void; storageKey: string }) {
  const [startedAt, setStartedAt] = useState<number | null>(() => readTimer(storageKey));
  const [now, setNow] = useState(() => Date.now());
  const id = `f_${field.key}`;

  useEffect(() => {
    if (startedAt === null) return;
    const tick = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(tick);
  }, [startedAt]);

  const start = () => {
    const moment = new Date();
    onChange(`${two(moment.getHours())}:${two(moment.getMinutes())}`);
    setStartedAt(moment.getTime());
    setNow(moment.getTime());
    writeTimer(storageKey, moment.getTime());
  };

  const stop = () => {
    if (startedAt === null) return;
    const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    if (field.writes) onWrite(field.writes, lengthText(seconds));
    setStartedAt(null);
    writeTimer(storageKey, null);
  };

  const elapsed = startedAt === null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000));

  return (
    <div className={fieldClass(error)}>
      <label className="c-field__label" htmlFor={id}>
        {field.label}
        <Required field={field} />
      </label>
      <div className="c-timer__start">
        <input
          className="c-input c-input--time"
          type="time"
          id={id}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId(field, error)}
        />
        <button
          type="button"
          className="c-btn c-btn--primary"
          onClick={start}
          disabled={startedAt !== null}
        >
          Start now
        </button>
      </div>
      {startedAt !== null && (
        <div className="c-timer">
          <div>
            <p className="c-timer__label">Duration</p>
            <p className="c-timer__value u-nums" role="timer">
              {two(Math.floor(elapsed / 60))}:{two(elapsed % 60)}
            </p>
          </div>
          <button type="button" className="c-btn c-btn--dark" onClick={stop}>
            Stop
          </button>
        </div>
      )}
      <Help field={field} />
      <FieldError field={field} error={error} />
    </div>
  );
}

function SignatureField({
  field,
  value,
  error,
  onChange,
  observerName,
  readOnly,
}: FieldProps & { observerName: string; readOnly: boolean }) {
  const signature = (value as Signature | null) ?? null;
  const [typing, setTyping] = useState(signature?.mode === "typed");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const signatureRef = useRef(signature);

  useEffect(() => {
    signatureRef.current = signature;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const saved = signatureRef.current;
    if (typing || !canvas) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.lineWidth = 2.2;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#1a1a1a";
    if (saved?.mode === "drawn") {
      const image = new Image();
      image.onload = () => context.drawImage(image, 0, 0, width, height);
      image.src = saved.data;
    }
  }, [typing]);

  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const begin = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const context = event.currentTarget.getContext("2d");
    if (readOnly || !context) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const { x, y } = point(event);
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + 0.01, y + 0.01);
    context.stroke();
  };

  const move = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const context = event.currentTarget.getContext("2d");
    if (!drawing.current || !context) return;
    const { x, y } = point(event);
    context.lineTo(x, y);
    context.stroke();
  };

  const end = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange({
      mode: "drawn",
      data: event.currentTarget.toDataURL("image/png"),
      signed_at: new Date().toISOString(),
    });
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) {
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.restore();
    }
    onChange(null);
  };

  const typeInstead = () => {
    setTyping(true);
    onChange(
      observerName
        ? { mode: "typed", name: observerName, signed_at: new Date().toISOString() }
        : null,
    );
  };

  const drawInstead = () => {
    setTyping(false);
    onChange(null);
  };

  return (
    <div className={fieldClass(error)}>
      <span className="c-field__label">
        {field.label}
        <Required field={field} />
      </span>

      {typing ? (
        <input
          className="c-input c-signature__typed"
          type="text"
          aria-label="Type your name to sign"
          value={signature?.mode === "typed" ? signature.name : ""}
          onChange={(e) =>
            onChange(
              e.target.value.trim()
                ? { mode: "typed", name: e.target.value, signed_at: new Date().toISOString() }
                : null,
            )
          }
          aria-describedby={errorId(field, error)}
        />
      ) : (
        <div className="c-signature">
          <canvas
            ref={canvasRef}
            className="c-signature__pad"
            role="img"
            aria-label="Signature pad. Draw your signature, or type your name instead."
            onPointerDown={begin}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
          />
          {!signature && (
            <span className="c-signature__hint" aria-hidden="true">
              Sign here
            </span>
          )}
        </div>
      )}

      <div className="c-signature__actions">
        {typing ? (
          <button type="button" className="c-link-action" onClick={drawInstead}>
            Draw instead
          </button>
        ) : (
          <>
            <button type="button" className="c-link-action" onClick={clear}>
              Clear
            </button>
            <button type="button" className="c-link-action" onClick={typeInstead}>
              Type name instead
            </button>
          </>
        )}
      </div>

      <FieldError field={field} error={error} />

      {field.timestamp_label && (
        <div className="c-field">
          <span className="c-field__label">{field.timestamp_label}</span>
          <p className="c-input c-input--readonly">
            {signature?.signed_at ? stamp(signature.signed_at) : "Added when you sign"}
          </p>
        </div>
      )}
    </div>
  );
}
