/**
 * Template of the sale contract (prodajna pogodba) for real estate sold at an online public
 * auction in bankruptcy (ZFPPIPP). `{{name}}` placeholders are filled by
 * `src/post-auction/contract.ts`; filling fails if any placeholder is unknown or left empty,
 * so a contract can never be produced with a gap in it.
 *
 * LEGAL-REVIEW: the whole text must be reviewed by a lawyer before production use — see
 * docs/legal-review.md. Bump `version` on every change (it is printed on the contract).
 */
export interface ContractTemplateSection {
  heading: string;
  rows?: [string, string][];
  paragraphs?: string[];
}

export interface ContractTemplate {
  version: string;
  title: string;
  subtitle: string;
  sections: ContractTemplateSection[];
  signature: { left: string; right: string };
  footer: string;
}

// LEGAL-REVIEW: sale contract text — see docs/legal-review.md
export const SALE_CONTRACT_TEMPLATE: ContractTemplate = {
  version: '2026-11-1',
  title: 'PRODAJNA POGODBA',
  subtitle: 'št. {{contractNumber}} – prodaja na javni dražbi v stečajnem postopku',
  sections: [
    {
      heading: 'Pogodbeni stranki',
      rows: [
        ['Prodajalec', '{{debtorName}}, {{debtorAddress}}, davčna št. {{debtorTaxId}}'],
        ['ki ga zastopa', 'stečajni upravitelj {{trusteeName}}'],
        ['in kupec', '{{buyerName}}, {{buyerAddress}}, davčna št. {{buyerTaxId}}'],
      ],
    },
    {
      heading: '1. člen – Uvodne ugotovitve',
      paragraphs: [
        'Pogodbeni stranki ugotavljata, da je nad prodajalcem pri sodišču {{court}} pod opravilno številko {{caseNumber}} v teku stečajni postopek.',
        'Sodišče je soglasje k prodaji izdalo s sklepom {{courtApproval}}. Prodaja je bila izvedena na elektronski javni dražbi št. {{auctionNumber}}, ki je bila zaključena {{auctionClosedAt}}. Kupec je na dražbi ponudil najvišjo ceno (oznaka na dražbi: {{buyerPseudonym}}). Potek dražbe je razviden iz zapisnika o dražbi (SHA-256: {{reportHash}}).',
      ],
    },
    {
      heading: '2. člen – Predmet prodaje',
      rows: [
        ['Nepremičnina', '{{lotTitle}}'],
        ['Naslov', '{{lotAddress}}'],
        ['ID znak', '{{lotIdZnak}}'],
        ['Katastrska občina / parcela', '{{lotCadastre}}'],
        ['Površina', '{{lotArea}}'],
        ['Vknjižena bremena', '{{lotEncumbrances}}'],
      ],
      paragraphs: [
        'Prodajalec prodaja kupcu zgoraj opisano nepremičnino, kupec pa jo kupuje po načelu »videno – kupljeno«. Prodajalec ne odgovarja za stvarne in pravne napake nepremičnine.',
        'S pravnomočnostjo sklepa o izročitvi prenehajo vse zastavne pravice in druga bremena, ki po zakonu prenehajo s prodajo v stečajnem postopku.',
      ],
    },
    {
      heading: '3. člen – Kupnina in plačilo',
      rows: [
        ['Kupnina', '{{price}}'],
        ['Vplačana varščina (všteje se v kupnino)', '{{deposit}}'],
        ['Ara – doplačilo', '{{downPaymentDue}}, v {{downPaymentDays}} dneh po sklenitvi pogodbe'],
        ['Preostanek kupnine', '{{remainder}}, v {{priceDays}} dneh po sklenitvi pogodbe'],
        ['Račun stečajne mase', '{{estateIban}}, {{estateBank}}'],
        ['Sklic', '{{paymentReference}}'],
      ],
      paragraphs: [
        'Plačilo celotne kupnine v roku je bistvena sestavina te pogodbe. Kupnina se plača izključno na račun stečajne mase prodajalca.',
      ],
    },
    {
      heading: '4. člen – Neizpolnitev',
      paragraphs: [
        'Če kupec ne plača are ali kupnine v rokih iz 3. člena, se šteje, da je pogodba razvezana po samem zakonu. V tem primeru vplačana varščina in ara zapadeta v korist stečajne mase, kupec pa nima pravice do vračila.',
      ],
    },
    {
      heading: '5. člen – Izročitev in prenos lastninske pravice',
      paragraphs: [
        'Po plačilu celotne kupnine bo stečajni upravitelj sodišču predlagal izdajo sklepa o izročitvi. Na podlagi pravnomočnega sklepa o izročitvi se kupec vknjiži kot lastnik nepremičnine v zemljiški knjigi.',
        'Davek na promet nepremičnin, stroške overitve, vknjižbe in vse druge stroške v zvezi s prenosom plača kupec.',
      ],
    },
    {
      heading: '6. člen – Izjava kupca',
      paragraphs: [
        'Kupec izjavlja, da ni oseba, ki po zakonu ne sme biti kupec v stečajnem postopku (povezane osebe s stečajnim dolžnikom, stečajni upravitelj, stečajni sodnik in z njimi povezane osebe). Izjava je bila podana ob prijavi na dražbo.',
      ],
    },
    {
      heading: '7. člen – Končne določbe',
      paragraphs: [
        'Pogodba je sklenjena, ko jo podpišeta obe pogodbeni stranki. Pogodbeni stranki jo podpišeta s kvalificiranim elektronskim podpisom ali lastnoročno; elektronsko podpisana pogodba ima enako veljavo kot lastnoročno podpisana.',
        'Za spore iz te pogodbe je pristojno sodišče, ki vodi stečajni postopek.',
      ],
    },
  ],
  signature: {
    left: 'Prodajalec: {{debtorName}}, zanj stečajni upravitelj {{trusteeName}}',
    right: 'Kupec: {{buyerName}}',
  },
  footer:
    'Pogodbo je pripravila platforma Domik {{generatedAt}} po predlogi različice {{templateVersion}}.',
};
