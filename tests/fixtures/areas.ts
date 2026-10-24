import { type Entry, entryDefaults } from '../../src/db/types'

// A fictional journal for life areas (step 2, 2026-10-24): messy free writing as it comes, each with the areas a person
// would expect it in. `found:<topic>` is writing no starter area covers, which should form an area of its own; `none`
// is writing too slight to place. Two areas listed: either is right as its first, and both may be given.

export interface AreaCase {
  id: string
  text: string
  expect: readonly string[]
}

const cases = (prefix: string, expect: readonly string[], texts: readonly string[]): AreaCase[] =>
  texts.map((text, i) => ({ id: `${prefix}${String(i + 1).padStart(2, '0')}`, text, expect }))

export const AREA_CASES: AreaCase[] = [
  ...cases('money', ['money'], [
    'Closed the NVDA swing for +2.1R. Entry was late, I chased the breakout instead of waiting for the retest. Stop was fine. Next time wait for the 15 min close above the level.',
    'Trading review for the week: 7 trades, 3 winners. Two losses were revenge trades after the Tuesday stop-out. Position size too big on Thursday.',
    "Rent went up by 120 a month. Need to redo the budget, cut the subscriptions I don't use.",
    'Paid off the credit card finally. Zero balance, now start the emergency fund.',
    'Salary came in, moved 500 into the index fund and 200 into savings.',
    'Tax return due end of January, need to find the P60 and the receipts for the home office.',
    "Portfolio down 6% this month. Not panicking, the thesis hasn't changed, but I check the app too often.",
    'Electricity bill was 230 this quarter, almost double last year. Compare tariffs this weekend.',
    "Spent too much on takeaways again, 90 this week. I don't even enjoy half of them.",
    'Options expiry Friday. Rolled the covered calls out a month, collected the premium.',
    'Should I pay down the mortgage early or keep investing? The rate is 4.2%.',
  ]),
  ...cases('receipt', ['money', 'home'], ['Tesco: milk 1.45, eggs 2.10, sourdough 3.20, bananas 0.95, olive oil 6.50. Total 14.20, card.']),
  ...cases('work', ['work'], [
    'Manager moved the deadline up by a week without asking anyone. The whole team is annoyed.',
    'Performance review went better than expected. She said I should go for the senior role next cycle.',
    'Three hours of meetings and none of them needed me. Got nothing done on the actual project.',
    'Interview at the fintech startup: two rounds, system design and a chat with the founder.',
    'Presented the quarterly roadmap to the directors. Nervous at first but the questions were fair.',
    "Colleague took credit for my analysis in the standup. Didn't say anything, should have.",
    'Hired a new junior today, onboarding her next week. Need to write the onboarding doc.',
    'Client called at 7pm demanding changes to the contract. I need some boundaries.',
    "Thinking about leaving this job. The work is fine but there's no growth and the commute kills me.",
    'Finished the migration project two days early. Team lunch on Friday to celebrate.',
    'Asked for a raise. HR says the budget is frozen until April.',
    'Long day at the office sorting out the vendor invoices and the procurement backlog.',
  ]),
  ...cases('tech', ['tech'], [
    'React 19 notes: use() unwraps a promise inside render, works with Suspense. Actions replace most manual form state; useActionState returns [state, formAction, isPending].',
    'Bug of the day: an IndexedDB transaction auto-commits when you await a fetch inside it. Fix: do the network call first, then open the transaction.',
    "Docker cheat sheet: docker compose up -d, docker logs -f <container>, docker exec -it <container> sh. Volumes persist across rebuilds, bind mounts don't copy.",
    'Finished chapter 4 of Designing Data-Intensive Applications. Replication: leader-follower, multi-leader, leaderless. Quorums w + r > n.',
    'Spent the evening learning Rust ownership. The borrow checker finally clicked: one mutable reference or many immutable ones.',
    'Python: the free-threaded build drops the GIL. Need to test our numpy code on it.',
    'git rebase --onto main feature~3 feature moves the last three commits. Always check git log --graph first.',
    'Watched a lecture on transformers: attention is a weighted average of value vectors, weights from query-key dot products.',
    'Postgres: an index on (user_id, created_at) serves WHERE user_id = ? ORDER BY created_at DESC, not the other way round.',
    'Started the Spanish course, 20 minutes a day. The past tense is confusing.',
    'API docs for the payments provider: POST /v1/charges with amount in cents, idempotency key header required, webhooks retry for 3 days.',
    'Learned how to solder at the makerspace, made a small LED circuit.',
  ]),
  ...cases('mind', ['mindset'], [
    "I keep starting things and not finishing them. Maybe I'm scared of finding out I'm not good at them.",
    "Ugh. Everything feels pointless today. I'm tired of pretending I have it together.",
    'Noticed I talk to myself really harshly when I make a mistake. Would never talk to a friend like that.',
    "Feeling stuck. Same routine every day and I can't see where any of it leads.",
    'Read about stoicism: focus on what I can control. Tried it in traffic this morning and it actually helped.',
    "Anxious all afternoon for no reason I can name. Chest tight, mind racing.",
    'I want to be someone who keeps promises to myself. Starting small: phone out of the bedroom.',
    "Comparing myself to old classmates online again. Their lives look so sorted. I know it's a highlight reel.",
    'Proud of myself for saying no today without explaining for ten minutes.',
    'Why do I put off the things I care about most? Fear of it not being perfect, I think.',
    "Big realisation: I don't want the life I've been working towards. I want more time, not more stuff.",
    "Angry. Overwhelmed. Too many plates spinning and I'm dropping all of them.",
  ]),
  ...cases('health', ['health'], [
    "Slept 5 hours again. Woke at 3am and couldn't get back to sleep.",
    'Ran 5k in 27 minutes, best this year. Knees a bit sore.',
    'Doctor said the blood pressure is borderline. Less salt, more walking, check again in three months.',
    'Back pain is worse after sitting all day. Booked a physio.',
    'Tried intermittent fasting, skipped breakfast. Starving by 11 and grumpy.',
    'Gym: squats 3x5 at 80kg, bench 3x5 at 60kg. Felt strong.',
    'Caught the flu. Fever, aching, stayed in bed all day with tea.',
    'Cut out alcohol this month. Day 12, sleeping much better.',
    'Migraine all afternoon, had to lie down in a dark room.',
    'Ate vegetables with every meal this week and drank more water.',
    'Yoga class in the evening, my hips are so tight.',
    'Dentist: one filling needed, book in two weeks.',
  ]),
  ...cases('people', ['people'], [
    'Mum called, she sounds lonely since dad passed. Promised to visit more often.',
    "Argument with my partner about whose turn it is to cook. It wasn't about cooking.",
    "Coffee with an old school friend I hadn't seen for years. We picked up as if no time had passed.",
    "My brother didn't invite me to his birthday. Trying not to take it personally.",
    'Date night: tried the new Thai place, talked for hours. Feels like the start of something.',
    'Kids were wild at bedtime. Read three stories and finally they slept.',
    'My best friend is moving to Canada. Happy for her, sad for me.',
    "Felt left out at the group dinner, everyone had inside jokes I wasn't part of.",
    "Called grandma for her 90th. She told the same story twice and I didn't mind at all.",
    'We broke up. It was the right thing but the flat is so quiet.',
    'The neighbour helped me carry the sofa up the stairs, we ended up having a beer.',
    'My sister and I finally talked about the fight from last summer. Cleared the air.',
  ]),
  ...cases('home', ['home'], [
    'To do: fix the leaking tap, take the recycling out, renew the car insurance, return the parcel.',
    'Shopping list: oat milk, rice, chickpeas, spinach, washing-up liquid, bin bags.',
    'Deep cleaned the kitchen, defrosted the freezer. Took four hours.',
    'Boiler broke again. Engineer coming Thursday between 8 and 1.',
    'Painted the spare room sage green. Two coats, the ceiling still needs doing.',
    'Did the laundry, ironed shirts for the week, changed the bed sheets.',
    'Car MOT booked for the 14th, need to get the wiper blades replaced before.',
    'Assembled the flat-pack wardrobe. Two screws left over, no idea where they go.',
    'Renewed the passport online, need a new photo first.',
    'Garden: mowed the lawn, cut back the hedge, planted bulbs for spring.',
  ]),
  ...cases('pottery', ['found:pottery'], [
    "Pottery class: threw my first bowl on the wheel that didn't collapse. Centering the clay is everything.",
    'Glazed the mugs from last week in a celadon glaze, they go in the kiln on Saturday.',
    'Trimmed three bowls at the studio, one cracked when the clay dried too fast.',
    'Watched videos on pulling handles for mugs, going to try at the pottery studio tomorrow.',
  ]),
  ...cases('travel', ['found:travel'], [
    'Planning the Japan trip: Tokyo 4 nights, Kyoto 3, Osaka 2. Need the rail pass before we fly.',
    'Booked flights to Lisbon for May, found a little apartment in Alfama.',
    'Packing list for the trip: adapters, walking shoes, rain jacket, the guidebook.',
    'Last day in Rome. Walked from Trastevere to the Pantheon, gelato twice.',
  ]),
  ...cases('music', ['found:music'], [
    'Guitar practice: barre chords are finally ringing clean. F major still buzzes.',
    'Band rehearsal, we nailed the bridge of the new song. Gig in three weeks.',
    'Wrote a chorus on the piano tonight, recorded a voice memo so I don’t lose it.',
    'Practising the guitar solo slowed down to 60%, my fingers can almost keep up.',
  ]),
  ...cases('slight', ['none'], ['ok day.', 'Nothing much to say today.', 'Tuesday.']),
  ...cases('two-pm', ['people', 'money'], [
    "Another argument with my partner about money. I spent too much on the new bike and she's right.",
  ]),
  ...cases('two-tm', ['tech', 'money'], [
    'Wrote the Python script that parses my broker statements into a spreadsheet. Turns out I paid 340 in fees this year.',
  ]),
  ...cases('two-ph', ['people', 'health'], ["Mum's knee surgery went well. I'm staying with her this week while she learns to walk with the crutches."]),
  ...cases('two-wh', ['work', 'health'], [
    'The launch is on Monday and the whole team is working late every night. I have been answering messages from bed, missing the gym, ' +
      'and eating crisps for dinner at my desk. My manager keeps adding features and the scope is out of control. ' +
      'Last night I slept four hours and this morning my heart was racing before I had even had coffee. My back aches from the chair, ' +
      'my eyes hurt from the screen, and I have had a headache for three days. I need to see a doctor about the palpitations.',
  ]),
]

