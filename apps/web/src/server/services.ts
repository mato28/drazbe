import 'server-only';
import {
  ManualIdentityProvider,
  type ObjectStorage,
  type ServiceContext,
  systemClock,
  type VatRegistry,
  ViesVatRegistry,
} from '@domik/core';
import { createUnitOfWork } from '@domik/db';
import { DssSignatureValidator } from '@domik/dss';
import { renderDocumentPdf } from '@domik/pdf';
import { createS3Storage } from '@domik/storage';
import { serverConfig } from './config';
import { dbHandle } from './db';

const globalForStorage = globalThis as unknown as { __domikStorage?: ObjectStorage };

function storage(): ObjectStorage {
  if (!globalForStorage.__domikStorage) {
    const c = serverConfig();
    globalForStorage.__domikStorage = createS3Storage({
      endpoint: c.S3_ENDPOINT,
      region: c.S3_REGION,
      bucket: c.S3_BUCKET,
      accessKeyId: c.S3_ACCESS_KEY_ID,
      secretAccessKey: c.S3_SECRET_ACCESS_KEY,
      forcePathStyle: c.S3_FORCE_PATH_STYLE,
    });
  }
  return globalForStorage.__domikStorage;
}

const vatRegistry: VatRegistry = new ViesVatRegistry();

/** Dependencies handed to every core service call. */
export function serviceContext(): ServiceContext {
  return {
    uow: createUnitOfWork(dbHandle().db),
    clock: systemClock,
    storage: storage(),
    // MVP: identities are verified manually by the trustee. Swap here for SI-PASS etc.
    identity: new ManualIdentityProvider(),
    appUrl: serverConfig().APP_URL.replace(/\/$/, ''),
    pdf: { render: renderDocumentPdf },
    signatures: new DssSignatureValidator(serverConfig().DSS_URL),
    signaturePolicy: { requireQualified: serverConfig().SIGNATURE_REQUIRE_QUALIFIED },
    vat: vatRegistry,
  };
}
