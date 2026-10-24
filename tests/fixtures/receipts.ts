// Fictional receipts as the phone reads them (step 5, 2026-10-24): the text OCR gives, slips and all ("0at milk"),
// with what a person would take from each. Money in minor units (pence, cents), so sums are exact. RECEIPTS tune the
// rules; RECEIPTS_UNSEEN were written at the same time and never used to change them.

export interface ExpectedReceipt {
  id: string
  text: string
  /** null: not a receipt (a note, a page). */
  expect: {
    shop: string
    date: string | null
    items: readonly (readonly [name: string, price: number])[]
    total: number
  } | null
}

export const RECEIPTS: readonly ExpectedReceipt[] = [
  {
    // The real model's reading of tests/fixtures/photos/receipt-clean.png (v0.16 e2e).
    id: 'greenleaf',
    text: 'GREENLEAF MARKET\n12 0ct 2026 14:32\n0at milk 1.45\nSourdough loaf 3.20\nBananas 0.95\n0live oil 6.50\nEggs x6 2.10\nTOTAL 14.20\nCARD 14.20\nThank you for shopping',
    expect: {
      shop: 'Greenleaf Market',
      date: '2026-10-12',
      items: [['Oat milk', 145], ['Sourdough loaf', 320], ['Bananas', 95], ['Olive oil', 650], ['Eggs x6', 210]],
      total: 1420,
    },
  },
  {
    id: 'pharmacy',
    text: 'CORNER PHARMACY\n19 Oct 2026 09:05\nIbuprofen 200mg 3.49\nPlasters 2.25\nSun cream SPF50 8.99\nSubtotal 14.73\nTOTAL 14.73\nPaid contactless',
    expect: { shop: 'Corner Pharmacy', date: '2026-10-19', items: [['Ibuprofen 200mg', 349], ['Plasters', 225], ['Sun cream SPF50', 899]], total: 1473 },
  },
  {
    id: 'supermarket-vat',
    text: 'TESCO EXPRESS\nHigh Street\nVAT No 220 4302 31\nSEMI SKIMMED MILK 2PT £1.65 A\nFREE RANGE EGGS 6PK £2.35 A\nBANANAS LOOSE £0.86 A\nCHEDDAR MATURE 400G £3.75 A\nBIN BAGS 20PK £2.10 B\n5 BALANCE DUE £10.71\nVISA CONTACTLESS £10.71\n14/10/26 18:42',
    expect: {
      shop: 'Tesco Express',
      date: '2026-10-14',
      items: [['Semi skimmed milk 2pt', 165], ['Free range eggs 6pk', 235], ['Bananas loose', 86], ['Cheddar mature 400g', 375], ['Bin bags 20pk', 210]],
      total: 1071,
    },
  },
  {
    id: 'quantities-discount',
    text: 'LIDL\n03.10.2026\nTomatoes 1.19\n2 x 0.89\nPasta Fusilli 1.78\nChicken breast 4.50\nPromo saving -0.50\nApples 2.00\nTOTAL 8.97\nCash 10.00\nChange 1.03',
    expect: { shop: 'Lidl', date: '2026-10-03', items: [['Tomatoes', 119], ['Pasta Fusilli', 178], ['Chicken breast', 450], ['Promo saving', -50], ['Apples', 200]], total: 897 },
  },
  {
    id: 'us-tax',
    text: "TRADER JOE'S\n10/17/2026 12:03 PM\nAVOCADOS 4CT $4.99\nGREEK YOGURT $5.49\nSOURDOUGH BREAD $3.99\nSUBTOTAL $14.47\nTAX $0.00\nTOTAL $14.47\nDEBIT $14.47",
    expect: { shop: "Trader Joe's", date: '2026-10-17', items: [['Avocados 4ct', 499], ['Greek yogurt', 549], ['Sourdough bread', 399]], total: 1447 },
  },
  {
    id: 'euro-comma',
    text: 'BOULANGERIE DU COIN\n21/10/2026\nBaguette 1,20 €\nCroissant x2 2,60 €\nTarte aux pommes 3,50 €\nTotal 7,30 €\nCB 7,30 €',
    expect: { shop: 'Boulangerie du Coin', date: '2026-10-21', items: [['Baguette', 120], ['Croissant x2', 260], ['Tarte aux pommes', 350]], total: 730 },
  },
  {
    id: 'cafe',
    text: 'THE DAILY GRIND CAFE\n21 Oct 2026 08:12\nFlat white 3.10\nAlmond croissant 2.80\nTOTAL 5.90\nVISA ending 4417',
    expect: { shop: 'The Daily Grind Cafe', date: '2026-10-21', items: [['Flat white', 310], ['Almond croissant', 280]], total: 590 },
  },
  {
    // The real model's reading of tests/fixtures/photos/receipt-tilted.png: the tilt merged two rows into one line.
    id: 'merged-rows',
    text: 'CORNER PHARMACY\n19 Oct 2026 09:05\nIbuprofen 200mg 3.49 Plasters 2.25\nSun cream SPF50 8.99\nSubtotal 14.73\nTOTAL 14.73\nPaid contactless',
    expect: { shop: 'Corner Pharmacy', date: '2026-10-19', items: [['Ibuprofen 200mg', 349], ['Plasters', 225], ['Sun cream SPF50', 899]], total: 1473 },
  },
  {
    // After the total: payment, savings and points, never items.
    id: 'after-total',
    text: 'CO-OP FOOD\n20/10/2026\nCarrots 0.65\nHummus 1.50\nTOTAL 2.15\nYou saved 0.40\nMember reward 0.10\nPoints balance 12.50',
    expect: { shop: 'Co-op Food', date: '2026-10-20', items: [['Carrots', 65], ['Hummus', 150]], total: 215 },
  },
  {
    id: 'note',
    text: 'Call the plumber on Thursday\nPay the parking fine\nBook the dentist for Sam\nBuy birthday card for Mum',
    expect: null,
  },
  {
    id: 'page',
    text: 'The first rule is that you must not fool yourself, and you are the easiest person to fool. So you have to be very careful about that.',
    expect: null,
  },
]