/** Written before the rules were tuned and never used to tune them: how well they do on writing they haven't seen. */
export const AREA_HOLDOUT: AreaCase[] = [
  ...cases('h-money', ['money'], [
    'Bought 20 shares of the ETF on the dip. Set a limit sell at 5% up.',
    'Gas, water and council tax all due the same week. Moving money from savings to cover it.',
    'Lost 400 on the EURUSD short. Ignored my own rule about trading the news.',
    'Got the bonus! Half goes to the house deposit fund.',
    'Cancelled the gym membership I never use, that is 45 a month back.',
  ]),
  ...cases('h-work', ['work'], [
    'Standup ran 40 minutes again. Nobody wants to say the sprint is behind.',
    'My manager asked me to lead the hiring for the new team. Exciting and a bit scary.',
    'Sent the proposal to the client at midnight. Hope they sign this week.',
    'Got feedback that my reports are too long. Fair, I ramble.',
    'Two-day offsite with the whole department. Workshops on strategy, too many sticky notes.',
  ]),
  ...cases('h-tech', ['tech'], [
    "TypeScript: 'satisfies' checks a value against a type without widening it. Handy for config objects.",
    "Kubernetes: a pod restarts on OOMKilled; raise the memory limit in the deployment's resources block.",
    'CSS grid: grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)) makes a responsive gallery.',
    'Finished the statistics course module on confidence intervals. Bootstrapping makes more sense than the formulas.',
    'Regex note: lookahead (?=...) matches without consuming. Use it to check a password has a digit.',
  ]),
  ...cases('h-mind', ['mindset'], [
    'Woke up with that heavy dread again. Nothing is wrong, and yet.',
    'I always assume people are annoyed with me. Today I asked instead of guessing, and they were not.',
    'Trying to accept that I can be good enough without being the best.',
    'So frustrated with myself for wasting the whole weekend scrolling.',
    "Journalling helps. Writing it down makes the worry smaller than it is in my head.",
  ]),
  ...cases('h-health', ['health'], [
    'Physio exercises for the shoulder, three sets of band pulls. Less clicking than last week.',
    'Blood test results back, vitamin D is low. Starting supplements.',
    'Walked 14,000 steps today, legs are tired.',
    'Too much coffee, heart fluttering, cutting back to two a day.',
    'Allergies terrible this week, sneezing nonstop, took an antihistamine.',
  ]),
  ...cases('h-people', ['people'], [
    "Dad's birthday dinner. He made a speech and teared up, never seen him do that.",
    'My daughter lost her first tooth and made me promise the tooth fairy is real.',
    'Friend cancelled on me for the third time. Starting to wonder if it is me.',
    'Long phone call with my cousin in Delhi, catching up on the whole family.',
    'Met her parents for the first time. They were lovely, I was a nervous wreck.',
  ]),
  ...cases('h-home', ['home'], [
    'Ordered a new washing machine, delivery Tuesday. Need to clear the space.',
    'Hoovered the stairs, cleaned the bathroom, wiped down the fridge.',
    'Mould in the bathroom corner again, need a dehumidifier.',
    'Called the council about the missed bin collection.',
  ]),
  ...cases('h-cooking', ['found:cooking'], [
    'Made fresh pasta from scratch, the dough was too dry at first, more egg fixed it.',
    'Tried a Thai green curry recipe, made my own paste with lemongrass and galangal.',
    'Baked sourdough, finally got a good ear on the crust. Long cold proof overnight.',
    'Slow-roasted a lamb shoulder with garlic and rosemary for six hours.',
  ]),
]

