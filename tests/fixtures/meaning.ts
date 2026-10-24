import { type EnergyEffect, type Entry, entryDefaults } from '../../src/db/types'

// Fictional entries and questions for search by meaning (Phase A, 2026-10-24). Each question lists the entries a person
// would expect back, and a decoy that shares its words but not its meaning.

export function fakeEntry(id: string, activity: string, note: string, during: string[], after: string[], energyEffect: EnergyEffect | null = null): Entry {
  return {
    id,
    date: '2026-10-20',
    part: 'afternoon',
    activity,
    engagement: 3,
    energy: 0,
    flow: false,
    where: [],
    people: [],
    objects: [],
    during,
    after,
    note,
    source: 'quick',
    createdAt: 1,
    updatedAt: 1,
    ...entryDefaults(),
    energyEffect,
  }
}

const LONG_WRITING =
  'Sunday evening and I want to get the week out of my head. Monday started well: coffee with Sam, a good plan for the ' +
  'garden, the new shelves finally up in the hall. Tuesday the builders came about the roof and the quote was fine. ' +
  'Wednesday I took the long way to the station and noticed the cherry trees are out. Thursday was the dentist and ' +
  'then a slow afternoon sorting photos from the summer, which was lovely, all those beaches. Friday I cooked for ' +
  'the neighbours and we talked about their trip. But underneath all of it there is a heaviness I keep ignoring. ' +
  'Every morning I wake already tired, and by mid-afternoon I am running on fumes. I have stopped looking forward to ' +
  'anything at work; I just push through the hours and collapse on the sofa. I think I have been depleted for weeks ' +
  'and kept telling myself it was just a busy patch.'

