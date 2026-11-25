import { registrationService } from '@domik/core';
import { handle, TRUSTEE, uploadedFile } from '@/server/api';
import { serviceContext } from '@/server/services';

const MAX_STATEMENT_BYTES = 5 * 1024 * 1024;

/**
 * Upload a bank statement (camt.053 XML or CSV) and get proposed deposit matches back.
 * Nothing is stored or marked paid here — see /api/bank-statements/confirmations.
 */
export function POST(request: Request): Promise<Response> {
  return handle(request, TRUSTEE, async (actor) => {
    const { bytes } = await uploadedFile(request, MAX_STATEMENT_BYTES);
    const text = new TextDecoder('utf-8').decode(bytes);
    const p = await registrationService.proposeDepositMatches(serviceContext(), actor, text);
    const tx = (t: (typeof p.unmatched)[number]) => ({
      ...t,
      amountCents: t.amountCents.toString(),
    });
    return {
      transactionCount: p.transactionCount,
      matches: p.matches.map((m) => ({
        ...m,
        depositCents: m.depositCents.toString(),
        transaction: tx(m.transaction),
      })),
      unmatched: p.unmatched.map(tx),
    };
  });
}