/** Long writing about two things, one after the other: read in two pieces (meaningChunks), so in both areas. */
export const LONG_TWO_AREAS: AreaCase = {
  id: 'long-money-health',
  expect: ['money', 'health'],
  text:
    'Trading review for October. I took 23 trades this month and only 9 of them were winners, but the winners were ' +
    'bigger than the losers, so the account is up 4 percent. The worst week was the one after the interest rate ' +
    'decision, when I kept adding to a losing position in the bank stocks instead of taking the stop. I broke my own ' +
    'rule about risking more than one percent of the account on a single trade three times. Next month I will set the ' +
    'stop loss before I enter, write down the reason for every trade, and stop checking the portfolio app at night. ' +
    'My body is another story. I have slept badly all month, five or six hours a night, and my lower back aches from ' +
    'sitting at the desk all day. I have not been to the gym once in three weeks and I keep skipping breakfast. The ' +
    'doctor said my blood pressure is up and I should walk every day, drink less coffee and get to bed before eleven. ' +
    'I booked a physio appointment for the back and bought running shoes.',
}

/** A case as free writing, the way the box saves it (FreeWrite.tsx). */
export function areaEntry(c: AreaCase, date = '2026-10-20'): Entry {
  return {
    id: c.id,
    date,
    part: 'afternoon',
    activity: '',
    engagement: 3,
    energy: 0,
    flow: false,
    where: [],
    people: [],
    objects: [],
    during: [],
    after: [],
    note: c.text,
    source: 'quick',
    createdAt: 1,
    updatedAt: 1,
    ...entryDefaults(),
    kind: 'free',
    purpose: 'free',
    skipped: ['engagement', 'energy'],
  }
}
