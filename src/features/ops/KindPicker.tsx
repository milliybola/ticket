/* Multi-select of activity kinds (all six kinds of events the platform sells). */
import { Check } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { kindName } from '../../domain/rules';
import type { EventKind } from '../../domain/types';
import { cn } from '../../components/ui';
import { ORG_KINDS } from './common';

export function KindPicker({ value, onChange, invalid, disabled }: { value: EventKind[]; onChange: (v: EventKind[]) => void; invalid?: boolean; disabled?: boolean }) {
  useI18n();
  return (
    <div className="flex flex-wrap gap-2" role="group">
      {ORG_KINDS.map((k) => {
        const on = value.includes(k);
        return (
          <button
            key={k}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== k) : [...value, k])}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[15px] font-medium transition-colors disabled:opacity-60',
              on ? 'border-ink bg-ink text-white' : invalid ? 'border-bad bg-white text-ink' : 'border-line-2 bg-white text-ink hover:border-ink',
            )}
          >
            {on && <Check className="size-4" />}
            {kindName(k)}
          </button>
        );
      })}
    </div>
  );
}
