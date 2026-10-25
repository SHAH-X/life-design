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
    // The layout of a real receipt the owner tried (v0.17), with made-up items, prices, address and card: product
    // codes before names, department codes ("T21"), VAT marks after prices (R read as F, * read as x), £ read as E, a
    // "2 @ price total" line under its name (@ read as 园), three rows read as one, "Items:11 Balance to Pay", a gift
    // card and its new balance after the total, and a refund deadline as the only date.
    id: 'codes-and-marks',
    text:
      'M&S\nRiverside Retail Park\nAnytown\nAB12CD\n0100 000 0000\nVAT NO.GB000000000\nwww.example.con\n' +
      '11110000 SEMI SKIM MILK £1.15F 11110000 SEMI SKIM MILK £1.15R 22220000 BANANAS £0.95R\n' +
      '22220000 BANANAS £0.95R\n33330000 PORRIDGE OATS E1.60\n44440000 Seeded Loaf\n2园 £1.40 £2.80x\n' +
      '55550000 Choc Muffin £1.75x\n66660000 BAGEL £0.90*\n77770000 T21 Hand Soap £3.50\n88880000 T34 WOOL SOCKS £8.00\n' +
      'Items:11 Balance to Pay £22.75\nGift Card *xx x*×x xx*x *x*x 0000 £22.75\nNew Balance £O.00\n' +
      'xx Thanks for shopping wi th Sparks! xx\nf our M&s refund policy applles last date for a refund/exohange 1e\n16/08/2026\n' +
      'Refunds may stili be given in accordance',
    expect: {
      shop: 'M&S',
      date: null,
      items: [
        ['Semi skim milk', 115],
        ['Semi skim milk', 115],
        ['Bananas', 95],
        ['Bananas', 95],
        ['Porridge oats', 160],
        ['Seeded Loaf', 280],
        ['Choc Muffin', 175],
        ['Bagel', 90],
        ['Hand Soap', 350],
        ['Wool socks', 800],
      ],
      total: 2275,
    },
  },
  {
    // The layout of a real M&S food receipt the owner tried (v0.19.2), with made-up items, prices, address and card,
    // as the real model read it: faint print from the back of the paper first, "<" after each price, and a Sparks
    // saving under "Balance before Saving" whose minus the photo lost.
    id: 'ms-food-sparks',
    text:
      '7X8AQ2\nnr9s3 yenom dosd ot\nbns ero7ot M&S oy 19voseic Jellew Market Square\nAnytown\nAB1 2CD\n0100 000 0000\nVAT NO.GB000000000\nwww.marksandspencer.com\n' +
      '00111111 SALTED PRETZELS £1.50<\n00222222 GRK YOG 4PK £2.25<\nG\nBalance before Saving £3.75\n*×£2 off with Sparks×*x £2.00\nItems:2 Balance to Pay £1.75\n' +
      'Card Tendered £1.75\n**×PAYMENT APPROVED×**\nDEBIT MASTERCARD\nCARD:000000XXXXXX0000 AUTH:000000\nYour total saving today is £2.00\n*x Thanks for shopping with Sparks! **\n' +
      'Please retain for your records\n24/10/26 11:20 00000000 000000 000 0000',
    expect: { shop: 'M&S', date: '2026-10-24', items: [['Salted pretzels', 150], ['Grk yog 4pk', 225], ['£2 off with Sparks', -200]], total: 175 },
  },
  {
    // The layout of a real Asda receipt (v0.19.2), made up as above: a prize draw's banner first, rows a tilted photo
    // read price first, a gift card after the total, and no date in the photo (only a gift card's expiry).
    id: 'asda-price-first',
    text:
      'xx×For a chance to win £1,000!xx*\nPlease tell us how we did today at\nwww.tellasda.com\nASDA STORES LTD\nWWW.ASDA.COM\nMANAGER A N OTHER\nASDA.COM/STOREHELP\nAnytown\n' +
      '0000 ScoUser TÉ. 00 TR. 0000 ST. OP.\n£1.10 BAGELS\nSPAGHETTI500G £0.75\n£3.00 Light Bulbs\n£2.40 BUTTER\nTOTAL: £7.25\nNO. ITEMS SOLD 4\nGift Card £7.25\n' +
      'TAX SUMMARY\nRATE NET VAT\n0.00% 4.25 0.00\n20.00% 2.50 0.50\nTAX TOTAL: 0.50\nAsda Gift Card Redemption\n0000000000000000\nExp. Date 01/3025\n£7.25\n' +
      'Balance e 0.00\nCod. Auth. 000000\nTC# 0000000000000000000000',
    expect: { shop: 'Asda', date: null, items: [['Bagels', 110], ['Spaghetti500g', 75], ['Light Bulbs', 300], ['Butter', 240]], total: 725 },
  },
  {
    // The layout of a real M&S clothes receipt (v0.19.2), made up as above: a refund's last day, an order date
    // ("20-0ct-2026"), a collection day with faint print from the back read onto its line ("ne.auj9,28M"), "<" marks,
    // and a saving under "Balance before Saving" whose minus the photo lost.
    id: 'ms-order-collection',
    text:
      'ot n652\nbsolnwob\nqqs 28N M8&S\nMarket Square\nAnytown\nAB1 2CD\n(0100 000 0000\nVAT NO. GB000000000\nwww.marksandspencer.com\nSTORE PURCHASE SUMMARY\n' +
      '11223344 T12 Wool Scarf £15.00<\nIf our M&s refund policy applies\nthe last date for a refund/exchange is\n10/01/2027\nRefunds may still be given in accordance\n' +
      'with your statutory rights.\nORDER SUMMARY Sd VNOm N7S\nA Customer order ID:000-0000000-0000000dtVUd\nOrder Date: 20-0ct-2026\n' +
      'FREEjcollection sin store from MARKET SQUARE on\nFri. 23rd 0ct 2026 ne.auj9,28M ts bneqe ot Market Square,snob s 9stos\nAnytown, AB1 2CD 55ybUrihid 9si s bns GB\n' +
      '55667788 T12 Knit Gloves £10.00<\nBalance before Saving £25.00\nx*20% Knitwear*x £5.00\nItems:2 Balance to Pay £20.00\nqo6 e8Msr5\n' +
      'Gift Card xxx “xxx x**x xxxx 0000 £20.00\nNew Balancenso2 £o.00nelisqeston\nYour total saving today is £5.00',
    expect: { shop: 'M&S', date: '2026-10-20', items: [['Wool Scarf', 1500], ['Knit Gloves', 1000], ['20% Knitwear', -500]], total: 2000 },
  },
  {
    // The layout of a second real Asda receipt (v0.19.2), made up as above: the banner first, and the date under "home
    // delivery or collection in store", which is when it was bought, not a collection day.
    id: 'asda-delivery-line',
    text:
      '**×For a chance to win £1,000! xxx\nPlease tell us how we did today at\nwww.tellascda.com ASDA\nASDA STORES LTD\nWWW.ASDA.COM\nMANAGER A N OTHER\nAnytown,\n' +
      'ST. 00000P. ScoUser~TÉ.00 TR.0000\nKids Socks £4.00\nKids Gloves £3.00\nTUONOBHO\nTOTAL: £7.00\nNO.ITEMS SOLD 2\nGift Card -u£7.00\nTAX SUMMARY\n' +
      'Asda Gift Card Redemption\n0000000000000000\nExp. Date 01/3025\n£ 7.00\nBalance £ 0.00\nShop onl ine at Asda. com for easy home\ndel ivery or collection in store\n24/10/2026 15:10',
    expect: { shop: 'Asda', date: '2026-10-24', items: [['Kids Socks', 400], ['Kids Gloves', 300]], total: 700 },
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
    expect: { shop: 'BP Connect', date: '2026-10-18', items: [['Unleaded 32.41l', 4829]], total: 4829 },
  },
  // Written with the four above (v0.19.2), before the rules for them.
  {
    // An M&S receipt with no saving: its items alone make it a receipt, so it goes to your AI by itself.
    id: 'ms-no-saving',
    text: 'noy sgniht eht yud\nabcd evol\nwww.marksandspencer.com\n00333333 BANANAS £0.95<\n00444444 MILK 2PT £1.20<\nItems:2 Balance to Pay £2.15\nCard Tendered £2.15\n21/10/26 09:12 0000 000000 000 0000',
    expect: { shop: 'M&S', date: '2026-10-21', items: [['Bananas', 95], ['Milk 2pt', 120]], total: 215 },
  },
  {
    id: 'minus-before-pound',
    text: 'TESCO\nSUPERSTORE\nCOFFEE BEANS £4.50\nCc Price saving -£0.75\nOAT DRINK £1.60\nTOTAL £5.35\nVISA £5.35\n19/10/26 17:02',
    expect: { shop: 'Tesco Superstore', date: '2026-10-19', items: [['Coffee beans', 450], ['Cc Price saving', -75], ['Oat drink', 160]], total: 535 },
  },
  {
    id: 'asda-unseen',
    text: 'Tell us how we did\nASDA STORES LTD\nAnytown\n£0.85 CARROTS\nWHITE BREAD £1.10\n£2.00 Tea Towels\nTOTAL: £3.95\nNO. ITEMS SOLD 3\nGift Card £3.95\n22/10/2026 10:41',
    expect: { shop: 'Asda', date: '2026-10-22', items: [['Carrots', 85], ['White bread', 110], ['Tea Towels', 200]], total: 395 },
  },
  {
    id: 'shopping-list',
    text: 'Shopping list\noat milk\nrice\nchickpeas\nspinach\nbin bags',
    expect: null,
  },
]