export const RECEIPTS_UNSEEN: readonly ExpectedReceipt[] = [
  {
    id: 'sainsburys',
    text: "SAINSBURY'S\nLOCAL\nBROCCOLI 0.75\nWHOLEMEAL BREAD 1.40\nORANGE JUICE 1L 2.20\nWASHING UP LIQUID 1.25\nNECTAR SAVING -0.40\nTOTAL 5.20\nMASTERCARD 5.20\n22/10/2026 19:14",
    expect: {
      shop: "Sainsbury's Local",
      date: '2026-10-22',
      items: [['Broccoli', 75], ['Wholemeal bread', 140], ['Orange juice 1l', 220], ['Washing up liquid', 125], ['Nectar saving', -40]],
      total: 520,
    },
  },
  {
    id: 'aldi-qty',
    text: 'ALDI\n2026-10-09\nMilk 1.15\nRice 1kg 1.39\n3 x 0.45\nLemons 1.35\nTOTAL GBP 3.89\nCARD 3.89',
    expect: { shop: 'Aldi', date: '2026-10-09', items: [['Milk', 115], ['Rice 1kg', 139], ['Lemons', 135]], total: 389 },
  },
  {
    id: 'deli',
    text: 'Mario Deli\n15 Oct 2026\nParma ham 100g £4.20\nMozzarella £2.10\nOlives £3.00\nTotal £9.30\nThank you, ciao!',
    expect: { shop: 'Mario Deli', date: '2026-10-15', items: [['Parma ham 100g', 420], ['Mozzarella', 210], ['Olives', 300]], total: 930 },
  },
  {
    id: 'fuel',
    text: 'BP CONNECT\n18/10/2026 07:51\nUNLEADED 32.41L £48.29\nTOTAL £48.29\nVISA £48.29',
    expect: { shop: 'Bp Connect', date: '2026-10-18', items: [['Unleaded 32.41l', 4829]], total: 4829 },
  },
  {
    id: 'shopping-list',
    text: 'Shopping list\noat milk\nrice\nchickpeas\nspinach\nbin bags',
    expect: null,
  },
]
