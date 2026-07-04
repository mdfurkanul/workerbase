import { useState } from "react";
import { HardDrive } from "lucide-react";
import Toggle from "@/components/Toggle";
import { Card, Field, SaveBar } from "./primitives";

export function BackupsForm() {
  const [auto, setAuto] = useState(true);
  return (
    <div className="space-y-6">
      <Card title="Schedule">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[13px] text-ink">Automatic backups</div>
            <div className="text-[12px] text-ink-faint mt-0.5">Daily snapshot to R2.</div>
          </div>
          <Toggle checked={auto} onChange={setAuto} />
        </div>
        <Field label="Retention (days)">
          <input type="number" defaultValue={30} className="field-input font-mono" />
        </Field>
        <Field label="Cron expression">
          <input defaultValue="0 3 * * *" className="field-input font-mono" />
        </Field>
      </Card>
      <Card title="One-off snapshot">
        <button className="btn-ghost">
          <HardDrive size={13} /> Create snapshot now
        </button>
      </Card>
      <SaveBar />
    </div>
  );
}
