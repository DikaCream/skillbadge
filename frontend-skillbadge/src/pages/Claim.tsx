import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useSkillBadge } from "../context/SkillBadgeContext";
import { MAX_NOTE_CHARS, MAX_SKILL_CHARS, MIN_SKILL_CHARS } from "../config";
import {
  describeEvidenceUrl,
  describeOwnerProofUrl,
  parseRepoUrl,
  pinToCommit,
  shortUrl,
  type UrlInfo,
} from "../lib/evidence";
import ErrorBanner from "../components/ErrorBanner";

interface FieldErrors {
  proofUrl?: string;
  evidenceUrl?: string;
  skill?: string;
  note?: string;
}

interface PinState {
  url: string;
  sha: string;
}

export default function Claim() {
  const { wallet, contract } = useSkillBadge();
  const navigate = useNavigate();

  const [proofUrl, setProofUrl] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [skill, setSkill] = useState("");
  const [note, setNote] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [pinning, setPinning] = useState<"proof" | "evidence" | null>(null);
  const [proofPin, setProofPin] = useState<PinState | null>(null);
  const [evidencePin, setEvidencePin] = useState<PinState | null>(null);

  const evidenceInfo = useMemo(() => describeEvidenceUrl(evidenceUrl), [evidenceUrl]);
  const proofInfo: UrlInfo = useMemo(
    () => describeOwnerProofUrl(proofUrl, wallet.address, evidenceInfo),
    [proofUrl, wallet.address, evidenceInfo],
  );

  // Debounced branch -> commit-SHA pinning through the GitHub API. When the
  // URL already carries a full SHA, record the pin directly.
  const debounce = useRef<{ proof?: number; evidence?: number }>({});
  useEffect(() => {
    if (!proofInfo.submitUrl) {
      setProofPin(null);
      return;
    }
    if (!proofInfo.needsPin) {
      const parsed = parseRepoUrl(proofInfo.submitUrl);
      if (parsed && /^[0-9a-f]{40}$/i.test(parsed.ref)) {
        setProofPin({ url: proofInfo.submitUrl, sha: parsed.ref });
      } else {
        setProofPin(null);
      }
      return;
    }
    window.clearTimeout(debounce.current.proof);
    debounce.current.proof = window.setTimeout(async () => {
      setPinning("proof");
      try {
        const parsed = parseRepoUrl(proofInfo.submitUrl);
        if (!parsed) throw new Error("Not a valid raw GitHub URL.");
        const pin = await pinToCommit(parsed, proofInfo.submitUrl);
        setProofPin(pin);
      } catch {
        setProofPin(null);
      } finally {
        setPinning(null);
      }
    }, 600);
    return () => window.clearTimeout(debounce.current.proof);
  }, [proofInfo.needsPin, proofInfo.submitUrl]);

  useEffect(() => {
    if (!evidenceInfo.submitUrl) {
      setEvidencePin(null);
      return;
    }
    if (!evidenceInfo.needsPin) {
      const parsed = parseRepoUrl(evidenceInfo.submitUrl);
      if (parsed && /^[0-9a-f]{40}$/i.test(parsed.ref)) {
        setEvidencePin({ url: evidenceInfo.submitUrl, sha: parsed.ref });
      } else {
        setEvidencePin(null);
      }
      return;
    }
    window.clearTimeout(debounce.current.evidence);
    debounce.current.evidence = window.setTimeout(async () => {
      setPinning("evidence");
      try {
        const parsed = parseRepoUrl(evidenceInfo.submitUrl);
        if (!parsed) throw new Error("Not a valid GitHub URL.");
        const pin = await pinToCommit(parsed, evidenceInfo.submitUrl);
        setEvidencePin(pin);
      } catch {
        setEvidencePin(null);
      } finally {
        setPinning(null);
      }
    }, 600);
    return () => window.clearTimeout(debounce.current.evidence);
  }, [evidenceInfo.needsPin, evidenceInfo.submitUrl]);

  const proofSubmitUrl = proofPin?.url ?? proofInfo.submitUrl;
  const evidenceSubmitUrl = evidencePin?.url ?? evidenceInfo.submitUrl;

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {};
    if (!wallet.address) {
      errors.proofUrl = "Connect your wallet first — the owner-proof file is named after your address.";
      return errors;
    }
    if (proofInfo.kind === "empty") {
      errors.proofUrl = "Paste the raw link of your skillbadge-verify file.";
    } else if (proofInfo.warn || proofInfo.needsPin || !proofPin) {
      errors.proofUrl = "Fix the issues shown below the field, then wait for the commit pin.";
    }
    if (evidenceInfo.kind === "empty") {
      errors.evidenceUrl = "Paste the raw link of the code file to judge.";
    } else if (evidenceInfo.kind !== "pinned-raw" || evidenceInfo.needsPin || !evidencePin) {
      errors.evidenceUrl = "Fix the issues shown below the field, then wait for the commit pin.";
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
      setSubmitError({ message: "Connect your wallet first." });
      return;
    }
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setBusy(true);
    try {
      const txHash = await contract.claimSkill(
        proofSubmitUrl,
        evidenceSubmitUrl,
        skill.trim(),
        note.trim(),
      );
      await contract.waitForReceipt(txHash);
      navigate("/badges");
    } catch (err) {
      setSubmitError(err);
      setBusy(false);
    }
  }

  const pinningLabel = pinning === "proof" ? "Pinning proof to a commit…" : pinning === "evidence" ? "Pinning evidence to a commit…" : "";

  return (
    <div className="page container page narrow">
      <div className="page-head">
        <h1>Claim a skill</h1>
        <p className="muted">
          Two raw files pinned to one commit prove the claim: a file that ties
          the repo to your wallet, and the code to judge. Free: StudioNet is
          gasless.
        </p>
      </div>

      {submitError != null && <ErrorBanner error={submitError} />}
      {!wallet.address && (
        <div className="notice">
          Connect your wallet to file a claim. The owner-proof file is named
          after your wallet address, so the network can verify the repo is
          yours.
        </div>
      )}

      <div className="notice how-to">
        <strong>Before you claim, in the repo that proves the skill:</strong>
        <ol>
          <li>
            Create a file{" "}
            <code className="mono">
              skillbadge-verify/{wallet.address ? wallet.address.toLowerCase() : "0x<your-address>"}.txt
            </code>
          </li>
          <li>Put your wallet address inside the file and commit it.</li>
          <li>
            Open the file on GitHub → <em>Raw</em> → copy that URL. Same for
            the code file that shows the skill.
          </li>
        </ol>
        <p className="muted">
          Branch links work too: the form pins them to the current commit
          automatically, so evidence can't change after the claim.
        </p>
      </div>

      <form className="form panel" onSubmit={onSubmit} noValidate>
        <label>
          Owner-proof file (proves the repo is yours)
          <input
            type="url"
            value={proofUrl}
            onChange={(e) => setProofUrl(e.target.value)}
            aria-invalid={!!fieldErrors.proofUrl || undefined}
            placeholder="https://raw.githubusercontent.com/you/repo/<sha>/skillbadge-verify/0x…txt"
          />
          {fieldErrors.proofUrl && (
            <span className="field-error">{fieldErrors.proofUrl}</span>
          )}
        </label>

        {proofInfo.kind !== "empty" && (
          <div
            className={`evidence-note ${proofInfo.warn ? "warn" : "ok"}`}
            role="status"
          >
            <div className="evidence-kind">
              {proofInfo.warn ? "⚠" : "✓"} {proofInfo.note}
            </div>
            {proofPin && (
              <div className="evidence-preview mono">
                Pinned to commit {proofPin.sha.slice(0, 7)} ·{" "}
                {shortUrl(proofPin.url)}
              </div>
            )}
            {pinning === "proof" && (
              <div className="evidence-preview muted">{pinningLabel}</div>
            )}
          </div>
        )}

        <label>
          Evidence file (the code to judge)
          <input
            type="url"
            value={evidenceUrl}
            onChange={(e) => setEvidenceUrl(e.target.value)}
            aria-invalid={!!fieldErrors.evidenceUrl || undefined}
            placeholder="https://raw.githubusercontent.com/you/repo/<sha>/src/index.ts"
          />
          {fieldErrors.evidenceUrl && (
            <span className="field-error">{fieldErrors.evidenceUrl}</span>
          )}
        </label>

        {evidenceInfo.kind !== "empty" && (
          <div
            className={`evidence-note ${evidenceInfo.warn ? "warn" : "ok"}`}
            role="status"
          >
            <div className="evidence-kind">
              {evidenceInfo.warn ? "⚠" : "✓"} {evidenceInfo.note}
            </div>
            {evidencePin && (
              <div className="evidence-preview mono">
                Pinned to commit {evidencePin.sha.slice(0, 7)} ·{" "}
                {shortUrl(evidencePin.url)}
              </div>
            )}
            {pinning === "evidence" && (
              <div className="evidence-preview muted">{pinningLabel}</div>
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

        <button className="primary" type="submit" disabled={busy || !wallet.address || pinning !== null}>
          {busy ? "Submitting…" : "Claim skill"}
        </button>
      </form>
    </div>
  );
}