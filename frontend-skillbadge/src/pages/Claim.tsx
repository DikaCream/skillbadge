import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useSkillBadge } from "../context/SkillBadgeContext";
import { MAX_NOTE_CHARS, MAX_SKILL_CHARS, MIN_SKILL_CHARS } from "../config";
import { describeEvidenceUrl, shortUrl } from "../lib/evidence";

interface FieldErrors {
  url?: string;
  skill?: string;
  note?: string;
}

export default function Claim() {
  const { wallet, contract } = useSkillBadge();
  const navigate = useNavigate();

  const [url, setUrl] = useState("");
  const [skill, setSkill] = useState("");
  const [note, setNote] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Live description of what the validators will fetch for the typed URL.
  const evidence = useMemo(() => describeEvidenceUrl(url), [url]);

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {};
    const u = evidence.submitUrl;
    if (evidence.kind === "empty") {
      errors.url = "Enter a public https:// URL.";
    } else if (!/^https:\/\/[^\s]+$/i.test(u)) {
      errors.url = "Enter a public https:// URL.";
    }
    const s = skill.trim();
    if (s.length < MIN_SKILL_CHARS || s.length > MAX_SKILL_CHARS) {
      errors.skill = `Skill must be ${MIN_SKILL_CHARS}-${MAX_SKILL_CHARS} characters.`;
    } else if (!/^[a-zA-Z0-9 ._+-]+$/.test(s)) {
      errors.skill = "Letters, digits, spaces and . _ + - only.";
    }
    if (note.length > MAX_NOTE_CHARS) {
      errors.note = `Note must be ${MAX_NOTE_CHARS} characters or less.`;
    }
    return errors;
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!wallet.address) {
      setSubmitError("Connect your wallet first.");
      return;
    }
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setBusy(true);
    try {
      const txHash = await contract.claimSkill(
        evidence.submitUrl,
        skill.trim(),
        note.trim(),
      );
      await contract.waitForReceipt(txHash);
      navigate("/badges");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to claim skill.");
      setBusy(false);
    }
  }

  return (
    <div className="page container page narrow">
      <div className="page-head">
        <h1>Claim a skill</h1>
        <p className="muted">
          Give the validators a public URL and the skill you want judged. It's
          free: StudioNet is gasless and the claim itself costs nothing.
        </p>
      </div>

      {submitError && <div className="error-banner">{submitError}</div>}
      {!wallet.address && (
        <div className="notice">
          Connect your wallet to file a claim. Anyone can trigger the
          validators' review afterwards.
        </div>
      )}

      <form className="form panel" onSubmit={onSubmit} noValidate>
        <label>
          Public https:// URL (repo, file, or docs page)
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            aria-invalid={!!fieldErrors.url || undefined}
            placeholder="https://github.com/yourname/yourproject"
          />
          {fieldErrors.url && (
            <span className="field-error">{fieldErrors.url}</span>
          )}
        </label>

        {evidence.kind !== "empty" && (
          <div
            className={`evidence-note ${evidence.warn ? "warn" : "ok"}`}
            role="status"
          >
            <div className="evidence-kind">
              {evidence.warn ? "⚠" : "✓"} {evidence.note}
            </div>
            {evidence.submitUrl &&
              evidence.submitUrl !== url.trim() && (
                <div className="evidence-preview mono">
                  Will be submitted: {shortUrl(evidence.submitUrl)}
                </div>
              )}
          </div>
        )}

        <label>
          What skill does the code show?
          <input
            type="text"
            value={skill}
            onChange={(e) => setSkill(e.target.value)}
            aria-invalid={!!fieldErrors.skill || undefined}
            placeholder="e.g. solidity"
          />
          {fieldErrors.skill && (
            <span className="field-error">{fieldErrors.skill}</span>
          )}
        </label>

        <label>
          Note to the validators (optional)
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-invalid={!!fieldErrors.note || undefined}
            placeholder="Point out tests, audits, or projects that show the work"
          />
          <span className={`char-count ${note.length <= MAX_NOTE_CHARS ? "ok" : ""}`}>
            {note.length} / {MAX_NOTE_CHARS}
          </span>
          {fieldErrors.note && (
            <span className="field-error">{fieldErrors.note}</span>
          )}
        </label>

        <button className="primary" type="submit" disabled={busy || !wallet.address}>
          {busy ? "Submitting…" : "Claim skill"}
        </button>
      </form>
    </div>
  );
}