export const MEANING_ENTRIES: Entry[] = [
  fakeEntry('e01', 'Quarterly report', 'Third late night in a row finishing the report. Running on empty, nothing left in the tank.', ['Focused'], ['Drained', 'Tired'], 'used'),
  fakeEntry('e02', 'Team meetings', "Back-to-back calls from nine to six. By the end I couldn't think straight and snapped at my partner.", ['Distracted'], ['Drained', 'Frustrated'], 'used'),
  fakeEntry('e03', 'Inbox', 'Spent the whole evening answering emails again. Exhausted, and I dread tomorrow.', ['Bored'], ['Tired', 'Stressed']),
  fakeEntry('e04', 'Cooking dinner', 'Burned the toast and the rice, but we laughed about it and ordered out.', ['Fine'], ['Happy']),
  fakeEntry('e05', 'Night out', 'Went out with friends for pizza and stayed late.', ['Time flew'], ['Happy', 'Connected'], 'gave'),
  fakeEntry('e06', 'Pottery class', 'Shaping a bowl on the wheel. I looked up and three hours had vanished.', ['Absorbed'], ['Fulfilled'], 'gave'),
  fakeEntry('e07', 'Side project', "Got lost in the puzzle of the sync bug and didn't notice it was dark outside.", ['Absorbed', 'Focused'], ['Satisfied']),
  fakeEntry('e08', 'Reading', "Couldn't put the novel down, read until 2am.", ['Absorbed'], ['Happy']),
  fakeEntry('e09', 'Timesheet', 'Filled in my timesheet for the month. Tedious.', ['Bored'], ['Neutral']),
  fakeEntry('e10', 'Call with my sister', 'We disagreed about who should look after Mum this weekend and both raised our voices.', ['Restless'], ['Frustrated', 'Sad'], 'used'),
  fakeEntry('e11', 'Dinner with my partner', 'A small thing about the dishes turned into a fight about everything.', ['Restless'], ['Frustrated']),
  fakeEntry('e12', 'Debate club', 'Watched a student debate on climate policy. Clever points on both sides.', ['Curious'], ['Inspired']),
  fakeEntry('e13', 'Hike', 'Walked the ridge trail above the lake, wind in my face, saw a heron.', ['Absorbed'], ['Calm', 'Energised'], 'gave'),
  fakeEntry('e14', 'Gardening', 'Planted tomatoes and weeded the vegetable beds all morning.', ['Focused'], ['Calm', 'Fulfilled']),
  fakeEntry('e15', 'Morning swim', 'Cold water in the sea, sunrise over the bay.', ['Challenged'], ['Energised'], 'gave'),
  fakeEntry('e16', 'Wine tasting', 'Tried three natural wines at the new bar downtown.', ['Curious'], ['Happy']),
  fakeEntry('e17', 'Sunday at home', 'Nobody called all day. Ate dinner in silence and scrolled my phone.', ['Bored'], ['Sad']),
  fakeEntry('e18', 'New city', "Walked around the neighbourhood. I don't know anyone here yet and it shows.", ['Restless'], ['Sad', 'Anxious']),
  fakeEntry('e19', 'Cinema on my own', 'Saw a film by myself and loved choosing any seat I wanted.', ['Absorbed'], ['Happy', 'Calm']),
  fakeEntry('e20', 'Sketching', 'Drew the old bridge in charcoal from a bench in the park.', ['Absorbed'], ['Fulfilled']),
  fakeEntry('e21', 'Guitar', 'Wrote a chorus and recorded a rough demo on my phone.', ['Time flew'], ['Inspired'], 'gave'),
  fakeEntry('e22', 'Client brief', "Read the agency's creative brief for the pitch. It was vague and contradicted itself.", ['Distracted'], ['Frustrated']),
  fakeEntry('e23', 'Rent', 'The landlord is raising the rent again. Went through the bank statements twice.', ['Restless'], ['Anxious', 'Stressed']),
  fakeEntry('e24', 'Car repair', "The garage quoted for a new gearbox. Not sure how we'll cover it this month.", ['Restless'], ['Anxious']),
  fakeEntry('e25', 'Houseplants', 'Repotted the money plant on the windowsill.', ['Fine'], ['Calm']),
  fakeEntry('e26', '10k race', 'Finished my first 10k without stopping.', ['Challenged'], ['Proud', 'Energised'], 'gave'),
  fakeEntry('e27', 'Board presentation', 'Presented the plan to the board and they approved all of it.', ['Focused'], ['Proud', 'Fulfilled']),
  fakeEntry('e28', 'Karaoke', 'Sang Proud Mary, badly, and everyone joined in.', ['Time flew'], ['Happy', 'Connected']),
  fakeEntry('e29', 'Grocery shopping', 'Weekly shop. The queue was long.', ['Bored'], ['Neutral']),
  fakeEntry('e30', 'Dentist', 'Check-up, no fillings needed.', ['Fine'], ['Calm']),
  { ...fakeEntry('e31', '', LONG_WRITING, [], []), kind: 'free' },
  fakeEntry('e32', 'Yoga', 'Gentle stretching class, breathed slowly.', ['Calm'], ['Calm']),
]

export const MEANING_QUESTIONS: { question: string; expected: string[]; decoy: string }[] = [
  { question: 'times I felt burned out', expected: ['e01', 'e02', 'e03', 'e31'], decoy: 'e04' },
  { question: 'when I lost track of time', expected: ['e06', 'e07', 'e08'], decoy: 'e09' },
  { question: 'arguments with people close to me', expected: ['e10', 'e11'], decoy: 'e12' },
  { question: 'being out in nature', expected: ['e13', 'e14', 'e15'], decoy: 'e16' },
  { question: 'feeling lonely', expected: ['e17', 'e18'], decoy: 'e19' },
  { question: 'making something creative', expected: ['e06', 'e20', 'e21'], decoy: 'e22' },
  { question: 'worries about money', expected: ['e23', 'e24'], decoy: 'e25' },
  { question: 'proud of what I achieved', expected: ['e26', 'e27'], decoy: 'e28' },
]
