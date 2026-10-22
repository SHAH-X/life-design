import { describe, expect, it } from 'vitest'
import { focusFor, HELPERS_SHOWN, helpersPage, PURPOSE_KEYS, purposeInfo, type QuestionContext, questionsFor } from '../../src/domain/purposes'

describe('the seven purposes', () => {
  it('cover what journaling can be for, in plain words, each with a one-line hint', () => {
    expect(PURPOSE_KEYS.map((key) => purposeInfo(key).label)).toEqual([
      'Understand myself',
      'Improve myself',
      'Learn something',
      'Achieve a goal',
      'Make sense of a hard time',
      'Reflect on everyday life',
      'Write freely',
    ])
    for (const key of PURPOSE_KEYS) expect(purposeInfo(key).hint.length).toBeGreaterThan(10)
  })

  it('ask an optional follow-up where it helps, and none for a hard time, everyday life or free writing', () => {
    expect(purposeInfo('know').focus?.question).toBe('What would you most like to understand about yourself?')
    expect(purposeInfo('grow').focus?.question).toBe('What would you like to change or improve?')
    expect(purposeInfo('learn').focus?.question).toBe('What are you learning, and what would you like to understand better?')
    expect(purposeInfo('goal').focus?.question).toBe('What are you working towards?')
    for (const key of ['calm', 'joy', 'free'] as const) expect(purposeInfo(key).focus).toBeNull()
  })

  it('ask about a hard time gently, with no push for a lesson', () => {
    expect(purposeInfo('calm').gentle).toBe("Write only what feels okay. There doesn't have to be a lesson.")
  })
})

describe('questionsFor: the reflection questions for one entry', () => {
  const plain: QuestionContext = { energyEffect: null, during: [], after: [], turn: 0, goal: '' }
  const texts = (purpose: Parameters<typeof questionsFor>[0], context: QuestionContext) => questionsFor(purpose, context).map((q) => q.text)

  it('offer the purpose questions, in a set order for a first entry', () => {
    expect(texts('grow', plain)).toEqual([
      'What went well?',
      'What could you have handled differently?',
      'What made it easier or harder?',
      'What would you like to try next time?',
    ])
    expect(texts('calm', plain)).toEqual([
      'What happened, from your point of view?',
      'What thoughts or feelings did you notice?',
      "What was within your control, and what wasn't?",
      'What might help you respond differently, or move forward?',
    ])
  })

  it('take turns from one entry to the next, so the same question does not always come first', () => {
    expect(texts('grow', { ...plain, turn: 1 })[0]).toBe('What could you have handled differently?')
    expect(texts('grow', { ...plain, turn: 5 })[0]).toBe('What could you have handled differently?')
  })

  it('bring "what made it harder" forward when it used up your energy or felt hard', () => {
    expect(texts('grow', { ...plain, energyEffect: 'used' })[0]).toBe('What made it easier or harder?')
    expect(texts('know', { ...plain, after: ['Anxious'] })[0]).toBe('How did you feel, and what might have influenced that?')
  })

  it('ask what made it absorbing only when time flew', () => {
    expect(texts('know', { ...plain, during: ['Time flew'] })[0]).toBe('What made it so absorbing?')
    expect(texts('know', plain)).not.toContain('What made it so absorbing?')
  })

  it('name your goal when there is one', () => {
    expect(texts('goal', { ...plain, goal: 'Run a half marathon' })[0]).toBe('What progress did you make toward run a half marathon?')
    expect(texts('goal', plain)[0]).toBe('What progress did you make?')
  })

  it('ask nothing for free writing, and never the same question twice in an entry', () => {
    expect(questionsFor('free', plain)).toEqual([])
    for (const key of PURPOSE_KEYS) {
      const ids = questionsFor(key, { ...plain, during: ['Time flew'], energyEffect: 'used' }).map((q) => q.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })
})

describe('helpersPage: the questions shown above the writing box', () => {
  const context: QuestionContext = { energyEffect: null, during: [], after: [], turn: 0, goal: '' }

  it('shows three at a time, best first, and the next three on request, wrapping round', () => {
    const all = questionsFor('know', context)
    expect(all).toHaveLength(4) // the "time flew" question only comes when time flew
    expect(HELPERS_SHOWN).toBe(3)
    expect(helpersPage(all, 0).map((q) => q.id)).toEqual(['know-a', 'know-b', 'know-c'])
    expect(helpersPage(all, 1).map((q) => q.id)).toEqual(['know-d', 'know-a', 'know-b'])
  })

  it('shows all of them when there are three or fewer, and none for free writing', () => {
    const two = questionsFor('grow', context).slice(0, 2)
    expect(helpersPage(two, 0)).toEqual(two)
    expect(helpersPage(two, 5)).toEqual(two)
    expect(helpersPage(questionsFor('free', context), 0)).toEqual([])
  })
})

describe('focusFor: your own focus, shown with the helper questions', () => {
  const focus = { know: 'What kind of work suits me', grow: '  ', learn: 'Spanish', goal: 'Run a half marathon' }

  it('shows what you wrote for Understand myself, Improve myself or Learn something', () => {
    expect(focusFor('know', focus)).toBe('What kind of work suits me')
    expect(focusFor('learn', focus)).toBe('Spanish')
  })

  it('leaves out an empty answer, and the goal, which its questions already name', () => {
    expect(focusFor('grow', focus)).toBe('')
    expect(focusFor('goal', focus)).toBe('')
    expect(focusFor('calm', focus)).toBe('')
  })
})
