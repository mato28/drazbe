import { type SignatureCheckDto } from '@domik/shared';
import { Badge } from '@/components/ui/badge';

const QUALIFICATION: Record<string, string> = {
  QESig: 'kvalificiran e-podpis (QES)',
  QESeal: 'kvalificiran e-žig',
  AdESig_QC: 'napreden e-podpis s kvalificiranim potrdilom',
  AdESig: 'napreden e-podpis',
  NA: 'ni ugotovljeno',
};

/** Result of the EU DSS check of an uploaded signed contract. */
export function SignatureCheckView({ check }: { check: SignatureCheckDto }) {
  return (
    <div className="grid gap-1.5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={check.ok ? 'success' : 'destructive'}>
          {check.ok ? 'Podpisi so veljavni' : 'Podpisi niso ustrezni'}
        </Badge>
        {!check.requireQualified && (
          <Badge variant="warning">razvojni način – sprejeti tudi testni podpisi</Badge>
        )}
      </div>
      <ul className="grid gap-1 text-muted-foreground">
        {check.signatures.map((s, i) => (
          <li key={i}>
            <span className="font-medium text-foreground">{s.signedBy ?? 'neznan podpisnik'}</span>
            {' · '}
            {QUALIFICATION[s.qualification ?? 'NA'] ?? s.qualification}
            {' · '}
            {s.indication}
            {s.subIndication ? ` (${s.subIndication})` : ''}
            {s.matches ? ` · ustreza: ${s.matches}` : ''}
          </li>
        ))}
      </ul>
      {check.problems.length > 0 && (
        <ul className="list-disc pl-5 text-destructive">
          {check.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
